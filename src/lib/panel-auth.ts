import { randomBytes } from "node:crypto";
import { db, type Queryable } from "./db";
import { audit, hashPassword, verifyPassword } from "./security";
import { publicSignupDisabled, signInWithSupabase } from "./supabase-auth";
import type { Admin } from "./types";

type LoginAccount = Admin & { active: boolean; password_hash: string; auth_id: string | null };
const dummyHash = "00000000000000000000000000000000:" + "00".repeat(64);

async function loginAccount(email: string, q: Queryable = db) {
  return (await q.query<LoginAccount>(
    `SELECT a.id,a.email,a.role,a.active,a.password_hash,link.value->>'userId' AS auth_id
     FROM admins a LEFT JOIN settings link ON link.id='auth:admin:' || a.id WHERE a.email=$1`,
    [email],
  )).rows[0];
}

export async function addSupabaseAdmin(email: string, userId: string, role: Admin["role"], actor?: string, automaticSince?: string) {
  return db.transaction(async tx => {
    if (automaticSince) {
      const { rows } = await tx.query<{ start: string }>(
        "SELECT value->>'start' AS start FROM settings WHERE id='auth:auto-staff' FOR UPDATE",
      );
      if (rows[0]?.start !== automaticSince) return null;
    }
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`auth:identity:${userId}`]);
    const existing = await tx.query(
      "SELECT id FROM settings WHERE id LIKE 'auth:admin:%' AND value->>'userId'=$1",
      [userId],
    );
    if (existing.rows.length) return null;
    const id = crypto.randomUUID();
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO admins(id,email,password_hash,role) VALUES($1,$2,$3,$4)
       ON CONFLICT(email) DO NOTHING RETURNING id`,
      [id, email, hashPassword(randomBytes(32).toString("base64url")), role],
    );
    if (!rows.length) return null;
    await tx.query("INSERT INTO settings(id,value) VALUES($1,$2)", [`auth:admin:${id}`, JSON.stringify({ userId })]);
    await audit(actor || id, "user.created", id, { provider: "supabase" }, tx);
    return { id, email, role };
  });
}

export async function authenticateAdmin(email: string, password: string) {
  let account = await loginAccount(email);
  if (account && !account.active) return null;
  if (!account?.auth_id && verifyPassword(password, account?.password_hash || dummyHash) && account) {
    return { admin: account, expiresIn: 28800 };
  }
  if (account && !account.auth_id) return null;

  let autoStart: string | undefined;
  if (!account) {
    const { rows } = await db.query<{ start: string }>(
      "SELECT value->>'start' AS start FROM settings WHERE id='auth:auto-staff'",
    );
    autoStart = rows[0]?.start;
    if (!autoStart || !Number.isFinite(Date.parse(autoStart))) return null;
  }

  const supabase = await signInWithSupabase(email, password);
  if (!supabase) return null;
  if (!account) {
    // Accounts created before signup was closed require explicit owner approval.
    const createdAt = Date.parse(supabase.identity.created_at);
    if (!autoStart || !Number.isFinite(createdAt) || createdAt < Date.parse(autoStart) || !(await publicSignupDisabled())) return null;
    await addSupabaseAdmin(email, supabase.identity.id, "staff", undefined, autoStart);
    account = await loginAccount(email);
  }
  if (!account?.active || account.auth_id !== supabase.identity.id) return null;
  return { admin: account, expiresIn: supabase.expiresIn };
}
