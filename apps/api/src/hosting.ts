import express, { type Express, type RequestHandler } from "express";
import http from "node:http";
import https from "node:https";
import { resolve } from "node:path";

interface HostingOptions {
  webDistDir?: string;
  storageEndpoint?: string;
  storageBucket?: string;
}

const requestHeaderNames = [
  "content-type",
  "content-length",
  "range",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "x-amz-content-sha256",
  "x-amz-checksum-crc32",
  "x-amz-checksum-crc32c",
  "x-amz-checksum-sha1",
  "x-amz-checksum-sha256",
  "x-amz-sdk-checksum-algorithm",
];
const responseHeaderNames = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "content-disposition",
];

/** The only destination comes from server configuration, never from the request. */
export function storageProxy(
  endpointValue: string,
  bucket: string,
): RequestHandler {
  const endpoint = new URL(endpointValue);
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      "S3_ENDPOINT deve ser uma origem HTTP(S), sem caminho ou credenciais.",
    );
  }
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(bucket))
    throw new Error("S3_BUCKET inválido.");
  const transport = endpoint.protocol === "https:" ? https : http;

  return (req, res) => {
    if (!["GET", "HEAD", "PUT"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD, PUT");
      res.status(405).json({ message: "Método não permitido." });
      return;
    }
    // Keep the raw path and signed query unchanged when forwarding. Decode only
    // for allowlist validation, rejecting traversal and any different bucket.
    const rawPath = req.url;
    let pathname: string;
    try {
      pathname = decodeURIComponent(rawPath.split("?", 1)[0]);
    } catch {
      res.status(400).json({ message: "Caminho de foto inválido." });
      return;
    }
    const prefix = `/${bucket}/`;
    if (
      !pathname.startsWith(prefix) ||
      pathname.length === prefix.length ||
      pathname.includes("\\") ||
      pathname.split("/").some((part) => part === ".." || part === ".")
    ) {
      res.status(404).json({ message: "Foto não encontrada." });
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > 15 * 1024 * 1024) {
      res.status(413).json({ message: "Escolha uma foto de até 15 MB." });
      return;
    }
    const headers: http.OutgoingHttpHeaders = { host: endpoint.host };
    for (const name of requestHeaderNames)
      if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    const upstream = transport.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        method: req.method,
        path: rawPath,
        headers,
      },
      (response) => {
        res.statusCode = response.statusCode ?? 502;
        for (const name of responseHeaderNames)
          if (response.headers[name] !== undefined)
            res.setHeader(name, response.headers[name]!);
        res.setHeader("Cache-Control", "private, no-store");
        response.on("error", () => res.destroy());
        response.pipe(res);
      },
    );
    upstream.setTimeout(60_000, () =>
      upstream.destroy(new Error("Storage timeout")),
    );
    upstream.on("error", () => {
      // Never log the URL: its query contains the temporary S3 credentials.
      if (!res.headersSent)
        res
          .status(502)
          .json({
            message: "Não foi possível acessar a foto. Tente novamente.",
          });
      else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.pipe(upstream);
  };
}

/** Call before JSON parsing; upload bodies must remain binary streams. */
export function mountStorage(app: Express, options: HostingOptions = {}) {
  if (!(options.webDistDir ?? process.env.WEB_DIST_DIR)) return;
  app.use(
    "/storage",
    storageProxy(
      options.storageEndpoint ??
        process.env.S3_ENDPOINT ??
        "http://localhost:8333",
      options.storageBucket ?? process.env.S3_BUCKET ?? "checklist-photos",
    ),
  );
}

/** Call after the API routes so an SPA fallback never masks an API error. */
export function mountFrontend(app: Express, options: HostingOptions = {}) {
  const configured = options.webDistDir ?? process.env.WEB_DIST_DIR;
  if (!configured) return;
  const directory = resolve(configured);
  app.use(
    express.static(directory, {
      index: false,
      dotfiles: "deny",
      setHeaders(res, path) {
        if (
          /\/(?:sw\.js|registerSW\.js|manifest\.webmanifest|index\.html)$/.test(
            path,
          )
        ) {
          res.setHeader("Cache-Control", "no-cache");
        }
        if (path.endsWith("/sw.js"))
          res.setHeader("Service-Worker-Allowed", "/");
      },
    }),
  );
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) ||
      /^\/(?:api|storage)(?:\/|$)/.test(req.path) ||
      req.path.split("/").pop()?.includes(".") ||
      !req.accepts("html")
    ) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(resolve(directory, "index.html"));
  });
}
