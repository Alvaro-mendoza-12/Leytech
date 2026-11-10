import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomBytes, createHmac } from "node:crypto";
import { db } from "../src/lib/db";
import { seed } from "../scripts/seed";
import { products, productBySlug, settings } from "../src/lib/catalog";
import { saveProduct, updateOrder } from "../src/lib/admin";
import { readRevision } from "../src/lib/revisions";
import {
  snapshot,
  createQuote,
  createOrder,
  createOrderFromQuote,
  expireOrders,
} from "../src/lib/commerce";
import { verifyWebhook, applyVerifiedPayment } from "../src/lib/payments";
import {
  hashPassword,
  verifyPassword,
  sessionAdmin,
  hash,
  checkOrigin,
  jsonBody,
} from "../src/lib/security";
import { settingsSchema } from "../src/lib/validation";
import type { Admin, Order, Variant } from "../src/lib/types";

process.env.PGLITE_PATH = ":memory:";
Object.assign(process.env, { NODE_ENV: "test" });
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3001";
process.env.MERCADOPAGO_COLLECTOR_ID = "test-collector";
process.env.MERCADOPAGO_MODE = "sandbox";
const owner: Admin = {
  id: "test-owner",
  email: "owner@test.invalid",
  role: "owner",
};
const customer = {
  name: "Cliente de prueba",
  email: "cliente@test.invalid",
  phone: "999999999",
  delivery: "pickup",
  address: "",
  district: "",
};
function orderInput(variantId = "demo-1-v1", quantity = 1) {
  return {
    items: [{ variantId, quantity }],
    customer,
    method: "coordinate",
    consent: true,
    idempotencyKey: crypto.randomUUID(),
  };
}
before(async () => {
  for (const file of (await fs.readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await fs.readFile(`migrations/${file}`, 'utf8'));
  await seed();
  await db.query(
    "INSERT INTO admins(id,email,password_hash) VALUES($1,$2,$3)",
    [owner.id, owner.email, hashPassword("a-long-test-password")],
  );
});
after(async () => {
  await db.close();
});

test("envío: calcula tarifa del servidor y rechaza una zona no habilitada", async () => {
  const s = await settings();
  await db.query("UPDATE settings SET value=$1 WHERE id='store'", [
    JSON.stringify({
      ...s,
      shippingEnabled: true,
      shippingFee: 1590,
      shippingZone: "Zona de prueba",
    }),
  ]);
  try {
    const input = orderInput("demo-10-v1");
    const o = await createOrder({
      ...input,
      shipping: 1,
      customer: {
        ...customer,
        delivery: "shipping",
        address: "Dirección de prueba 123",
        district: "Zona de prueba",
      },
    });
    assert.equal(o.shipping, 1590);
    assert.equal(o.total, 6580);
    await assert.rejects(
      createOrder({
        ...orderInput("demo-10-v1"),
        customer: {
          ...customer,
          delivery: "shipping",
          address: "Dirección de prueba 123",
          district: "Otra zona",
        },
      }),
    );
    await updateOrder(o.id, "cancelled", "Fin de prueba de envío", owner);
  } finally {
    await db.query("UPDATE settings SET value=$1 WHERE id='store'", [
      JSON.stringify(s),
    ]);
  }
});
test("digital: permite entrega digital sin envío y rechaza entrega física", async () => {
  await db.query("UPDATE products SET status='published' WHERE id='demo-11'");
  const input = orderInput("demo-11-v1");
  await assert.rejects(createOrder(input), /digital/);
  const o = await createOrder({
    ...input,
    customer: { ...customer, delivery: "digital" },
  });
  assert.equal(o.shipping, 0);
  assert.equal(o.items[0].type, "digital");
  await updateOrder(o.id, "cancelled", "Fin de prueba digital", owner);
});
test("marca: rechaza un color que vuelve ilegible el texto blanco", async () => {
  const s = await settings();
  assert.equal(
    settingsSchema.safeParse({ ...s, primaryColor: "#ffff00" }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...s, primaryColor: "#2563eb" }).success,
    true,
  );
});

