"use client";
import Link from "next/link";
import Image from "next/image";
import { ShoppingCart, Plus, Check, ArrowRight } from "lucide-react";
import { useCart } from "./cart-provider";
import type { Product } from "@/lib/types";
import { money } from "@/lib/format";
export function CartLink() {
  const { count } = useCart();
  return (
    <Link
      href="/carrito"
      className="cart-link"
      aria-label={`Carrito, ${count} productos`}
    >
      <span className="cart-icon">
        <ShoppingCart size={24} />
        {count > 0 && <b>{count}</b>}
      </span>
      <span>
        Mi carrito
        <strong>
          {count === 0
            ? "Tu próximo upgrade"
            : `${count} producto${count === 1 ? "" : "s"}`}
        </strong>
      </span>
    </Link>
  );
}
export function ProductCard({
  product: p,
  eager = false,
}: {
  product: Product;
  eager?: boolean;
}) {
  const cart = useCart();
  const v = p.variants.find((x) => x.stock - x.reserved > 0) || p.variants[0];
  if (!v) return null;
  const stock = p.variants.reduce((s, i) => s + i.stock - i.reserved, 0);
  const discount = v.compare_at
    ? Math.round((1 - v.price / v.compare_at) * 100)
    : 0;
  return (
    <article className="product-card">
      <div className="product-photo">
        <Link href={`/producto/${p.slug}`} tabIndex={-1} aria-hidden="true">
          <Image
            src={p.images[0] || "/images/placeholder.svg"}
            alt={p.name}
            fill
            loading={eager ? "eager" : "lazy"}
            sizes="(max-width:600px) 50vw,(max-width:1000px) 33vw,25vw"
          />
        </Link>
        {p.is_demo && <span className="product-badge blue">Muestra</span>}
        {!p.is_demo && discount > 0 && (
          <span className="product-badge">
            -{discount}%
          </span>
        )}
        {!p.is_demo && p.type === "digital" && (
          <span className="product-badge blue">Digital</span>
        )}
      </div>
      <div className="product-card-content">
        <span className="product-brand">{p.brand}</span>
        <Link className="product-name" href={`/producto/${p.slug}`}>
          {p.name}
        </Link>
        <span className="product-card-detail">
          {Object.values(p.specifications).slice(0, 2).join(" · ")}
        </span>
        <div className="product-swatches">
          {p.variants
            .filter((i) => i.color)
            .map((i) => (
              <Link
                key={i.id}
                href={`/producto/${p.slug}?variante=${i.id}`}
                title={`${i.color}${i.stock - i.reserved === 0 ? " (agotado)" : ""}`}
                aria-label={`Ver ${p.name} en ${i.color}`}
                style={{ background: i.color_hex }}
                className={i.stock - i.reserved === 0 ? "out" : ""}
              />
            ))}
          {p.variants.length > 1 && <small>{p.variants.length} colores</small>}
        </div>
        <div className="price-row">
          <div>
            {v.compare_at && <del>{money(v.compare_at)}</del>}
            <strong>{money(v.price)}</strong>
          </div>
          <button
            className="quick-add"
            title={`Agregar ${p.name} (${v.name})`}
            aria-label={`Agregar ${p.name} al carrito`}
            disabled={!stock}
            onClick={() =>
              cart.add({
                variantId: v.id,
                name: p.name,
                variant: v.name,
                quantity: 1,
                price: v.price,
                image: v.image || p.images[0],
                slug: p.slug,
                max: Math.min(99, v.stock - v.reserved),
                isSample: p.is_demo,
              })
            }
          >
            <Plus size={20} />
          </button>
        </div>
        {p.is_demo ? <small className="image-note">Stock de muestra: {stock} · precio referencial</small> : (
          <span className={`stock-label ${stock ? "" : "no-stock"}`}>
            <span />
            {stock ? `Stock disponible: ${stock}` : "Agotado"}
          </span>
        )}
      </div>
    </article>
  );
}
export function ProductGrid({
  products,
  eagerFirstRow = false,
}: {
  products: Product[];
  eagerFirstRow?: boolean;
}) {
  return (
    <div className="product-grid">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} eager={eagerFirstRow && i < 3} />
      ))}
    </div>
  );
}
export function ContinueLink() {
  return (
    <Link href="/catalogo" className="btn btn-primary">
      Explorar productos <ArrowRight size={17} />
    </Link>
  );
}
