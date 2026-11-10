import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { productBySlug, products, settings } from "@/lib/catalog";
import { ProductDetail } from "@/components/product-detail";
import { ProductGrid } from "@/components/store-ui";
import { siteUrl } from "@/lib/site";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await productBySlug((await params).slug);
  return {
    title: p?.seo_title || p?.name || "Producto no encontrado",
    description: p?.seo_description || p?.summary,
  };
}
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variante?: string }>;
}) {
  const p = await productBySlug((await params).slug);
  if (!p) notFound();
  const [related, s, search] = await Promise.all([
    products({ category: p.category_slug }),
    settings(),
    searchParams,
  ]);
  const origin = siteUrl();
  return (
    <div className="container page-container">
      <nav aria-label="Ruta de navegación" className="breadcrumbs">
        <Link href="/">Inicio</Link>
        <ChevronRight size={13} />
        <Link href="/catalogo">Catálogo</Link>
        <ChevronRight size={13} />
        <span>{p.name}</span>
      </nav>
      <ProductDetail
        product={p}
        initialVariant={
          p.variants.some((v) => v.id === search.variante)
            ? search.variante
            : undefined
        }
      />
      {!p.is_demo && !s.demoMode && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: p.name,
              description: p.summary,
              image: p.images.map(
                (i) => `${origin}${i}`,
              ),
              brand: { "@type": "Brand", name: p.brand },
              offers: p.variants.map((v) => ({
                "@type": "Offer",
                sku: v.sku,
                price: (v.price / 100).toFixed(2),
                priceCurrency: "PEN",
                availability: `https://schema.org/${v.stock - v.reserved > 0 ? "InStock" : "OutOfStock"}`,
                url: `${origin}/producto/${p.slug}`,
              })),
            }).replace(/</g, "\u003c"),
          }}
        />
      )}
      <section className="section">
        <div className="section-heading">
          <h2>También te puede gustar</h2>
          <Link
            href={`/catalogo?categoria=${p.category_slug}`}
            className="text-link"
          >
            Ver categoría
          </Link>
        </div>
        <ProductGrid
          products={related.products.filter((i) => i.id !== p.id).slice(0, 4)}
        />
      </section>
    </div>
  );
}
