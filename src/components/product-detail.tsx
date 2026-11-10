"use client";
import { useState } from "react";
import Image from "next/image";
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
    [imageIndex, setImageIndex] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [quote, setQuote] = useState<{ code: string; url: string; variantId: string; price: number; quantity: number } | null>(null);
  const cart = useCart();
  if (!v) return <p>Este producto no tiene variantes publicadas.</p>;
  const available = p.is_demo ? 99 : v.stock - v.reserved;
  const quantity = Math.max(1, Math.min(requestedQuantity, available, 99));
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="product-detail">
        <div className="gallery">
          <div className="gallery-main">
            <Image
              src={v.image || p.images[imageIndex] || "/images/placeholder.svg"}
              alt={`${p.name}, ${v.name}`}
              fill
              priority
              sizes="(max-width:800px) 100vw,50vw"
            />
            {p.is_demo && (
              <span className="product-badge blue">
                Producto de muestra
              </span>
            )}
          </div>
          <div className="thumbnails">
            {p.images.map((url, i) => (
              <button
                key={url}
                onClick={() => setImageIndex(i)}
                className={imageIndex === i ? "selected" : ""}
                aria-label={`Ver fotografía ${i + 1}`}
              >
                <Image src={url} alt="" width={80} height={80} />
              </button>
            ))}
          </div>
          <p className="image-note">
            {p.is_demo
              ? "Fotografía ilustrativa; no representa un modelo comercial específico."
              : "Las imágenes corresponden al catálogo del negocio."}
          </p>
        </div>
        <div className="product-info">
          <Link
            href={`/catalogo?categoria=${p.category_slug}`}
            className="text-link"
          >
            {p.category_name} <ChevronRight size={14} />
          </Link>
          <p className="product-brand">{p.brand}</p>
          <h1>{p.name}</h1>
          <p className="product-summary">{p.summary}</p>
          <p className="sku">SKU: {v.sku}</p>
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
                  className={`variant-option ${i.id === v.id ? "selected" : ""} ${!p.is_demo && i.stock - i.reserved === 0 ? "unavailable" : ""}`}
                  onClick={() => {
                    setVariantId(i.id);
                    setQuantity(1);
                    setQuote(null);
                  }}
                  aria-pressed={i.id === v.id}
                >
                  {i.color && <i style={{ background: i.color_hex }} />}
                  {i.name}
                  {!p.is_demo && i.stock - i.reserved === 0 && <small>Agotado</small>}
                </button>
              ))}
            </div>
          </div>
          {p.is_demo ? <p className="image-note">Precio referencial. Consulta disponibilidad por WhatsApp.</p> : <p className={`availability ${available ? "" : "sold-out"}`}>
            {available ? <Check size={17} /> : <span>×</span>}
            {available
              ? `${available} unidades disponibles`
              : "Esta variante está agotada"}
          </p>}
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
                max={Math.min(available, 99)}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(
                      1,
                      Math.min(Number(e.target.value) || 1, available, 99),
                    ),
                  )
                }
              />
              <button
                onClick={() =>
                  setQuantity(Math.min(available, 99, quantity + 1))
                }
                disabled={quantity >= Math.min(available, 99)}
                aria-label="Aumentar cantidad"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className="btn btn-primary"
              disabled={!available}
              onClick={() =>
                cart.add({
                  variantId: v.id,
                  quantity,
                  price: v.price,
                  name: p.name,
                  variant: v.name,
                  image: v.image || p.images[0],
                  slug: p.slug,
                  max: available,
                  isSample: p.is_demo,
                })
              }
            >
              <ShoppingCart size={18} /> Agregar al carrito
            </button>
          </div>
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
