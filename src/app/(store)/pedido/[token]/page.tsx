import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MessageCircle, Check } from "lucide-react";
import { db } from "@/lib/db";
import { expireOrders } from "@/lib/commerce";
import { settings } from "@/lib/catalog";
import { money, orderCode, date, statusLabel } from "@/lib/format";
import type { Order } from "@/lib/types";
import { PaymentRetry } from "@/components/payment-retry";
export const metadata = {
  title: "Estado de mi pedido",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  await expireOrders();
  const o = (
    await db.query<Order>("SELECT * FROM orders WHERE public_token=$1", [token])
  ).rows[0];
  if (!o) notFound();
  const s = await settings();
  const code = orderCode(o.code);
  return (
    <div className="container page-container">
      <div className="order-confirmation">
        <div className="order-confirmation-header">
          <span className="confirmation-icon">
            {o.status === "paid" ? <Check size={29} /> : <Clock size={29} />}
          </span>
          <span className={`badge ${o.status}`}>{statusLabel[o.status]}</span>
          <h1 style={{ marginTop: 17 }}>
            {o.status === "paid"
              ? "Tu pago está confirmado."
              : o.status === "pending"
                ? "Recibimos tu pedido."
                : "Estado de tu pedido"}
          </h1>
          <p>
            {code} · {date(o.created_at)}
          </p>
        </div>
        {o.is_demo && (
          <div className="info-box">
            <strong>Pedido de demostración.</strong> No se realizó ningún cobro
            ni se coordinará una entrega real.
          </div>
        )}
        {o.status === "pending" && (
          <div className="info-box">
            Tu pedido está pendiente de pago. Reservamos los productos hasta{" "}
            {date(o.expires_at)}.{" "}
            {o.method === "transfer" && s.transferInstructions}
          </div>
        )}
        {o.status === "review" && (
          <div className="info-box">
            El pedido necesita revisión del equipo. Comunícate con Leytech para
            confirmar el pago y la disponibilidad.
          </div>
        )}
        <div className="form-panel">
          <h2>Resumen del pedido</h2>
          {o.items.map((i) => (
            <div className="summary-row" key={i.variantId}>
              <div>
                {i.name}
                <br />
                <small style={{ color: "var(--muted)" }}>
                  {i.variant} · {i.quantity} × {money(i.price)}
                </small>
              </div>
              <strong>{money(i.price * i.quantity)}</strong>
            </div>
          ))}
          <div className="summary-row">
            <span>Entrega</span>
            <strong>{money(o.shipping)}</strong>
          </div>
          <div className="summary-row summary-total">
            <span>Total</span>
            <strong>{money(o.total)}</strong>
          </div>
          <div className="order-meta">
            <div>
              <span>Cliente</span>
              {o.customer.name}
            </div>
            <div>
              <span>Entrega</span>
              {o.is_demo
                ? "Demostración"
                : o.customer.delivery === "pickup"
                  ? "Recojo"
                  : o.customer.delivery === "digital"
                    ? "Digital"
                    : o.customer.district}
            </div>
            <div>
              <span>Preparación</span>
              {statusLabel[o.fulfillment]}
            </div>
          </div>
        </div>
        {o.status === "pending" && o.method === "mercadopago" && (
          <PaymentRetry token={token} />
        )}
        <a
          className="btn btn-whatsapp"
          style={{ marginRight: 10, marginBottom: 10 }}
          href={`https://wa.me/${s.whatsapp}?text=${encodeURIComponent(`Hola Leytech, tengo una consulta sobre mi pedido ${code}.`)}`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={17} /> Consultar mi pedido
        </a>
        <Link href="/catalogo" className="btn btn-outline">
          Seguir explorando
        </Link>
        <p className="summary-note">
          Conserva este enlace para consultar el estado. Contiene un código
          privado de acceso a tu pedido.
        </p>
      </div>
    </div>
  );
}
