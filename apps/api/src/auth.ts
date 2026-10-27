import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { User } from "@checklist/shared";
import { pool } from "./db.js";
import { HttpError } from "./errors.js";
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET precisa ter ao menos 32 caracteres.");
  return secret;
}
export function userFromRow(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role_id,
    storeId: row.store_id,
    storeName: row.store_name ?? null,
  };
}
export function signSession(user: User) {
  return {
    token: jwt.sign({}, jwtSecret(), {
      subject: user.id,
      expiresIn: "24h",
      issuer: "checklist-api",
      audience: "checklist-app",
      algorithm: "HS256",
    }),
    user,
  };
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    if (!token) throw new HttpError(401, "Entre na sua conta para continuar.");
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret(), {
        algorithms: ["HS256"],
        issuer: "checklist-api",
        audience: "checklist-app",
      }) as jwt.JwtPayload;
    } catch {
      throw new HttpError(
        401,
        "Sua sessão expirou. Entre novamente para enviar os dados salvos.",
      );
    }
    const { rows } = await pool.query(
      "SELECT u.*, s.name AS store_name FROM users u LEFT JOIN stores s ON s.id=u.store_id WHERE u.id=$1 AND u.active AND (s.id IS NULL OR s.active)",
      [payload.sub],
    );
    if (!rows[0])
      throw new HttpError(401, "Conta indisponível. Fale com o administrador.");
    req.user = userFromRow(rows[0]);
    next();
  } catch (error) {
    next(error);
  }
}
export function adminOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== "admin")
    next(new HttpError(403, "Somente administradores podem fazer isso."));
  else next();
}
export function managerOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== "manager")
    next(new HttpError(403, "Somente o gerente da loja pode fazer isso."));
  else next();
}
