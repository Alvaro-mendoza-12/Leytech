import Link from "next/link";
import { Search, SlidersHorizontal, ChevronRight, X } from "lucide-react";
import { products, categories, settings } from "@/lib/catalog";
import { db } from "@/lib/db";
import { ProductGrid } from "@/components/store-ui";
import { CategoryIcon } from "@/components/icons";
import { ResponsiveFilters } from "@/components/responsive-filters";
export const metadata = { title: "Catálogo" };
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const store=await settings();
  const hasFilters=!!(p.q||p.categoria||p.marca||p.color||p.ofertas||p.min||p.max);
  const min =
      p.min && Number.isFinite(Number(p.min))
        ? Math.max(0, Math.round(Number(p.min) * 100))
        : undefined,
    max =
      p.max && Number.isFinite(Number(p.max))
        ? Math.max(0, Math.round(Number(p.max) * 100))
        : undefined;
  const [result, cats, brands, colors] = await Promise.all([
    products({
      q: p.q,
      category: p.categoria,
      brand: p.marca,
      color: p.color,
      min,
      max,
      sort: p.sort,
      offer: p.ofertas === "1",
      page: Number(p.pagina) || 1,
    }),
    categories(),
    db.query<{ brand: string }>(
      "SELECT DISTINCT p.brand FROM products p JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND c.active=true AND ($1::boolean OR p.is_demo=false) ORDER BY p.brand",[store.demoMode],
    ),
    db.query<{ color: string }>(
      "SELECT DISTINCT v.color FROM variants v JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND c.active=true AND ($1::boolean OR p.is_demo=false) AND v.active=true AND v.color<>'' ORDER BY v.color",[store.demoMode],
    ),
  ]);
  const active = cats.find((c) => c.slug === p.categoria);
  const title = p.q
    ? `Resultados para “${p.q}”`
    : active?.name ||
      (p.ofertas === "1" ? "Ofertas" : "Encuentra tu próximo upgrade");
  function href(overrides: Record<string, string>) {
    const query = new URLSearchParams(
      Object.entries({ ...p, ...overrides }).filter(([, v]) => !!v) as [
        string,
        string,
      ][],
    );
    return `/catalogo?${query}`;
  }
  return (
    <div className="container page-container">
      <nav className="breadcrumbs" aria-label="Ruta de navegación">
        <Link href="/">Inicio</Link>
        <ChevronRight size={13} />
        <span>Catálogo</span>
      </nav>
      <div className="catalog-title">
        <span className="catalog-symbol">
          <SlidersHorizontal size={23} />
        </span>
        <div>
          <h1>{title}</h1>
          <p>Tecnología para trabajar, jugar y todo lo demás.</p>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-filters">
          <ResponsiveFilters>
            <summary>
              <SlidersHorizontal size={18} /> Filtrar productos <span />
            </summary>
            <form action="/catalogo">
              <label>
                Buscar
                <div className="filter-search">
                  <Search size={16} />
                  <input
                    name="q"
                    defaultValue={p.q}
                    placeholder="Producto, marca…"
                  />
                </div>
              </label>
              <fieldset>
                <legend>Categorías</legend>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="categoria"
                    value=""
                    defaultChecked={!p.categoria}
                  />
                  Todas las categorías
                </label>
                {cats.map((c) => (
                  <label key={c.id} className="radio-label">
                    <input
                      type="radio"
                      name="categoria"
                      value={c.slug}
                      defaultChecked={p.categoria === c.slug}
                    />
                    <CategoryIcon name={c.icon} size={16} />
                    {c.name}
                  </label>
                ))}
              </fieldset>
              <label>
                Marca
                <select name="marca" defaultValue={p.marca || ""}>
                  <option value="">Todas las marcas</option>
                  {brands.rows.map((b) => (
                    <option key={b.brand}>{b.brand}</option>
                  ))}
                </select>
              </label>
              <label>
                Color
                <select name="color" defaultValue={p.color || ""}>
                  <option value="">Todos los colores</option>
                  {colors.rows.map((c) => (
                    <option key={c.color}>{c.color}</option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Precio (S/)</legend>
                <div className="price-filter">
                  <input
                    name="min"
                    type="number"
                    min="0"
                    placeholder="Desde"
                    aria-label="Precio mínimo"
                    defaultValue={p.min}
                  />
                  <span>—</span>
                  <input
                    name="max"
                    type="number"
                    min="0"
                    placeholder="Hasta"
                    aria-label="Precio máximo"
                    defaultValue={p.max}
                  />
                </div>
              </fieldset>
              <label className="radio-label">
                <input
                  name="ofertas"
                  type="checkbox"
                  value="1"
                  defaultChecked={p.ofertas === "1"}
                />
                Solo ofertas
              </label>
              <label>
                Ordenar por
                <select name="sort" defaultValue={p.sort || "relevance"}>
                  <option value="relevance">Recomendados</option>
                  <option value="newest">Más recientes</option>
                  <option value="price-asc">Menor precio</option>
                  <option value="price-desc">Mayor precio</option>
                </select>
              </label>
              <button type="submit" className="btn btn-primary full">
                Aplicar filtros
              </button>
              <Link href="/catalogo" className="clear-filters">
                Limpiar filtros
              </Link>
            </form>
          </ResponsiveFilters>
        </aside>
        <section className="catalog-results" aria-label="Productos">
          <div className="results-bar">
            <span>
              <strong>{result.total}</strong> producto
              {result.total !== 1 ? "s" : ""}
            </span>
            {(p.categoria ||
              p.q ||
              p.marca ||
              p.color ||
              p.ofertas ||
              p.min ||
              p.max) && (
              <Link href="/catalogo" className="filter-chip">
                Quitar filtros <X size={13} />
              </Link>
            )}
            <small>Precios en soles</small>
          </div>
          {result.products.length ? (
            <ProductGrid products={result.products} eagerFirstRow />
          ) : (
            <div className="empty-state">
              <Search size={40} />
              <h2>
                {p.ofertas === "1"
                  ? "Aún no hay ofertas publicadas"
                  : hasFilters ? "No encontramos productos" : "Estamos preparando nuestro catálogo"}
              </h2>
              <p>
                {p.ofertas === "1"
                  ? "Cuando Leytech publique promociones reales, aparecerán aquí."
                  : hasFilters ? "Prueba otra palabra o ajusta los filtros." : "Escríbenos y te ayudaremos a encontrar el producto que buscas."}
              </p>
              {!hasFilters ? <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noreferrer" className="btn btn-whatsapp">Consultar por WhatsApp</a> : <Link href="/catalogo" className="btn btn-primary">
                Ver todo el catálogo
              </Link>}
            </div>
          )}
          {result.pages > 1 && (
            <nav className="pagination" aria-label="Páginas del catálogo">
              {Array.from({ length: result.pages }, (_, i) => (
                <Link
                  key={i}
                  className={result.page === i + 1 ? "active" : ""}
                  href={href({ pagina: String(i + 1) })}
                  aria-current={result.page === i + 1 ? "page" : undefined}
                >
                  {i + 1}
                </Link>
              ))}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
