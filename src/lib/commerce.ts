import { db, type Queryable } from "./db";
import { cartSchema, checkoutSchema,whatsappOrderSchema } from "./validation";
import { settings } from "./catalog";
import { AppError,audit } from "./security";
import { money, quoteCode } from "./format";
import type { SnapshotLine, Order, Variant,Admin } from "./types";
import { randomBytes } from "node:crypto";
import { markChanged } from "./revisions";

export async function snapshot(
  input: unknown,
  q: Queryable = db,
): Promise<SnapshotLine[]> {
  const { items } = cartSchema.parse(input);
  const config=await settings(q);
  const consolidated = new Map<string, { quantity: number; price?: number }>();
  for (const item of items) {
    const previous = consolidated.get(item.variantId);
    const quantity = (previous?.quantity || 0) + item.quantity;
    if (quantity > 99)
      throw new AppError("La cantidad máxima por variante es 99.");
    consolidated.set(item.variantId, { quantity, price: item.price });
  }
  const lines: SnapshotLine[] = [];
  for (const [variantId, item] of [...consolidated].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const { rows } = await q.query<
      Variant & {
        product_name: string;
        slug: string;
        images: string[];
        type: string;
        is_demo: boolean;
      }
    >(
      `SELECT v.*,p.name AS product_name,p.slug,p.images,p.type,p.is_demo FROM variants v JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id WHERE v.id=$1 AND v.active=true AND p.status='published' AND c.active=true`,
      [variantId],
    );
    const v = rows[0];
    if (!v)
      throw new AppError(
        "Un producto ya no está disponible. Retíralo del carrito.",
      );
    if(v.is_demo&&!config.demoMode)throw new AppError('Este producto es un ejemplo y no está disponible para ventas.');
    if (v.stock - v.reserved < item.quantity)
      throw new AppError(
        `${v.product_name} (${v.name}): quedan ${v.stock - v.reserved} unidades.`,
        409,
      );
    lines.push({
      variantId: v.id,
      productId: v.product_id,
      slug: v.slug,
      name: v.product_name,
      variant: v.name,
      sku: v.sku,
      price: v.price,
      quantity: item.quantity,
      image: v.image || v.images[0] || "/images/placeholder.svg",
      type: v.type,
      available: v.stock - v.reserved,
      isDemo: v.is_demo,
      priceChanged: item.price !== undefined && item.price !== v.price,
    });
  }
  return lines;
}
export function whatsappMessage(
  code: string,
  items: SnapshotLine[],
  subtotal: number,
) {
  return `Hola Leytech, quiero comprar estos productos por WhatsApp.\n\nSolicitud: ${code}\n\n${items.map((i, n) => `${n + 1}. ${i.name}\nVariante: ${i.variant}\nSKU: ${i.sku}\nCantidad: ${i.quantity}\nPrecio unitario: ${money(i.price)}`).join("\n\n")}\n\nSubtotal de productos: ${money(subtotal)}\n\nQuiero confirmar disponibilidad, costo de envío, total y forma de pago antes de finalizar la compra. ¡Gracias!`;
}
export async function createQuote(input: unknown) {
  await expireOrders();
  return db.transaction(async (tx) => {
    const config = await settings(tx);
    if (config.orderChannel === "whatsapp" && !config.demoMode && !config.salesEnabled) {
      throw new AppError("Leytech pausó las solicitudes de compra. Escríbenos por WhatsApp si tienes preguntas.", 409);
    }
    const items = await snapshot(input, tx);
    if (items.some((i) => i.priceChanged))
      throw new AppError(
        "El precio cambió. Actualiza el carrito y revisa el total antes de cotizar.",
        409,
      );
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    if (subtotal > 2_000_000_000)
      throw new AppError(
        "El importe supera el máximo permitido para una cotización. Divide los productos en varias solicitudes.",
      );
    const id = crypto.randomUUID();
    const { rows } = await tx.query<{ code: string }>(
      "INSERT INTO quotes(id,items,subtotal) VALUES($1,$2,$3) RETURNING code",
      [id, JSON.stringify(items), subtotal],
    );
    await markChanged(tx);
    const code = quoteCode(rows[0].code);
    return {
      code,
      subtotal,
      items,
      url: `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(whatsappMessage(code, items, subtotal))}`,
    };
  });
}
export async function expireOrders() {
  await db.transaction(async (tx) => {
    const expired = (
      await tx.query<Order>(
        "SELECT * FROM orders WHERE status='pending' AND expires_at<now() ORDER BY id FOR UPDATE",
      )
    ).rows;
    for (const o of expired) {
      await releaseReservation(o.id, tx);
      await tx.query(
        "UPDATE orders SET status='expired',updated_at=now() WHERE id=$1",
        [o.id],
      );
    }
    if (expired.length) await markChanged(tx, true);
  });
}
export async function releaseReservation(orderId: string, tx: Queryable) {
  const lines = (
    await tx.query<{ variant_id: string; quantity: number }>(
      "SELECT * FROM order_items WHERE order_id=$1 ORDER BY variant_id",
      [orderId],
    )
  ).rows;
  for (const i of lines)
    await tx.query(
      "UPDATE variants SET reserved=reserved-$1 WHERE id=$2 AND reserved>=$1",
      [i.quantity, i.variant_id],
    );
}
export async function createOrder(input: unknown,whatsappContext?:{admin:Admin;quoteId:string;shippingFee:number;agreement:string}) {
  const data = checkoutSchema.parse(input);
  await expireOrders();
  return db.transaction(async (tx) => {
    // Serialize retries with the same idempotency key before checking for an existing order.
    const config = await settings(tx);
    if(config.orderChannel==='whatsapp'&&!config.demoMode&&!whatsappContext)throw new AppError('Las compras se coordinan por WhatsApp. Envía tu carrito a Leytech.');
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      data.idempotencyKey,
    ]);
    const existing = (
      await tx.query<Order>("SELECT * FROM orders WHERE idempotency_key=$1", [
        data.idempotencyKey,
      ])
    ).rows[0];
    if (existing) return existing;
    if (!config.salesEnabled && !config.demoMode&&!whatsappContext)
      throw new AppError(
        "Las compras aún no están habilitadas. Puedes solicitar una cotización.",
      );
    const items = await snapshot(data, tx);
    if (items.some((i) => i.priceChanged))
      throw new AppError(
        "El precio cambió. Vuelve al carrito y revisa el total.",
        409,
      );
    if (items.some((i) => i.isDemo) && !config.demoMode)
      throw new AppError(
        "Los productos de demostración no se pueden vender. Registra tu catálogo real.",
      );
    const physical = items.some((i) => i.type === "physical");
    if (!physical && data.customer.delivery !== "digital")
      throw new AppError("Selecciona entrega digital.");
    if (physical && data.customer.delivery === "digital")
      throw new AppError(
        "Selecciona un método de entrega para tus productos físicos.",
      );
    if (
      !whatsappContext&&data.customer.delivery === "shipping" &&
      (!config.shippingEnabled ||
        data.customer.address.length < 5 ||
        data.customer.district.length < 3)
    )
      throw new AppError(
        "Completa la dirección y selecciona una zona de envío habilitada.",
      );
    if (
      !whatsappContext&&data.customer.delivery === "shipping" &&
      data.customer.district !== config.shippingZone
    )
      throw new AppError("La zona de envío no está habilitada.");
    if (
      !whatsappContext&&data.customer.delivery === "pickup" &&
      !config.pickupEnabled &&
      !config.demoMode
    )
      throw new AppError("El recojo aún no está habilitado.");
    if (data.customer.delivery === "coordinate")
      throw new AppError(
        "Solicita una cotización para coordinar la entrega antes de crear el pedido.",
      );
    if (
      data.method === "transfer" &&
      (!config.transferEnabled || config.demoMode)
    )
      throw new AppError("La transferencia no está habilitada.");
    if (
      data.method === "mercadopago" &&
      (config.demoMode ||
        !process.env.MERCADOPAGO_ACCESS_TOKEN ||
        !process.env.MERCADOPAGO_WEBHOOK_SECRET ||
        !process.env.MERCADOPAGO_COLLECTOR_ID)
    )
      throw new AppError("Los pagos online aún no están habilitados.");
    if (data.method === "coordinate" && !config.demoMode&&!whatsappContext)
      throw new AppError("Selecciona un medio de pago habilitado.");
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    if (subtotal > 2_000_000_000)
      throw new AppError(
        "El importe supera el máximo permitido para un pedido. Divide los productos en varios pedidos.",
      );
    const shipping = whatsappContext?.shippingFee ?? (data.customer.delivery === "shipping" ? config.shippingFee : 0);
    const id = crypto.randomUUID(),
      token = randomBytes(32).toString("hex");
    for (const item of items) {
      const { rows } = await tx.query(
        "UPDATE variants SET reserved=reserved+$1 WHERE id=$2 AND stock-reserved>=$1 RETURNING id",
        [item.quantity, item.variantId],
      );
      if (!rows.length)
        throw new AppError(
          "El stock cambió durante la compra. Revisa el carrito.",
          409,
        );
    }
    const { rows } = await tx.query<Order>(
      `INSERT INTO orders(id,public_token,idempotency_key,customer,items,subtotal,shipping,total,method,is_demo,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '30 minutes') RETURNING *`,
      [
        id,
        token,
        data.idempotencyKey,
        JSON.stringify(data.customer),
        JSON.stringify(items),
        subtotal,
        shipping,
        subtotal + shipping,
        data.method,
        config.demoMode,
      ],
    );
    for (const item of items)
      await tx.query(
        "INSERT INTO order_items(order_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,$4)",
        [id, item.variantId, item.quantity, item.price],
      );
    if(whatsappContext){await tx.query('UPDATE orders SET quote_id=$1 WHERE id=$2',[whatsappContext.quoteId,id]);await tx.query("UPDATE quotes SET status='contacted' WHERE id=$1",[whatsappContext.quoteId]);await audit(whatsappContext.admin.id,'order.created_from_whatsapp',id,{quoteId:whatsappContext.quoteId,agreement:whatsappContext.agreement},tx);}
    else await markChanged(tx, true);
    return rows[0];
  });
}
export async function createOrderFromQuote(input:unknown,admin:Admin){
  const data=whatsappOrderSchema.parse(input);
  const quote=(await db.query<{id:string;items:SnapshotLine[]}>('SELECT id,items FROM quotes WHERE id=$1',[data.quoteId])).rows[0];
  if(!quote)throw new AppError('Solicitud no encontrada.',404);
  return createOrder({items:quote.items.map(i=>({variantId:i.variantId,quantity:i.quantity,price:i.price})),idempotencyKey:quote.id,customer:{name:data.name,email:data.email,phone:data.phone,delivery:data.delivery,address:data.address,district:data.district},method:'coordinate',consent:true},{admin,quoteId:quote.id,shippingFee:data.shippingFee,agreement:data.agreement});
}
export async function commitStock(
  order: Order,
  tx: Queryable,
  adminId: string | null = null,
) {
  if (order.stock_committed) return;
  const items = (
    await tx.query<{ variant_id: string; quantity: number }>(
      "SELECT * FROM order_items WHERE order_id=$1 ORDER BY variant_id",
      [order.id],
    )
  ).rows;
  for (const i of items) {
    const result = await tx.query(
      "UPDATE variants SET stock=stock-$1,reserved=reserved-$1 WHERE id=$2 AND stock>=$1 AND reserved>=$1 RETURNING id",
      [i.quantity, i.variant_id],
    );
    if (!result.rows.length)
      throw new AppError(
        "No hay una reserva válida para completar el pedido.",
        409,
      );
    await tx.query(
      "INSERT INTO stock_movements(id,variant_id,delta,reason,order_id,admin_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        crypto.randomUUID(),
        i.variant_id,
        -i.quantity,
        "Pedido pagado",
        order.id,
        adminId,
      ],
    );
  }
  await tx.query(
    "UPDATE orders SET status='paid',stock_committed=true,updated_at=now() WHERE id=$1",
    [order.id],
  );
}
