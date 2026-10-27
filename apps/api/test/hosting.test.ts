import { test } from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountFrontend, mountStorage, storageProxy } from "../src/hosting.js";

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("proxy mantém assinatura/stream e host fixo; não encaminha credenciais da sessão", async () => {
  let received:
    | {
        url?: string;
        method?: string;
        headers: http.IncomingHttpHeaders;
        body: Buffer;
      }
    | undefined;
  const upstream = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks),
    };
    res.setHeader("content-type", "image/png");
    res.setHeader("set-cookie", "not-forwarded=true");
    res.setHeader("location", "http://private-storage/internal");
    res.end(req.method === "GET" ? Buffer.from("image") : undefined);
  });
  const target = await listen(upstream);
  const app = express();
  app.use("/storage", storageProxy(target, "checklist-photos"));
  const server = http.createServer(app),
    origin = await listen(server);
  try {
    const query =
      "X-Amz-Signature=test%2Bsignature&X-Amz-Credential=access%2Fscope";
    const bytes = Buffer.alloc(128 * 1024, 42);
    const response = await fetch(
      `${origin}/storage/checklist-photos/lojas/test.png?${query}`,
      {
        method: "PUT",
        headers: {
          "content-type": "image/png",
          authorization: "Bearer should-not-leave-app",
          cookie: "private-session=true",
          "x-forwarded-host": "attacker.example",
        },
        body: bytes,
      },
    );
    assert.equal(response.status, 200);
    assert.ok(received);
    assert.equal(received.url, `/checklist-photos/lojas/test.png?${query}`);
    assert.equal(received.headers.host, new URL(target).host);
    assert.equal(received.headers.authorization, undefined);
    assert.equal(received.headers.cookie, undefined);
    assert.equal(received.headers["x-forwarded-host"], undefined);
    assert.deepEqual(received.body, bytes);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("location"), null);
    const read = await fetch(
      `${origin}/storage/checklist-photos/lojas/test.png?${query}`,
    );
    assert.equal(await read.text(), "image");
    assert.equal(
      (
        await fetch(
          `${origin}/storage/checklist-photos/lojas/test.png?${query}`,
          { method: "HEAD" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await fetch(`${origin}/storage/another-bucket/test.png?${query}`))
        .status,
      404,
    );
    assert.equal(
      (await fetch(`${origin}/storage/checklist-photos?${query}`)).status,
      404,
    );
    assert.equal(
      (
        await fetch(
          `${origin}/storage/checklist-photos/lojas/test.png?${query}`,
          { method: "DELETE" },
        )
      ).status,
      405,
    );
  } finally {
    await close(server);
    await close(upstream);
  }
});

test("configuração do proxy não aceita credenciais ou URL com caminho", () => {
  assert.throws(() =>
    storageProxy("http://user:password@storage:8333", "checklist-photos"),
  );
  assert.throws(() =>
    storageProxy("http://storage:8333/arbitrary", "checklist-photos"),
  );
  assert.throws(() => storageProxy("file:///tmp/storage", "checklist-photos"));
});

test("hosting serve SPA e service worker sem mascarar API/storage ou asset ausente", async () => {
  const directory = await mkdtemp(join(tmpdir(), "checklist-hosting-"));
  await writeFile(
    join(directory, "index.html"),
    "<!doctype html><title>Checklist SPA</title>",
  );
  await writeFile(
    join(directory, "sw.js"),
    'self.addEventListener("install",()=>{});',
  );
  const app = express();
  mountStorage(app, {
    webDistDir: directory,
    storageEndpoint: "http://127.0.0.1:1",
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  mountFrontend(app, { webDistDir: directory });
  app.use((_req, res) => res.status(404).json({ message: "Não encontrado" }));
  const server = http.createServer(app),
    origin = await listen(server);
  try {
    assert.match(await (await fetch(origin)).text(), /Checklist SPA/);
    assert.match(
      await (await fetch(`${origin}/checklists`)).text(),
      /Checklist SPA/,
    );
    assert.deepEqual(await (await fetch(`${origin}/api/health`)).json(), {
      status: "ok",
    });
    assert.equal((await fetch(`${origin}/api/missing`)).status, 404);
    assert.equal((await fetch(`${origin}/storage`)).status, 404);
    assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
    const sw = await fetch(`${origin}/sw.js`);
    assert.equal(sw.headers.get("service-worker-allowed"), "/");
    assert.equal(sw.headers.get("cache-control"), "no-cache");
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
