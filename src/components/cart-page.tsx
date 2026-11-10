"use client";
import { useState, useEffect, useEffectEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  Trash2,
  MessageCircle,
  LoaderCircle,
  Check,
  Copy,
  ShieldCheck,
} from "lucide-react";
import { useCart } from "./cart-provider";
import { money } from "@/lib/format";
export function CartPage({ revision }: { revision: string }) {
  const cart = useCart();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [availabilityError, setAvailabilityError] = useState(""),
    [quote, setQuote] = useState<{ code: string; url: string } | null>(null);
  async function validate(signal?: AbortSignal) {
    const items = cart.items;
    const res = await fetch("/api/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const changed = data.items.some(
      (i: { priceChanged: boolean }) => i.priceChanged,
    );
    if (signal?.aborted) return;
    cart.replace(data.items, items);
    setAvailabilityError("");
    if (changed) {
      setQuote(null);
      cart.setNotice("Se actualizaron los precios. Revisa el nuevo total.");
    }
  }
  const validateUpdatedCart = useEffectEvent((signal: AbortSignal) => {
    if (!cart.items.length) return;
    validate(signal).catch((e) => {
      if (!signal.aborted) {
        setQuote(null);
        setAvailabilityError(e.message);
      }
    });
  });
  useEffect(() => {
    if (!cart.ready) return;
    const controller = new AbortController();
    validateUpdatedCart(controller.signal);
    return () => controller.abort();
  }, [cart.ready, revision]);
  async function getQuote() {
    setBusy("quote");
    setError("");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuote(data);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("precio"))
        await validate().catch(() => {});
    } finally {
      setBusy("");
    }
  }
  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (!cart.ready)
    return (
      <div
        className="skeleton"
        style={{ height: 300 }}
        aria-label="Cargando carrito"
      />
    );
  if (!cart.items.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={42} />
        <h1>Tu próximo upgrade te espera</h1>
        <p>
          Tu carrito está vacío. Explora el catálogo y encuentra algo para ti.
        </p>
        <Link href="/catalogo" className="btn btn-primary">
          Explorar productos <ArrowRight size={17} />
        </Link>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Mi carrito<span className="heading-dot">.</span>
          </h1>
          <p>
            {cart.count} producto{cart.count === 1 ? "" : "s"} para tu próximo
            upgrade
          </p>
        </div>
        <Link className="text-link" href="/catalogo">
          <ArrowLeft size={15} /> Seguir explorando
        </Link>
      </div>
          {(error || availabilityError) && (
        <div className="error-box" role="alert">
              {error || availabilityError}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              validate().catch((e) => setError(e.message));
            }}
            style={{ border: 0, background: "none", marginLeft: 10 }}
          >
            Revisar carrito
          </button>
        </div>
      )}
      <div className="cart-layout">
        <div>
          <div className="cart-list">
            {cart.items.map((i) => (
              <article className="cart-line" key={i.variantId}>
                <Link href={`/producto/${i.slug}`} className="cart-line-image">
                  <Image
                    src={i.image || "/images/placeholder.svg"}
                    alt={i.name}
                    fill
                    sizes="85px"
                  />
                </Link>
                <div>
                  <h3>
                    <Link href={`/producto/${i.slug}`}>{i.name}</Link>
                  </h3>
                  <p>
                    {i.variant} · {money(i.price)} por unidad
                  </p>
                  <div className="quantity">
                    <button
                      aria-label={`Reducir ${i.name}`}
                      disabled={i.quantity <= 1}
                      onClick={() => {
                        cart.update(i.variantId, i.quantity - 1);
                        setQuote(null);
                      }}
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={i.max}
                      value={i.quantity}
                      aria-label={`Cantidad de ${i.name}`}
                      onChange={(e) => {
                        cart.update(i.variantId, Number(e.target.value) || 1);
                        setQuote(null);
                      }}
                    />
                    <button
                      aria-label={`Aumentar ${i.name}`}
                      disabled={i.quantity >= i.max}
                      onClick={() => {
                        cart.update(i.variantId, i.quantity + 1);
                        setQuote(null);
                      }}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <div className="cart-line-total">
                  <strong>{money(i.price * i.quantity)}</strong>
                  <button
                    className="remove-button"
                    onClick={() => {
                      cart.remove(i.variantId);
                      setQuote(null);
                      setError("");
                    }}
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="info-box">
            <ShieldCheck
              size={16}
              style={{ verticalAlign: "middle", marginRight: 5 }}
            />
            Comprobamos el precio y la disponibilidad al preparar tu solicitud. Leytech confirma la compra contigo por WhatsApp.
          </div>
          {quote && (
            <div className="success-box" role="status">
              <strong>
                <Check size={17} style={{ verticalAlign: "middle" }} />{" "}
                Cotización {quote.code} registrada
              </strong>
              <p>
                Tu consulta está guardada. Abre WhatsApp y envía el mensaje para
                que podamos atenderte. Los productos aún no están reservados.
              </p>
              <a
                className="btn btn-whatsapp"
                href={quote.url}
                target="_blank"
                rel="noreferrer"
              >
                Abrir WhatsApp <MessageCircle size={18} />
              </a>
              <button
                className="btn btn-outline"
                style={{ marginLeft: 8 }}
                onClick={() =>
                  navigator.clipboard
                    .writeText(quote.code)
                    .then(() => cart.setNotice("Código copiado"))
                    .catch(() => cart.setNotice(quote.code))
                }
              >
                <Copy size={15} /> Copiar código
              </button>
            </div>
          )}
        </div>
        <aside className="order-summary">
          <h2>Resumen de tu carrito</h2>
          <div className="summary-row">
            <span>Subtotal ({cart.count} productos)</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <div className="summary-row">
            <span>Envío</span>
            <strong>Por calcular</strong>
          </div>
          <div className="summary-row summary-total">
            <span>Total estimado</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <button
            className="btn btn-primary full"
            onClick={getQuote}
            disabled={!!busy}
          >
            {busy === "quote" ? (
              <LoaderCircle size={17} className="spin" />
            ) : null}
            Enviar carrito por WhatsApp <MessageCircle size={17} />
          </button>
          <p className="summary-note">
            Generamos un resumen con código y productos. Acuerda la compra, el pago y la entrega con Leytech directamente por WhatsApp.
          </p>
          {cart.items.some(item => item.isSample) && <p className="summary-note">El carrito incluye productos de muestra. Sus precios son referenciales y su disponibilidad se consulta por WhatsApp.</p>}
        </aside>
      </div>
    </>
  );
}