test("contraseñas con salt y comparación segura; no se almacena el secreto", () => {
  const a = hashPassword("correct-password"),
    b = hashPassword("correct-password");
  assert.notEqual(a, b);
  assert.ok(verifyPassword("correct-password", a));
  assert.equal(verifyPassword("wrong", a), false);
});
test("sesión privada: token aleatorio, hash persistido, expiración y revocación", async () => {
  assert.equal(await sessionAdmin(), null);
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [hash(token), owner.id],
  );
  assert.equal((await sessionAdmin(token))?.id, owner.id);
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
  assert.equal(await sessionAdmin(token), null);
});
test("CSRF: rechaza origen ausente o ajeno", () => {
  assert.throws(() =>
    checkOrigin(
      new Request("http://localhost:3001/api/quotes", { method: "POST" }),
    ),
  );
  assert.throws(() =>
    checkOrigin(
      new Request("http://localhost:3001/api/quotes", {
        headers: { origin: "https://ajeno.invalid" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://localhost:3001/api/quotes", {
        headers: { origin: "http://localhost:3001" },
      }),
    ),
  );
});
test("JSON: rechaza cuerpos sobredimensionados o inválidos", async () => {
  await assert.rejects(
    jsonBody(
      new Request("http://localhost", {
        method: "POST",
        body: "x".repeat(150001),
      }),
    ),
  );
  await assert.rejects(
    jsonBody(
      new Request("http://localhost", { method: "POST", body: "invalid" }),
    ),
  );
});
test("administración: crea y publica un producto con tres colores y stock independiente", async () => {
  const revision = await readRevision("storefront");
  await saveProduct(
    {
      name: "Mouse de aceptación",
      slug: "mouse-aceptacion",
      brand: "Prueba",
      category_id: "perifericos",
      summary: "Mouse para probar variantes",
      description: "Producto de prueba.",
      specifications: { Conexión: "Bluetooth" },
      images: ["/images/mouse.jpg"],
      status: "published",
      type: "physical",
      warranty: "Por confirmar",
      featured: false,
      variants: [
        {
          sku: "ACEPT-NEGRO",
          name: "Negro",
          color: "Negro",
          color_hex: "#222222",
          price: 8990,
          compare_at: null,
          stock: 10,
        },
        {
          sku: "ACEPT-BLANCO",
          name: "Blanco",
          color: "Blanco",
          color_hex: "#ffffff",
          price: 9990,
          compare_at: null,
          stock: 5,
        },
        {
          sku: "ACEPT-AZUL",
          name: "Azul",
          color: "Azul",
          color_hex: "#2563eb",
          price: 10990,
          compare_at: null,
          stock: 0,
        },
      ],
    },
    owner,
  );
  const p = await productBySlug("mouse-aceptacion");
  assert.ok(p);
  assert.equal(p.variants.length, 3);
  assert.equal(p.variants.find((v) => v.color === "Azul")?.stock, 0);
  assert.notEqual(await readRevision("storefront"), revision);
});
test("búsqueda por nombre, marca y categoría con consultas parametrizadas", async () => {
  assert.equal((await products({ q: "aceptación" })).total, 1);
  assert.equal((await products({ q: "aceptacion" })).total, 1);
  assert.equal((await products({ q: "Prueba" })).total, 1);
  assert.ok((await products({ q: "audio" })).total >= 2);
  assert.equal((await products({ q: "'; DROP TABLE products; --" })).total, 0);
});
test("filtros de categoría, color y rango deben coincidir en una misma variante", async () => {
  const a = await products({ category: "perifericos", q: "aceptación" });
  assert.equal(a.total, 1);
  assert.equal(
    (
      await products({
        q: "aceptación",
        color: "Blanco",
        min: 9000,
        max: 10000,
      })
    ).total,
    1,
  );
  assert.equal(
    (await products({ q: "aceptación", min: 9000, max: 9500 })).total,
    0,
  );
});
test("carrito: consolida variantes duplicadas y calcula con precios del servidor", async () => {
  const lines = await snapshot({
    items: [
      { variantId: "demo-1-v1", quantity: 1 },
      { variantId: "demo-1-v1", quantity: 2, price: 1 },
    ],
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 3);
  assert.equal(lines[0].price, 24990);
  assert.equal(lines[0].priceChanged, true);
});
test("carrito: rechaza variante agotada, inexistente, cantidades negativas y exceso", async () => {
  await assert.rejects(
    snapshot({ items: [{ variantId: "demo-1-v3", quantity: 1 }] }),
  );
  await assert.rejects(
    snapshot({ items: [{ variantId: "missing", quantity: 1 }] }),
  );
  await assert.rejects(
    snapshot({ items: [{ variantId: "demo-1-v1", quantity: -1 }] }),
  );
  await assert.rejects(
    snapshot({ items: [{ variantId: "demo-1-v1", quantity: 99 }] }),
  );
});
test("cotización: registra código y mensaje WhatsApp sin reservar stock", async () => {
  const adminRevision = await readRevision("admin");
  const publicRevision = await readRevision("storefront");
  const before = (
    await db.query<Variant>("SELECT * FROM variants WHERE id='demo-1-v1'")
  ).rows[0];
  const q = await createQuote({
    items: [{ variantId: "demo-1-v1", quantity: 2, price: 24990 }],
  });
  assert.match(q.code, /^COT-\d{5}$/);
  const url = new URL(q.url);
  assert.equal(url.hostname, "wa.me");
  assert.equal(url.pathname, "/51905886853");
  assert.ok(url.searchParams.get("text")?.includes("Cantidad: 2"));
  assert.ok(url.searchParams.get("text")?.includes(q.code));
  assert.equal(q.subtotal, 49980);
  const after = (
    await db.query<Variant>("SELECT * FROM variants WHERE id='demo-1-v1'")
  ).rows[0];
  assert.equal(before.reserved, after.reserved);
  assert.equal(before.stock, after.stock);
  assert.notEqual(await readRevision("admin"), adminRevision);
  assert.equal(await readRevision("storefront"), publicRevision);
});
test("cotización: obliga a revisar cambios de precio", async () => {
  await assert.rejects(
    createQuote({
      items: [{ variantId: "demo-1-v1", quantity: 1, price: 100 }],
    }),
    /precio/,
  );
});
test("pedidos: reserva stock, ignora totales del cliente e idempotencia de reintentos", async () => {
  const input = orderInput("demo-2-v1", 2);
  const a = await createOrder({ ...input, total: 1 });
  const b = await createOrder(input);
  assert.equal(a.id, b.id);
  assert.equal(a.total, 37980);
  assert.equal(a.status, "pending");
  const v = (
    await db.query<Variant>("SELECT * FROM variants WHERE id='demo-2-v1'")
  ).rows[0];
  assert.equal(v.reserved, 2);
});
test("inventario: carrera por la última unidad produce un solo pedido", async () => {
  await db.query("UPDATE variants SET stock=1,reserved=0 WHERE id='demo-3-v1'");
  const results = await Promise.allSettled([
    createOrder(orderInput("demo-3-v1")),
    createOrder(orderInput("demo-3-v1")),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.query<Variant>("SELECT * FROM variants WHERE id='demo-3-v1'"))
      .rows[0].reserved,
    1,
  );
});
test("pedidos: el historial conserva el precio después de editar el catálogo", async () => {
  const o = await createOrder(orderInput("demo-4-v1"));
  await db.query("UPDATE variants SET price=1 WHERE id='demo-4-v1'");
  const stored = (
    await db.query<Order>("SELECT * FROM orders WHERE id=$1", [o.id])
  ).rows[0];
  assert.equal(stored.items[0].price, 15990);
});
test("pedidos: cancelar libera la reserva y no admite doble cancelación", async () => {
  const o = await createOrder(orderInput("demo-5-v1"));
  await updateOrder(o.id, "cancelled", "Cancelación de prueba", owner);
  await assert.rejects(updateOrder(o.id, "cancelled", "Repetición", owner));
  assert.equal(
    (await db.query<Variant>("SELECT * FROM variants WHERE id='demo-5-v1'"))
      .rows[0].reserved,
    0,
  );
});
test("pedidos: expiración libera reservas exactamente una vez", async () => {
  const o = await createOrder(orderInput("demo-6-v1"));
  await db.query(
    "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [o.id],
  );
  await expireOrders();
  await expireOrders();
  assert.equal(
    (await db.query<Variant>("SELECT * FROM variants WHERE id='demo-6-v1'"))
      .rows[0].reserved,
    0,
  );
  assert.equal(
    (await db.query<Order>("SELECT * FROM orders WHERE id=$1", [o.id])).rows[0]
      .status,
    "expired",
  );
});
test("pago manual: exige evidencia y consume stock una sola vez", async () => {
  const o = await createOrder(orderInput("demo-7-v1"));
  await assert.rejects(updateOrder(o.id, "paid", "", owner));
  await updateOrder(
    o.id,
    "paid",
    "Verificación de prueba sin cobro real",
    owner,
  );
  await assert.rejects(
    updateOrder(o.id, "paid", "Intento repetido de prueba", owner),
  );
  const v = (
    await db.query<Variant>("SELECT * FROM variants WHERE id='demo-7-v1'")
  ).rows[0];
  assert.equal(v.stock, 5);
  assert.equal(v.reserved, 0);
});
test("webhook: HMAC válido, firma alterada y replay vencido", () => {
  const id = "123",
    requestId = "test-request",
    secret = "test-secret",
    ts = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`id:${id};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  assert.ok(verifyWebhook(`ts=${ts},v1=${signature}`, requestId, id, secret));
  assert.equal(
    verifyWebhook(`ts=${ts},v1=${"0".repeat(64)}`, requestId, id, secret),
    false,
  );
  assert.equal(
    verifyWebhook(
      `ts=${ts},v1=${signature}`,
      requestId,
      id,
      secret,
      Date.now() + 600000,
    ),
    false,
  );
});
test("pago verificado (fixture unitario): valida monto, cuenta, moneda y entorno; duplicados no descuentan doble", async () => {
  const o = await createOrder(orderInput("demo-8-v1"));
  await db.query(
    "UPDATE orders SET method='mercadopago',is_demo=false WHERE id=$1",
    [o.id],
  );
  const payment = {
    id: "fixture-1",
    external_reference: o.id,
    currency_id: "PEN",
    transaction_amount: o.total / 100,
    collector_id: "test-collector",
    live_mode: false,
    status: "approved",
  };
  await assert.rejects(
    applyVerifiedPayment({ ...payment, transaction_amount: 1 }),
  );
  await assert.rejects(
    applyVerifiedPayment({ ...payment, collector_id: "other" }),
  );
  await assert.rejects(
    applyVerifiedPayment({ ...payment, currency_id: "USD" }),
  );
  await assert.rejects(applyVerifiedPayment({ ...payment, live_mode: true }));
  await applyVerifiedPayment(payment);
  await applyVerifiedPayment(payment);
  const v = (
    await db.query<Variant>("SELECT * FROM variants WHERE id='demo-8-v1'")
  ).rows[0];
  assert.equal(v.stock, 5);
  assert.equal(v.reserved, 0);
  assert.equal(
    (
      await db.query<{ count: string }>(
        "SELECT count(*) FROM stock_movements WHERE order_id=$1",
        [o.id],
      )
    ).rows[0].count,
    1,
  );
});
test("pago tardío (fixture unitario): queda en revisión y no genera stock negativo", async () => {
  const o = await createOrder(orderInput("demo-9-v1"));
  await db.query(
    "UPDATE orders SET method='mercadopago',is_demo=false,expires_at=now()-interval '1 minute' WHERE id=$1",
    [o.id],
  );
  await expireOrders();
  await applyVerifiedPayment({
    id: "fixture-late",
    external_reference: o.id,
    currency_id: "PEN",
    transaction_amount: o.total / 100,
    collector_id: "test-collector",
    live_mode: false,
    status: "approved",
  });
  const result = (
    await db.query<Order>("SELECT * FROM orders WHERE id=$1", [o.id])
  ).rows[0];
  assert.equal(result.status, "review");
  const v = (
    await db.query<Variant>("SELECT * FROM variants WHERE id='demo-9-v1'")
  ).rows[0];
  assert.equal(v.stock, 6);
  assert.equal(v.reserved, 0);
});
test("configuración: WhatsApp no exige pasarela; checkout y transferencia conservan sus requisitos", async () => {
  const s = await settings();
  assert.equal(
    settingsSchema.safeParse({ ...s, orderChannel:'online', demoMode: false, salesEnabled: true })
      .success,
    false,
  );
  assert.equal(settingsSchema.safeParse({...s,orderChannel:'whatsapp',demoMode:false,salesEnabled:true}).success,true);
  assert.equal(
    settingsSchema.safeParse({ ...s, transferEnabled: true }).success,
    false,
  );
});

test('WhatsApp en producción: oculta ejemplos y registra pedidos acordados sin duplicar reservas', async () => {
 const s=await settings();
 await db.query("UPDATE settings SET value=$1 WHERE id='store'",[JSON.stringify({...s,demoMode:false,orderChannel:'whatsapp',salesEnabled:true})]);
 try {
  assert.equal(await productBySlug('audifonos-inalambricos-studio'),null);
  assert.equal((await products({q:'Leytech Select'})).total,0);
  await assert.rejects(snapshot({items:[{variantId:'demo-1-v1',quantity:1}]}),/ejemplo/);
  const product=await productBySlug('mouse-aceptacion');assert.ok(product);
  const variant=product.variants.find(v=>v.sku==='ACEPT-NEGRO')!;
  await db.query("UPDATE settings SET value=jsonb_set(value, '{salesEnabled}', 'false') WHERE id='store'");
  await assert.rejects(createQuote({items:[{variantId:variant.id,quantity:1}]}),/pausó las solicitudes/);
  await db.query("UPDATE settings SET value=jsonb_set(value, '{salesEnabled}', 'true') WHERE id='store'");
  await assert.rejects(createOrder({...orderInput(variant.id),customer:{...customer,email:''}}),/WhatsApp/);
  const quote=await createQuote({items:[{variantId:variant.id,quantity:2}]});
  assert.ok(quote.url.startsWith('https://wa.me/51905886853'));
  const quoteId=(await db.query<{id:string}>('SELECT id FROM quotes ORDER BY created_at DESC LIMIT 1')).rows[0].id;
  const input={quoteId,name:'Cliente WhatsApp',phone:'999999999',email:'',delivery:'shipping',address:'Dirección de prueba 123',district:'Chiclayo',shippingFee:1200,agreement:'Cliente confirmó el total y el envío por WhatsApp.'};
  const order=await createOrderFromQuote(input,owner);
  assert.equal(order.total,2*variant.price+1200);assert.equal(order.is_demo,false);
  assert.equal((await createOrderFromQuote(input,owner)).id,order.id);
  assert.equal((await db.query<Variant>('SELECT * FROM variants WHERE id=$1',[variant.id])).rows[0].reserved,2);
  const stored=(await db.query<Order&{quote_id:string}>('SELECT * FROM orders WHERE id=$1',[order.id])).rows[0];assert.equal(stored.quote_id,quoteId);
  await updateOrder(order.id,'cancelled','Cierre del caso de prueba WhatsApp',owner);
  const changed=await createQuote({items:[{variantId:variant.id,quantity:1}]});
  assert.ok(changed.code);
  const changedId=(await db.query<{id:string}>('SELECT id FROM quotes ORDER BY created_at DESC LIMIT 1')).rows[0].id;
  await db.query('UPDATE variants SET price=price+100 WHERE id=$1',[variant.id]);
  await assert.rejects(createOrderFromQuote({...input,quoteId:changedId},owner),/precio cambió/);
 } finally {await db.query("UPDATE settings SET value=$1 WHERE id='store'",[JSON.stringify(s)]);}
});

test('un borrador de ejemplo requiere revisar los datos antes de publicarlo como producto real',async()=>{
 const example=await productBySlug('mouse-inalambrico-precision',true);assert.ok(example);
 await assert.rejects(saveProduct({...example,status:'published'},owner),/Confirma/);
 await saveProduct({...example,status:'published',confirmRealProduct:true},owner);
 assert.equal((await productBySlug(example.slug,true))?.is_demo,false);
});
