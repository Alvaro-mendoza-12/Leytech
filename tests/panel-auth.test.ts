import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { db } from "../src/lib/db";
import { addSupabaseAdmin, authenticateAdmin } from "../src/lib/panel-auth";

process.env.PGLITE_PATH = ":memory:";
process.env.STORAGE_SUPABASE_URL = "https://fixture.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

before(async () => db.exec(await fs.readFile("migrations/001_initial.sql", "utf8")));
after(async () => db.close());

function identity(email: string, id = crypto.randomUUID(), created_at = "2025-02-01T00:00:00Z") {
  return { email, id, created_at, email_confirmed_at: "2025-02-01T00:00:00Z" };
}

test("Supabase: autentica solo la identidad vinculada y respeta la desactivación del panel", async t => {
  const user = identity("vinculada@example.test");
  const admin = await addSupabaseAdmin(user.email, user.id, "staff");
  assert.ok(admin);
  const provider = t.mock.method(globalThis, "fetch", async () => Response.json({ user, expires_in: 1800 }));
  const login = await authenticateAdmin(user.email, "contraseña de Supabase");
  assert.equal(login?.admin.id, admin.id);
  assert.equal(login?.expiresIn, 1800);
  provider.mock.mockImplementation(async () => Response.json({ user: identity(user.email), expires_in: 3600 }));
  assert.equal(await authenticateAdmin(user.email, "contraseña ajena"), null);
  await db.query("UPDATE admins SET active=false WHERE id=$1", [admin.id]);
  assert.equal(await authenticateAdmin(user.email, "contraseña de Supabase"), null);
  assert.equal(await addSupabaseAdmin("otro@example.test", user.id, "staff"), null);
});

test("Supabase: el acceso automático exige registro cerrado, cuenta nueva y rol de personal", async t => {
  let signupDisabled = false;
  let anonymous = true;
  let user = identity("nueva@example.test", undefined, "2025-01-01T00:00:00Z");
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) =>
    Response.json(url.endsWith("/settings") ? { disable_signup: signupDisabled, external: { anonymous_users: anonymous } } : { user, expires_in: 3600 }),
  );
  assert.equal(await authenticateAdmin(user.email, "contraseña de Supabase"), null);
  assert.equal(fetchMock.mock.callCount(), 0);
  await db.query("INSERT INTO settings(id,value) VALUES('auth:auto-staff',$1)", [JSON.stringify({ start: "2025-01-15T00:00:00Z" })]);
  assert.equal(await authenticateAdmin(user.email, "contraseña de Supabase"), null);
  user = identity(user.email);
  assert.equal(await authenticateAdmin(user.email, "contraseña de Supabase"), null);
  signupDisabled = true;
  assert.equal(await authenticateAdmin(user.email, "contraseña de Supabase"), null);
  anonymous = false;
  const login = await authenticateAdmin(user.email, "contraseña de Supabase");
  assert.equal(login?.admin.role, "staff");
  assert.equal(login?.admin.auth_id, user.id);
});
