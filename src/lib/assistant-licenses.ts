import { createHmac, createPrivateKey, createPublicKey, hkdfSync, sign, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, type Queryable } from "./db";
import { orderCode, quoteCode } from "./format";
import { AppError, audit, hash } from "./security";
import type { Admin } from "./types";

export const assistantLicenseInput = z.object({
  reference: z.string().trim().toUpperCase().regex(/^(COT|PED)-[0-9]{1,18}$/, "Usa la referencia COT o PED de la tienda."),
  confirmed: z.literal(true, { error: "Confirma que verificaste el pago y que la compra incluye el asistente." }),
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

type Purchase = { key: string; reference: string };

async function findPurchase(reference: string, tx: Queryable): Promise<Purchase> {
  const [prefix, code] = reference.split("-");
  if (prefix === "COT") {
    const { rows: [quote] } = await tx.query<{ id: string; code: string; order_status: string | null }>(
      `SELECT q.id,q.code,o.status AS order_status FROM quotes q
       LEFT JOIN orders o ON o.quote_id=q.id WHERE q.code=$1
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.items) item WHERE item->>'isDemo' IS DISTINCT FROM 'true')`,
      [code],
    );
    if (!quote) throw new AppError("La cotización no existe o solo contiene productos de demostración.", 404);
    if (quote.order_status && quote.order_status !== "paid") {
      throw new AppError("El pedido vinculado debe estar pagado para emitir su licencia.", 409);
    }
    return { key: `quote:${quote.id}`, reference: quoteCode(quote.code) };
  }
  const { rows: [order] } = await tx.query<{ id: string; code: string; status: string; quote_id: string | null; quote_code: string | null }>(
    `SELECT o.id,o.code,o.status,o.quote_id,q.code AS quote_code
     FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id WHERE o.code=$1 AND NOT o.is_demo`,
    [code],
  );
  if (!order) throw new AppError("El pedido no existe o es una demostración.", 404);
  if (order.status !== "paid") throw new AppError("El pedido debe estar pagado para emitir su licencia.", 409);
  if (order.quote_id && order.quote_code) {
    return { key: `quote:${order.quote_id}`, reference: quoteCode(order.quote_code) };
  }
  return { key: `order:${order.id}`, reference: orderCode(order.code) };
}

export async function listAssistantLicenses() {
  if (!configuredSigner()) return { enabled: false, entries: [] };
  const { rows } = await db.query<{ reference: string; redeemed_at: string | null; email: string; created_at: string }>(
    `SELECT l.value->>'reference' AS reference,l.value->>'redeemedAt' AS redeemed_at,
       a.email,l.value->>'issuedAt' AS created_at
     FROM settings l JOIN admins a ON a.id=l.value->>'issuedBy'
     WHERE l.id LIKE 'assistant:purchase:%'
     ORDER BY (l.value->>'issuedAt')::timestamptz DESC,l.id LIMIT 30`,
  );
  return { enabled: true, entries: rows };
}

export async function issueAssistantLicense(input: z.infer<typeof assistantLicenseInput>, admin: Admin) {
  const key = configuredSigner();
  if (!key) throw new AppError("La emisión de licencias todavía no está habilitada.", 503);
  return db.transaction(async tx => {
    const purchase = await findPurchase(input.reference, tx);
    const purchaseId = `assistant:purchase:${purchase.key}`;
    const secret = Buffer.from(hkdfSync("sha256", key.export({ format: "der", type: "pkcs8" }),
      "", "Leytech Asistente activation codes v2", 32));
    const code = "LT2-" + createHmac("sha256", secret).update(purchase.key).digest().subarray(0, 24).toString("base64url");
    const codeHash = hash(code);
    const inserted = await tx.query(
      `INSERT INTO settings(id,value) VALUES($1,jsonb_build_object(
         'reference',$2::text,'codeHash',$3::text,'issuedBy',$4::text,'issuedAt',now()))
       ON CONFLICT(id) DO NOTHING RETURNING id`,
      [purchaseId, purchase.reference, codeHash, admin.id],
    );
    const created = inserted.rows.length > 0;
    if (!created) {
      const { rows: [existing] } = await tx.query<{ code_hash: string; redeemed_at: string | null }>(
        "SELECT value->>'codeHash' AS code_hash,value->>'redeemedAt' AS redeemed_at FROM settings WHERE id=$1",
        [purchaseId],
      );
      if (existing?.redeemed_at) throw new AppError("El código de esta compra ya fue utilizado.", 409);
      if (existing?.code_hash !== codeHash) throw new AppError("La clave de emisión cambió. Contacta al administrador.", 409);
    } else {
      // The second key lets redemption find the purchase by its hashed code.
      await tx.query("INSERT INTO settings(id,value) VALUES($1,jsonb_build_object('purchaseId',$2::text))",
        [`assistant:code:${codeHash}`, purchaseId]);
      await audit(admin.id, "assistant.license_issued", purchase.reference, { paymentConfirmed: true }, tx);
    }
    return { code, reference: purchase.reference, created };
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
       FROM settings link JOIN settings l ON l.id=link.value->>'purchaseId'
       WHERE link.id=$1 AND l.id LIKE 'assistant:purchase:%' FOR UPDATE OF l`,
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
