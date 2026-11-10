import { cache } from "react";
import { db, type Queryable } from "./db";

type Channel = "storefront" | "admin";

export async function readRevision(channel: Channel) {
  const { rows } = await db.query<{ revision: string }>(
    "SELECT value->>'revision' AS revision FROM settings WHERE id=$1",
    [`revision:${channel}`],
  );
  return rows[0]?.revision ?? "initial";
}

export const storefrontRevision = cache(() => readRevision("storefront"));

// The caller writes the marker in the same transaction as the change it represents.
export async function markChanged(q: Queryable, storefront = false) {
  const keys = storefront ? ["revision:admin", "revision:storefront"] : ["revision:admin"];
  await q.query(
    `INSERT INTO settings(id,value)
     SELECT id, jsonb_build_object('revision', $2::text) FROM unnest($1::text[]) AS id ORDER BY id
     ON CONFLICT(id) DO UPDATE SET value=EXCLUDED.value`,
    [keys, crypto.randomUUID()],
  );
}
