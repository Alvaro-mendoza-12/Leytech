"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  MessageCircle,
  Minus,
  Plus,
  Check,
  ShieldCheck,
  Truck,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { useCart } from "./cart-provider";
import type { Product } from "@/lib/types";
import { money } from "@/lib/format";
import { announceUpdate } from "./live-updates";
import { ProductGallery } from "./product-gallery";
export function ProductDetail({
  product: p,
  initialVariant,
}: {
  product: Product;
  initialVariant?: string;
}) {
  const [variantId, setVariantId] = useState(
    initialVariant ||
      p.variants.find((v) => v.stock - v.reserved > 0)?.id ||
      p.variants[0]?.id,
  );
  const v = p.variants.find((v) => v.id === variantId) || p.variants[0];
  const [requestedQuantity, setQuantity] = useState(1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [quote, setQuote] = useState<{ code: string; url: string; variantId: string; price: number; quantity: number } | null>(null);
  const cart = useCart();
  if (!v) return <p>Este producto no tiene variantes publicadas.</p>;
  const available = Math.max(0, v.stock - v.reserved);
  const inCart = cart.items.find(item => item.variantId === v.id)?.quantity ?? 0;
  const remaining = Math.max(0, Math.min(available, 99) - inCart);
  const maxQuantity = Math.max(1, remaining);
  const quantity = Math.min(requestedQuantity, maxQuantity);
  const canAdd = cart.ready && remaining > 0;
  const mainImage = v.image || p.images[0] || "/images/placeholder.svg";
  const images = [...new Set([mainImage, ...p.images])];
  async function quoteProduct() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ variantId: v.id, quantity, price: v.price }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuote({ code: data.code, url: data.url, variantId: v.id, price: v.price, quantity });
      announceUpdate("admin");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="product-detail">
        <ProductGallery key={v.id} images={images} name={`${p.name}, ${v.name}`} sample={p.is_demo} />
        <div className="product-info">
          <Link
            href={`/catalogo?categoria=${p.category_slug}`}
            className="text-link"
          >
            {p.category_name} <ChevronRight size={14} />
          </Link>
          <div className="product-identity">
            <span className="product-brand">{p.brand}</span>
            <span className="sku">SKU {v.sku}</span>
          </div>
          <h1>{p.name}</h1>
          <p className="product-summary">{p.summary}</p>
          <div className="product-buy-box">
            <div className="detail-price">
              <strong>{money(v.price)}</strong>
              {v.compare_at && <del>{money(v.compare_at)}</del>}
              <small>
                {p.is_demo
                  ? "Precio de ejemplo. No constituye una oferta comercial."
                  : "Precio final al consumidor. Envío calculado antes de confirmar."}
              </small>
            </div>
            <div className="variant-picker">
              <span>
                Variante: <strong>{v.name}</strong>
              </span>
              <div>
                {p.variants.map((i) => (
                  <button
                    key={i.id}
                    className={`variant-option ${i.id === v.id ? "selected" : ""} ${i.stock - i.reserved === 0 ? "unavailable" : ""}`}
                    onClick={() => {
                      setVariantId(i.id);
                      setQuantity(1);
                      setError("");
                      setQuote(null);
                    }}
                    aria-pressed={i.id === v.id}
                  >
                    {i.color && <i style={{ background: i.color_hex }} />}
                    {i.name}
                    {i.stock - i.reserved === 0 && <small>Agotado</small>}
                  </button>
                ))}
              </div>
            </div>
            <p className={`availability ${available ? "" : "sold-out"}`}>
              {available ? <Check size={17} /> : <span>×</span>}
              <span>{available
                ? p.is_demo ? `${available} unidades de muestra` : `${available} unidades disponibles`
                : "Esta variante está agotada"}</span>
              {inCart > 0 && <small>{inCart} en tu carrito</small>}
            </p>
            <div className="purchase-row">
              <div className="quantity">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  aria-label="Reducir cantidad"
                >
                  <Minus size={16} />
                </button>
                <input
                  aria-label="Cantidad"
                  type="number"
                  min={1}
                  max={maxQuantity}
                  disabled={!canAdd}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(Math.trunc(Number(e.target.value)) || 1, maxQuantity),
                      ),
                    )
                  }
                />
                <button
                  onClick={() =>
                    setQuantity(Math.min(maxQuantity, quantity + 1))
                  }
                  disabled={!canAdd || quantity >= maxQuantity}
                  aria-label="Aumentar cantidad"
                >
                  <Plus size={16} />
                </button>
              </div>
              <button
                className="btn btn-primary"
                disabled={!canAdd}
                onClick={() =>
                  cart.add({
                    variantId: v.id,
                    quantity,
                    price: v.price,
                    name: p.name,
                    variant: v.name,
                    image: v.image || p.images[0],
                    slug: p.slug,
                    max: Math.min(available, 99),
                    isSample: p.is_demo,
                  })
                }
              >
                <ShoppingCart size={18} /> {available > 0 && remaining === 0 ? "Límite en tu carrito" : "Agregar al carrito"}
              </button>
            </div>
            {inCart > 0 && remaining > 0 && (
              <p className="cart-stock-note">Puedes agregar hasta {remaining} más.</p>
            )}
            <button
              className="btn btn-whatsapp full"
              disabled={!available || loading}
              onClick={quoteProduct}
            >
              {loading ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <MessageCircle size={19} />
              )}{" "}
              Cotizar por WhatsApp
            </button>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            {quote && quote.variantId === v.id && quote.price === v.price && quote.quantity === quantity && available >= quantity && (
              <div className="success-box" role="status">
                <strong>Cotización {quote.code} registrada</strong>
                <p>Abre WhatsApp para enviar tu consulta a Leytech.</p>
                <a
                  href={quote.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-whatsapp"
                >
                  Abrir WhatsApp <MessageCircle size={17} />
                </a>
              </div>
            )}
          </div>
          <div className="detail-assurances">
            <div>
              <Truck size={21} />
              <span>
                <strong>Coordinamos tu entrega</strong>
                <small>Consulta cobertura y costo antes de comprar.</small>
              </span>
            </div>
            <div>
              <ShieldCheck size={21} />
              <span>
                <strong>Información de garantía</strong>
                <small>
                  {p.warranty || "Consulta las condiciones antes de comprar."}
                </small>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="detail-description">
        <section>
          <h2>Conoce tu próximo upgrade</h2>
          <p>{p.description}</p>
          {p.type === "digital" && (
            <div className="info-box">
              Entrega digital manual por personal autorizado, después de
              confirmar el pago. Las claves no se muestran públicamente.
            </div>
          )}
        </section>
        <section>
          <h2>Características técnicas</h2>
          <dl className="specs">
            {Object.entries(p.specifications).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
