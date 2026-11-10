import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { AppError, hash } from "./security";
import { commitStock, releaseReservation } from "./commerce";
import type { Order } from "./types";

export function verifyWebhook(
  signature: string,
  requestId: string,
  dataId: string,
  secret: string,
  now = Date.now(),
) {
  const fields = Object.fromEntries(
    signature.split(",").map((x) => x.trim().split("=")),
  );
  const ts = fields.ts,
    actual = fields.v1;
  if (
    !ts ||
    !actual ||
    !requestId ||
    !/^\d+$/.test(ts) ||
    !/^[a-f0-9]{64}$/i.test(actual)
  )
    return false;
  const millis = ts.length <= 10 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(now - millis) > 300000) return false;
  const expected = createHmac("sha256", secret)
    .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(actual, "hex"));
}
async function provider(path: string, options: RequestInit = {}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new AppError("Falta configurar Mercado Pago.", 503);
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok)
    throw new AppError(
      "Mercado Pago no pudo procesar la solicitud. Vuelve a intentarlo.",
      502,
    );
  return res.json();
}
export async function paymentPreference(order: Order) {
  if (order.method !== "mercadopago") return null;
  return db.transaction(async (tx) => {
    const current = (
      await tx.query<Order>("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
        order.id,
      ])
    ).rows[0];
    if (current.payment_url) return current.payment_url;
    if (
      current.status !== "pending" ||
      new Date(current.expires_at).getTime() < Date.now()
    )
      throw new AppError("El pedido ya no acepta pagos.", 409);
    const site = process.env.NEXT_PUBLIC_SITE_URL || "";
    if (!site.startsWith("https://"))
      throw new AppError("Mercado Pago requiere una URL HTTPS pública.", 503);
    const returnUrl = `${site}/pedido/${current.public_token}`;
    const preference = await provider("/checkout/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": current.id },
      body: JSON.stringify({
        external_reference: current.id,
        items: [
          ...current.items.map((i) => ({
            id: i.variantId,
            title: `${i.name} · ${i.variant}`,
            quantity: i.quantity,
            currency_id: "PEN",
            unit_price: i.price / 100,
          })),
          ...(current.shipping
            ? [
                {
                  id: "shipping",
                  title: "Costo de envío",
                  quantity: 1,
                  currency_id: "PEN",
                  unit_price: current.shipping / 100,
                },
              ]
            : []),
        ],
        payer: { email: current.customer.email },
        back_urls: {
          success: returnUrl,
          pending: returnUrl,
          failure: returnUrl,
        },
        auto_return: "approved",
        notification_url: `${site}/api/payments/webhook`,
        expires: true,
        expiration_date_to: new Date(current.expires_at).toISOString(),
      }),
    });
    const url =
      process.env.MERCADOPAGO_MODE === "live"
        ? preference.init_point
        : preference.sandbox_init_point;
    if (
      typeof url !== "string" ||
      !/^https:\/\/([a-z0-9-]+\.)*mercadopago\.(com|com\.pe)\//.test(url)
    )
      throw new AppError(
        "El proveedor devolvió una dirección de pago inválida.",
        502,
      );
    await tx.query(
      "UPDATE orders SET preference_id=$1,payment_url=$2 WHERE id=$3",
      [String(preference.id), url, current.id],
    );
    return url as string;
  });
}
export type VerifiedPayment = {
  id: string | number;
  external_reference: string;
  currency_id: string;
  transaction_amount: number;
  collector_id: string | number;
  live_mode: boolean;
  status: string;
  date_last_updated?: string;
};
export async function applyVerifiedPayment(payment: VerifiedPayment) {
  const live = process.env.MERCADOPAGO_MODE === "live";
  if (
    payment.currency_id !== "PEN" ||
    String(payment.collector_id) !== process.env.MERCADOPAGO_COLLECTOR_ID ||
    payment.live_mode !== live
  )
    throw new AppError(
      "La cuenta, moneda o entorno del pago no coincide.",
      400,
    );
  await db.transaction(async (tx) => {
    const order = (
      await tx.query<Order>("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
        payment.external_reference,
      ])
    ).rows[0];
    if (!order || order.method !== "mercadopago" || order.is_demo)
      throw new AppError("Pedido de pago no válido.");
    if (Math.abs(payment.transaction_amount * 100 - order.total) > 0.001)
      throw new AppError("El importe pagado no coincide con el pedido.");
    const providerId = String(payment.id);
    const previous = (
      await tx.query<{ order_id: string }>(
        "SELECT order_id FROM payments WHERE provider_id=$1",
        [providerId],
      )
    ).rows[0];
    if (previous && previous.order_id !== order.id)
      throw new AppError("El pago ya está asociado a otro pedido.");
    await tx.query(
      `INSERT INTO payments(provider_id,order_id,status,amount) VALUES($1,$2,$3,$4) ON CONFLICT(provider_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now()`,
      [providerId, order.id, payment.status, order.total],
    );
    await tx.query(
      "INSERT INTO payment_events(id,provider_id,status) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [
        hash(
          `${providerId}:${payment.status}:${payment.date_last_updated || ""}`,
        ),
        providerId,
        payment.status,
      ],
    );
    if (payment.status === "approved" && !order.stock_committed) {
      if (
        order.status === "pending" &&
        new Date(order.expires_at).getTime() > Date.now()
      )
        await commitStock(order, tx);
      else {
        if (order.status === "pending") await releaseReservation(order.id, tx);
        await tx.query(
          "UPDATE orders SET status='review',updated_at=now() WHERE id=$1",
          [order.id],
        );
      }
    } else if (
      ["rejected", "cancelled"].includes(payment.status) &&
      order.status === "pending"
    ) {
      await releaseReservation(order.id, tx);
      await tx.query(
        "UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1",
        [order.id],
      );
    } else if (
      ["refunded", "charged_back"].includes(payment.status) &&
      order.stock_committed
    ) {
      await tx.query(
        "UPDATE orders SET status=$1,updated_at=now() WHERE id=$2",
        [payment.status === "refunded" ? "refunded" : "review", order.id],
      );
    }
  });
}
export async function handleWebhook(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) throw new AppError("Notificaciones no configuradas.", 503);
  const url = new URL(request.url);
  const id = url.searchParams.get("data.id") || "";
  if (
    !/^[a-z0-9-]{1,100}$/i.test(id) ||
    !verifyWebhook(
      request.headers.get("x-signature") || "",
      request.headers.get("x-request-id") || "",
      id,
      secret,
    )
  )
    throw new AppError("Firma de notificación inválida.", 401);
  const body = await request.json();
  if (body.type !== "payment") return;
  if (String(body.data?.id) !== id)
    throw new AppError("Identificador de notificación inconsistente.");
  const payment = await provider(`/v1/payments/${encodeURIComponent(id)}`);
  await applyVerifiedPayment(payment);
}
