import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { db, type Queryable } from "./db";
import type { Admin } from "./types";
import {trustedOrigins} from './site';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const original = Buffer.from(key, "hex");
  const check = scryptSync(password, salt, 64);
  return original.length === check.length && timingSafeEqual(original, check);
}
export async function sessionAdmin(token?: string) {
  if (!token || token.length !== 64) return null;
  return (
    (
      await db.query<Admin>(
        `SELECT a.id,a.email,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true`,
        [hash(token)],
      )
    ).rows[0] || null
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !trustedOrigins().has(origin))
    throw new AppError("Origen de la solicitud no permitido.", 403);
}
export async function rateLimit(
  request: Request,
  scope: string,
  limit = 25,
  seconds = 60,
  identity = "",
) {
  const ip =
    (process.env.VERCEL === "1" || process.env.TRUST_PROXY === "true")
      ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        "unknown"
      : "local";
  const key = hash(`${scope}:${ip}:${identity}`);
  const { rows } = await db.query<{ attempts: number }>(
    `INSERT INTO rate_limits(key,attempts,resets_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN rate_limits.resets_at<now() THEN 1 ELSE rate_limits.attempts+1 END,resets_at=CASE WHEN rate_limits.resets_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.resets_at END RETURNING attempts`,
    [key, seconds],
  );
  if (rows[0].attempts > limit)
    throw new AppError(
      "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
      429,
    );
}
export async function audit(
  adminId: string,
  action: string,
  entityId: string,
  detail: unknown = {},
  q: Queryable = db,
) {
  await q.query(
    "INSERT INTO audit_log(id,admin_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)",
    [crypto.randomUUID(), adminId, action, entityId, JSON.stringify(detail)],
  );
}
export async function jsonBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("La solicitud está vacía.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 150000) {
      await reader.cancel();
      throw new AppError("La solicitud es demasiado grande.", 413);
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("El formato de la solicitud no es válido.");
  }
}
