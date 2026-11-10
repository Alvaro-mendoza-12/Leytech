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
import type { StoredLine } from "./cart-provider";
import { money } from "@/lib/format";
import { announceUpdate } from "./live-updates";

const quoteStorage = "leytech-last-quote-v1";
type SavedQuote = { code: string; url: string; items: string };
function cartKey(items: StoredLine[]) {
  return JSON.stringify(items.map(i => [i.variantId, i.quantity, i.price]).sort());
}

function QuoteReceipt({ quote, current }: { quote: SavedQuote; current: boolean }) {
  const { setNotice } = useCart();
  return <section className="success-box quote-receipt" aria-label="Última cotización guardada">
    <strong><Check size={17} aria-hidden="true" /> Cotización {quote.code}</strong>
    <p>{current ? "Envía el resumen en WhatsApp para que podamos atenderte."
      : "Este código corresponde a una consulta anterior. Puedes volver a abrirla en WhatsApp."}</p>
    <div className="quote-receipt-actions">
      <a className="btn btn-whatsapp" href={quote.url} target="_blank" rel="noreferrer">
        Abrir WhatsApp <MessageCircle size={18} />
      </a>
      <button className="btn btn-outline" onClick={async () => {
        try { await navigator.clipboard.writeText(quote.code); setNotice("Código copiado"); }
        catch { setNotice(quote.code); }
      }}><Copy size={15} /> Copiar código</button>
    </div>
  </section>;
}

export function CartPage({ revision }: { revision: string }) {
  const cart = useCart();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [availabilityError, setAvailabilityError] = useState(""),
    [quote, setQuote] = useState<SavedQuote | null>(null);
  const currentQuote = quote?.items === cartKey(cart.items) && !availabilityError;
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(quoteStorage) || "null");
      if (stored && typeof stored.code === "string" && /^COT-\d{5,}$/.test(stored.code)
        && typeof stored.items === "string" && typeof stored.url === "string"
        && /^https:\/\/wa\.me\/\d{9,15}\?/.test(stored.url)) setQuote(stored);
    } catch { /* Storage may be unavailable in private browsing. */ }
  }, []);
  async function validate(signal?: AbortSignal) {
    const items = cart.items;
    const res = await fetch("/api/cart/validate?adjust=1", {
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
    if (data.adjusted) {
      cart.setNotice("Ajustamos el carrito al stock disponible. Revisa las cantidades.");
    } else if (changed) {
      cart.setNotice("Se actualizaron los precios. Revisa el nuevo total.");
    }
  }
  const validateUpdatedCart = useEffectEvent((signal: AbortSignal) => {
    if (!cart.items.length) return;
    validate(signal).catch((e) => {
      if (!signal.aborted) {
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
    const items = cart.items;
    setBusy("quote");
    setError("");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const saved = { code: data.code, url: data.url, items: cartKey(items) };
      setQuote(saved);
      setAvailabilityError("");
      try { localStorage.setItem(quoteStorage, JSON.stringify(saved)); } catch {}
      announceUpdate("admin");
    } catch (e) {
      setError((e as Error).message);
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
        {quote && <QuoteReceipt quote={quote} current={false} />}
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
                      }}
                    />
                    <button
                      aria-label={`Aumentar ${i.name}`}
                      disabled={i.quantity >= i.max}
                      onClick={() => {
                        cart.update(i.variantId, i.quantity + 1);
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
          {!currentQuote && <button
            className="btn btn-primary full"
            onClick={getQuote}
            disabled={!!busy}
          >
            {busy === "quote" ? (
              <LoaderCircle size={17} className="spin" />
            ) : null}
            {busy ? "Preparando…" : "Preparar cotización"} <MessageCircle size={17} />
          </button>}
          {quote && <QuoteReceipt quote={quote} current={currentQuote} />}
          <p className="summary-note">
            Prepara el resumen y envíalo por WhatsApp para acordar la compra, el pago y la entrega. La cotización queda guardada en este navegador.
          </p>
          {cart.items.some(item => item.isSample) && <p className="summary-note">El carrito incluye productos de muestra. Sus precios son referenciales y su disponibilidad se consulta por WhatsApp.</p>}
        </aside>
      </div>
    </>
  );
}
