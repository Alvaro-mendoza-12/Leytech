import { createHmac, createPrivateKey, createPublicKey, hkdfSync, sign, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { AppError, audit, hash } from "./security";
import type { Admin } from "./types";

export const assistantLicenseInput = z.object({
  requestId: z.uuid(),
});

export const assistantRedeemInput = z.object({
  code: z.string().regex(/^LT2-[A-Za-z0-9_-]{32}$/),
  device: z.string().regex(/^EQ1-(?:[A-Z2-7]{6}-){3}[A-Z2-7]{6}$/),
  claim: z.string().regex(/^[a-f0-9]{64}$/),
});

function configuredSigner() {
  const secret = process.env.LEYTECH_ASSISTANT_SIGNING_KEY?.trim();
  const expected = process.env.LEYTECH_ASSISTANT_PUBLIC_KEY?.trim().toLowerCase();
  if (!secret || !expected || !/^[a-f0-9]{64}$/.test(expected)) return null;
  try {
    const key = createPrivateKey({ key: Buffer.from(secret, "base64"), format: "der", type: "pkcs8" });
    if (key.asymmetricKeyType !== "ed25519") return null;
    const publicDer = createPublicKey(key).export({ format: "der", type: "spki" });
    return publicDer.subarray(-32).toString("hex") === expected ? key : null;
  } catch {
    return null;
  }
}

export async function listAssistantLicenses() {
  if (!configuredSigner()) return { enabled: false, entries: [] };
  const { rows } = await db.query<{ id: string; redeemed_at: string | null; email: string; created_at: string }>(
    `SELECT l.id,l.value->>'redeemedAt' AS redeemed_at,
       a.email,l.value->>'issuedAt' AS created_at
     FROM settings l JOIN admins a ON a.id=l.value->>'issuedBy'
     WHERE l.id LIKE 'assistant:license:%' OR l.id LIKE 'assistant:purchase:%'
     ORDER BY (l.value->>'issuedAt')::timestamptz DESC,l.id LIMIT 30`,
  );
  return { enabled: true, entries: rows };
}

export async function issueAssistantLicense(input: z.infer<typeof assistantLicenseInput>, admin: Admin) {
  const key = configuredSigner();
  if (!key) throw new AppError("La emisión de licencias todavía no está habilitada.", 503);
  // A failed connection can repeat the request without creating another code.
  const licenseId = `assistant:license:${hash(`${admin.id}:${input.requestId}`)}`;
  const secret = Buffer.from(hkdfSync("sha256", key.export({ format: "der", type: "pkcs8" }),
    "", "Leytech Asistente activation codes v2", 32));
  const code = "LT2-" + createHmac("sha256", secret).update(licenseId).digest().subarray(0, 24).toString("base64url");
  const codeHash = hash(code);
  return db.transaction(async tx => {
    const inserted = await tx.query(
      `INSERT INTO settings(id,value) VALUES($1,jsonb_build_object(
         'codeHash',$2::text,'issuedBy',$3::text,'issuedAt',now()))
       ON CONFLICT(id) DO NOTHING RETURNING id`,
      [licenseId, codeHash, admin.id],
    );
    const created = inserted.rows.length > 0;
    if (!created) {
      const { rows: [existing] } = await tx.query<{ code_hash: string; redeemed_at: string | null }>(
        "SELECT value->>'codeHash' AS code_hash,value->>'redeemedAt' AS redeemed_at FROM settings WHERE id=$1",
        [licenseId],
      );
      if (existing?.redeemed_at) throw new AppError("Ese código ya fue utilizado. Genera una licencia nueva.", 409);
      if (existing?.code_hash !== codeHash) throw new AppError("La clave de emisión cambió. Contacta al administrador.", 409);
    } else {
      await tx.query("INSERT INTO settings(id,value) VALUES($1,jsonb_build_object('licenseId',$2::text))",
        [`assistant:code:${codeHash}`, licenseId]);
      await audit(admin.id, "assistant.license_issued", licenseId, {}, tx);
    }
    return { code, created };
  });
}

export async function redeemAssistantLicense(input: z.infer<typeof assistantRedeemInput>) {
  const key = configuredSigner();
  if (!key) throw new AppError("La activación aún no está disponible. Contacta a Leytech.", 503);
  return db.transaction(async tx => {
    const codeId = `assistant:code:${hash(input.code)}`;
    const proof = hash(input.claim);
    const { rows: [license] } = await tx.query<{ id: string; device: string | null; claim_hash: string | null }>(
      `SELECT l.id,l.value->>'device' AS device,l.value->>'claimHash' AS claim_hash
       FROM settings link JOIN settings l ON l.id=coalesce(link.value->>'licenseId',link.value->>'purchaseId')
       WHERE link.id=$1 AND (l.id LIKE 'assistant:license:%' OR l.id LIKE 'assistant:purchase:%') FOR UPDATE OF l`,
      [codeId],
    );
    if (!license) throw new AppError("El código no es válido.", 404);
    if (license.claim_hash) {
      // A retry with the original proof can recover a response lost in transit.
      if (license.device !== input.device || !timingSafeEqual(Buffer.from(license.claim_hash), Buffer.from(proof))) {
        throw new AppError("Este código ya fue utilizado.", 409);
      }
    } else {
      await tx.query(
        `UPDATE settings SET value=value || jsonb_build_object(
           'device',$2::text,'claimHash',$3::text,'redeemedAt',now()) WHERE id=$1`,
        [license.id, input.device, proof],
      );
    }
    const message = Buffer.from("Leytech Asistente receipt v2\0" + input.device, "ascii");
    return { receipt: "LA2-" + sign(null, message, key).toString("base64url") };
  });
}
