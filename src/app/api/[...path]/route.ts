import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { products, categories, settings } from "@/lib/catalog";
import {
  createQuote,
  createOrder,
  snapshot,
  expireOrders,
  createOrderFromQuote,
} from "@/lib/commerce";
import { paymentPreference, handleWebhook } from "@/lib/payments";
import {
  sessionAdmin,
  checkOrigin,
  rateLimit,
  AppError,
  jsonBody,
  verifyPassword,
  hashPassword,
  hash,
  audit,
} from "@/lib/security";
import { settingsSchema, claimSchema, cartSchema } from "@/lib/validation";
import { saveProduct, updateOrder } from "@/lib/admin";
import type { Admin, Order } from "@/lib/types";
import { uploadObject } from "@/lib/storage";
import { markChanged, readRevision } from "@/lib/revisions";
import { addSupabaseAdmin, authenticateAdmin } from "@/lib/panel-auth";
import { confirmedSupabaseUser, publicSignupDisabled } from "@/lib/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function requireOnlineOrders() {
  if ((await settings()).orderChannel !== "online")
    throw new AppError("Las compras y los pagos se coordinan directamente por WhatsApp.", 410);
}
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const segments = (await context.params).path;
    const resource = segments.join("/");
    const method = request.method;
    if (resource === "payments/webhook" && method === "POST") {
      await requireOnlineOrders();
      await handleWebhook(request);
      return ok({ received: true });
    }
    if (method !== "GET") checkOrigin(request);
    if (resource === "store/revision" && method === "GET") {
      return ok({ revision: await readRevision("storefront") });
    }
    if (resource === "catalog/suggestions" && method === "GET") {
      const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 120);
      if (q.length < 2) return ok({ items: [] });
      const result = await products({ q, limit: 6 });
      return ok({ items: result.products.map(p => ({
        slug: p.slug, name: p.name, category: p.category_name,
        image: p.images[0] || "/images/placeholder.svg", price: p.min_price, sample: p.is_demo,
      })) });
    }
    if (resource === "catalog" && method === "GET") {
      const url = new URL(request.url);
      return ok(
        await products({
          q: url.searchParams.get("q") || "",
          category: url.searchParams.get("categoria") || "",
        }),
      );
    }
    if (resource === "cart/validate" && method === "POST") {
      await rateLimit(request, "cart", 100);
      const input = cartSchema.parse(await jsonBody(request));
      const adjustToStock = new URL(request.url).searchParams.get("adjust") === "1";
      const items = await snapshot(input, db, { allowSamples: true, adjustToStock });
      return ok({
        items,
        adjusted: items.reduce((sum, item) => sum + item.quantity, 0) !== input.items.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
      });
    }
    if (resource === "quotes" && method === "POST") {
      await rateLimit(request, "quote", 15);
      return ok(await createQuote(await jsonBody(request)), 201);
    }
    if (resource === "orders" && method === "POST") {
      await requireOnlineOrders();
      await rateLimit(request, "order", 15);
      const order = await createOrder(await jsonBody(request));
      let paymentUrl: string | null = null;
      try {
        paymentUrl = await paymentPreference(order);
      } catch {
        return ok(
          {
            token: order.public_token,
            code: order.code,
            paymentError:
              "El pedido se guardó, pero el proveedor no está disponible. Puedes reintentar el pago desde el pedido.",
          },
          201,
        );
      }
      return ok(
        { token: order.public_token, code: order.code, paymentUrl },
        201,
      );
    }
    if (resource === "orders/payment" && method === "POST") {
      await requireOnlineOrders();
      await rateLimit(request, "payment-retry", 10);
      const d = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .parse(await jsonBody(request));
      await expireOrders();
      const order = (
        await db.query<Order>("SELECT * FROM orders WHERE public_token=$1", [
          d.token,
        ])
      ).rows[0];
      if (
        !order ||
        order.status !== "pending" ||
        order.method !== "mercadopago"
      )
        throw new AppError("El pedido no acepta pagos.", 409);
      return ok({ url: await paymentPreference(order) });
    }
    if (resource === "claims" && method === "POST") {
      await rateLimit(request, "claims", 5, 3600);
      const data = claimSchema.parse(await jsonBody(request));
      const code = await db.transaction(async (tx) => {
        const { rows } = await tx.query<{ code: string }>(
          "INSERT INTO claims(id,customer,type,description,request) VALUES($1,$2,$3,$4,$5) RETURNING code",
          [
            crypto.randomUUID(),
            JSON.stringify({
              name: data.name,
              email: data.email,
              phone: data.phone,
              document: data.document,
              address: data.address,
            }),
            data.type,
            data.description,
            data.request,
          ],
        );
        await markChanged(tx);
        return rows[0].code;
      });
      return ok({ code: `REC-${String(code).padStart(5, "0")}` }, 201);
    }
    if (resource === "auth/login" && method === "POST") {
      const data = z
        .object({
          email: z.email().max(150),
          password: z.string().min(1).max(200),
        })
        .parse(await jsonBody(request));
      await rateLimit(request, "login-global", 30, 900);
      await rateLimit(request, "login", 8, 900, data.email.toLowerCase());
      const login = await authenticateAdmin(data.email.toLowerCase(), data.password);
      if (!login) throw new AppError("Correo o contraseña incorrectos, o acceso aún no autorizado en Leytech.", 401);
      const { admin, expiresIn } = login;
      const token = randomBytes(32).toString("hex");
      await db.query(
        "INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+$3*interval '1 second')",
        [hash(token), admin.id, expiresIn],
      );
      await audit(admin.id, "auth.login", admin.id);
      const response = ok({ success: true });
      response.cookies.set("leytech_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: expiresIn,
      });
      return response;
    }
    const admin = await sessionAdmin(
      (await cookies()).get("leytech_session")?.value,
    );
    if (!admin) throw new AppError("Inicia sesión para continuar.", 401);
    if (resource === "auth/logout" && method === "POST") {
      const jar = await cookies();
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        hash(jar.get("leytech_session")?.value || ""),
      ]);
      const response = ok({ success: true });
      response.cookies.set("leytech_session", "", { path: "/", maxAge: 0 });
      return response;
    }
    if (!resource.startsWith("admin/"))
      throw new AppError("Ruta no encontrada.", 404);
    if (resource === "admin/data" && method === "GET") {
      await expireOrders();
      const revision = await readRevision("admin");
      if (new URL(request.url).searchParams.get("revision") === revision) {
        return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      }
      const config = await settings();
      const online = config.orderChannel === "online";
      const result = await Promise.all([
        products({ all: true }),
        categories(true),
        config,
        online ? db.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200") : { rows: [] },
        db.query("SELECT * FROM quotes ORDER BY created_at DESC, id LIMIT 200"),
        db.query(
          "SELECT m.*,v.sku FROM stock_movements m JOIN variants v ON v.id=m.variant_id ORDER BY m.created_at DESC LIMIT 100",
        ),
        db.query(
          "SELECT a.*,u.email FROM audit_log a LEFT JOIN admins u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 100",
        ),
        db.query("SELECT * FROM claims ORDER BY created_at DESC LIMIT 100"),
        db.query("SELECT id,email,role,active FROM admins ORDER BY email"),
        online ? db.query("SELECT * FROM payments ORDER BY updated_at DESC LIMIT 100") : { rows: [] },
        admin.role === "owner" ? db.query("SELECT id FROM settings WHERE id='auth:auto-staff'") : { rows: [] },
      ]);
      return ok({
        revision,
        admin,
        products: result[0].products,
        categories: result[1],
        settings: result[2],
        orders: result[3].rows,
        quotes: result[4].rows,
        movements: result[5].rows,
        audit: result[6].rows,
        claims: result[7].rows,
        users: admin.role === "owner" ? result[8].rows : [],
        payments: result[9].rows,
        autoSupabaseStaff: result[10].rows.length > 0,
      });
    }
    if (resource === "admin/products" && method === "POST")
      return ok(await saveProduct(await jsonBody(request), admin));
    if (resource === "admin/quotes/order" && method === "POST") {
      await requireOnlineOrders();
      const order = await createOrderFromQuote(await jsonBody(request), admin);
      return ok({ id: order.id, code: order.code, token: order.public_token }, 201);
    }
    if (resource === "admin/brands" && method === "POST") {
      const d = z
        .object({
          name: z.string().trim().min(1).max(80),
          newName: z.string().trim().min(1).max(80),
        })
        .parse(await jsonBody(request));
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE products SET brand=$1,updated_at=now() WHERE brand=$2",
          [d.newName, d.name],
        );
        await audit(admin.id, "brand.renamed", d.name, d, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/inventory" && method === "POST") {
      const d = z
        .object({
          variantId: z.string().max(100),
          delta: z.number().int().min(-1000000).max(1000000),
          reason: z.string().trim().min(5).max(500),
        })
        .parse(await jsonBody(request));
      await db.transaction(async (tx) => {
        const { rows } = await tx.query(
          "UPDATE variants SET stock=stock+$1 WHERE id=$2 AND stock+$1>=reserved RETURNING id",
          [d.delta, d.variantId],
        );
        if (!rows.length)
          throw new AppError(
            "El ajuste deja stock negativo o afecta reservas.",
          );
        await tx.query(
          "INSERT INTO stock_movements(id,variant_id,delta,reason,admin_id) VALUES($1,$2,$3,$4,$5)",
          [crypto.randomUUID(), d.variantId, d.delta, d.reason, admin.id],
        );
        await audit(admin.id, "inventory.adjusted", d.variantId, d, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/quotes" && method === "POST") {
      const d = z
        .object({
          id: z.string().max(100),
          status: z.enum(["pending", "contacted", "closed"]),
        })
        .parse(await jsonBody(request));
      await db.transaction(async (tx) => {
        const result = await tx.query("UPDATE quotes SET status=$1 WHERE id=$2 RETURNING id", [
          d.status,
          d.id,
        ]);
        if (!result.rows.length) throw new AppError("La solicitud ya no está disponible.", 404);
        await audit(admin.id, "quote.status", d.id, { status: d.status }, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/claims" && method === "POST") {
      const d = z
        .object({
          id: z.string().max(100),
          status: z.enum(["pending", "resolved"]),
        })
        .parse(await jsonBody(request));
      await db.transaction(async (tx) => {
        await tx.query("UPDATE claims SET status=$1 WHERE id=$2", [d.status, d.id]);
        await audit(admin.id, "claim.status", d.id, d, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/orders" && method === "POST") {
      await requireOnlineOrders();
      const d = z
        .object({
          id: z.string().max(100),
          action: z.string().max(30),
          reason: z.string().trim().max(1000).default(""),
        })
        .parse(await jsonBody(request));
      await updateOrder(d.id, d.action, d.reason, admin);
      return ok({ success: true });
    }
    if (resource === "admin/categories" && method === "POST") {
      const d = z
        .object({
          id: z.string().max(100).optional(),
          name: z.string().trim().min(2).max(100),
          slug: z
            .string()
            .regex(/^[a-z0-9-]+$/)
            .max(100),
          active: z.boolean(),
          parent_id: z.string().max(100).nullable().default(null),
        })
        .parse(await jsonBody(request));
      const id = d.id || crypto.randomUUID();
      if (d.parent_id === id)
        throw new AppError("Una categoría no puede contenerse a sí misma.");
      if (d.parent_id) {
        const parents = await categories(true);
        let next: string | null = d.parent_id;
        const visited = new Set([id]);
        while (next) {
          if (visited.has(next))
            throw new AppError("La jerarquía de categorías contiene un ciclo.");
          visited.add(next);
          next = parents.find((p) => p.id === next)?.parent_id || null;
        }
      }
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO categories(id,name,slug,active,parent_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,active=EXCLUDED.active,parent_id=EXCLUDED.parent_id",
          [id, d.name, d.slug, d.active, d.parent_id],
        );
        await audit(admin.id, "category.saved", id, {}, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/password" && method === "POST") {
      if (admin.authProvider === "supabase")
        throw new AppError("La contraseña de esta cuenta se gestiona en Supabase Auth.", 409);
      await rateLimit(request, "password-change", 5, 900, admin.id);
      const d = z
        .object({
          current: z.string().max(200),
          password: z.string().min(12).max(200),
        })
        .parse(await jsonBody(request));
      const row = (
        await db.query<{ password_hash: string }>(
          "SELECT password_hash FROM admins WHERE id=$1",
          [admin.id],
        )
      ).rows[0];
      if (!verifyPassword(d.current, row.password_hash))
        throw new AppError("La contraseña actual no es correcta.");
      await db.transaction(async (tx) => {
        await tx.query("UPDATE admins SET password_hash=$1 WHERE id=$2", [
          hashPassword(d.password),
          admin.id,
        ]);
        await tx.query("DELETE FROM sessions WHERE admin_id=$1", [admin.id]);
        await audit(admin.id, "auth.password_changed", admin.id, {}, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/upload" && method === "POST") {
      if (
        Number(request.headers.get("content-length") || 0) > 4200000 ||
        !request.headers.get("content-length")
      )
        throw new AppError("La imagen debe pesar como máximo 4 MB.");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 4000000 || file.size < 12)
        throw new AppError(
          "Selecciona una imagen PNG, JPEG o WebP de hasta 4 MB.",
        );
      const buffer = Buffer.from(await file.arrayBuffer());
      let ext = "";
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
        ext = "jpg";
      else if (
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        ext = "png";
      else if (
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      )
        ext = "webp";
      if (!ext)
        throw new AppError(
          "El archivo no es una imagen PNG, JPEG o WebP válida.",
        );
      const name = `${crypto.randomUUID()}.${ext}`;
      if (
        process.env.NODE_ENV === "production" ||
        process.env.STORAGE_SUPABASE_URL
      ) {
        const url = await uploadObject(
          name,
          buffer,
          ext === "jpg" ? "image/jpeg" : `image/${ext}`,
        );
        await audit(admin.id, "image.uploaded", name);
        return ok({ url });
      }
      await fs.mkdir(path.join(process.cwd(), "public/uploads"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(process.cwd(), "public/uploads", name),
        buffer,
      );
      await audit(admin.id, "image.uploaded", name);
      return ok({ url: `/uploads/${name}` });
    }
    if (admin.role !== "owner")
      throw new AppError("Esta operación requiere el rol de propietario.", 403);
    if (resource === "admin/settings" && method === "POST") {
      // Store settings do not change the server's sales channel.
      const body = await jsonBody(request);
      const config = settingsSchema.parse({ ...(body as object), orderChannel: (await settings()).orderChannel });
      await db.transaction(async (tx) => {
        await tx.query("UPDATE settings SET value=$1 WHERE id='store'", [
          JSON.stringify(config),
        ]);
        await audit(admin.id, "settings.updated", "store", {}, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/users" && method === "POST") {
      const d = z
        .object({ email: z.email().max(150), role: z.enum(["owner", "staff"]), supabaseId: z.uuid().optional() })
        .parse(await jsonBody(request));
      const email = d.email.toLowerCase();
      if (d.supabaseId) {
        const identity = await confirmedSupabaseUser(d.supabaseId, email);
        const created = await addSupabaseAdmin(email, identity.id, d.role, admin.id);
        if (!created) throw new AppError("Ese correo ya tiene un acceso en Leytech.", 409);
        return ok({ linked: true });
      }
      const id = crypto.randomUUID(),
        password = randomBytes(18).toString("base64url");
      await db.query(
        "INSERT INTO admins(id,email,password_hash,role) VALUES($1,$2,$3,$4)",
        [id, email, hashPassword(password), d.role],
      );
      await audit(admin.id, "user.created", id);
      return ok({ password });
    }
    if (resource === "admin/users/supabase-auto" && method === "POST") {
      const { enabled } = z.object({ enabled: z.boolean() }).parse(await jsonBody(request));
      if (enabled && !(await publicSignupDisabled()))
        throw new AppError("Desactiva el registro público y el acceso anónimo en Supabase Auth antes de activar esta opción.", 409);
      await db.transaction(async tx => {
        if (enabled) {
          await tx.query("INSERT INTO settings(id,value) VALUES('auth:auto-staff',$1) ON CONFLICT DO NOTHING",
            [JSON.stringify({ start: new Date().toISOString() })]);
        } else {
          await tx.query("DELETE FROM settings WHERE id='auth:auto-staff'");
        }
        await audit(admin.id, "user.supabase_auto", admin.id, { enabled }, tx);
      });
      return ok({ success: true });
    }
    if (resource === "admin/users/toggle" && method === "POST") {
      const d = z
        .object({ id: z.string().max(100), active: z.boolean() })
        .parse(await jsonBody(request));
      if (d.id === admin.id)
        throw new AppError("No puedes desactivar tu propia cuenta.");
      await db.query("UPDATE admins SET active=$1 WHERE id=$2", [
        d.active,
        d.id,
      ]);
      await db.query("DELETE FROM sessions WHERE admin_id=$1", [d.id]);
      await audit(admin.id, "user.updated", d.id);
      return ok({ success: true });
    }
    throw new AppError("Ruta no encontrada.", 404);
  } catch (error) {
    if (error instanceof ZodError)
      return ok(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 5)
            .join(" · "),
        },
        400,
      );
    if (error instanceof AppError)
      return ok({ error: error.message }, error.status);
    const code = (error as { code?: string }).code;
    if (code === "23505")
      return ok(
        { error: "Ese SKU, enlace o correo ya existe. Usa otro valor." },
        409,
      );
    console.error(
      "Leytech API:",
      error instanceof Error ? error.message : "Error interno",
    );
    return ok(
      { error: "No se pudo completar la operación. Vuelve a intentarlo." },
      500,
    );
  }
}
export { route as GET, route as POST };
