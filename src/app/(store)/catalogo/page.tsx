import Link from "next/link";
import { Search, SlidersHorizontal, ChevronRight, X } from "lucide-react";
import { products, categories, cachedSettings, catalogVisibility, visibleProduct } from "@/lib/catalog";
import { db } from "@/lib/db";
import { ProductGrid } from "@/components/store-ui";
import { CategoryIcon } from "@/components/icons";
import { ResponsiveFilters } from "@/components/responsive-filters";
import { publicMetadata, storeDescription } from "@/lib/seo";

type Query = Promise<Record<string, string | string[] | undefined>>;
async function readParams(searchParams: Query) {
  return Object.fromEntries(Object.entries(await searchParams).flatMap(([key, value]) =>
    typeof value === "string" && value.trim() ? [[key, value.trim().slice(0, 120)]] : []));
}

export async function generateMetadata({ searchParams }: { searchParams: Query }) {
  const [store, p] = await Promise.all([cachedSettings(), readParams(searchParams)]);
  const category = p.categoria ? (await categories()).find(c => c.slug === p.categoria) : undefined;
  return publicMetadata(store, {
    path: category ? `/catalogo?categoria=${encodeURIComponent(category.slug)}` : "/catalogo",
    title: category?.name || "Catálogo de tecnología",
    description: category ? `Explora ${category.name.toLowerCase()} en ${store.name}. Compara variantes, precios en soles y stock. Cotiza por WhatsApp.` : storeDescription,
    index: !["q", "marca", "color", "min", "max", "ofertas", "sort", "pagina"].some(key => p[key]) && (!p.categoria || !!category),
  });
}
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Query;
}) {
  const p = await readParams(searchParams);
  const store = await cachedSettings();
  const visibility = catalogVisibility(store);
  const hasFilters=!!(p.q||p.categoria||p.marca||p.color||p.ofertas||p.min||p.max);
  const cents = (value?: string) => value && Number.isFinite(Number(value))
    ? Math.max(0, Math.min(100_000_000, Math.round(Number(value) * 100))) : undefined;
  let min = cents(p.min), max = cents(p.max);
  const swapped = min !== undefined && max !== undefined && min > max;
  if (swapped) [min, max] = [max, min];
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
      `SELECT DISTINCT p.brand FROM products p JOIN categories c ON c.id=p.category_id WHERE ${visibleProduct("$1")} ORDER BY p.brand`, [visibility],
    ),
    db.query<{ color: string }>(
      `SELECT DISTINCT v.color FROM variants v JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id WHERE ${visibleProduct("$1")} AND v.active=true AND v.color<>'' ORDER BY v.color`, [visibility],
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
    return query.size ? `/catalogo?${query}` : "/catalogo";
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
          <p>{result.products.some(item => item.is_demo) ? "Los productos de muestra tienen precios referenciales. Consulta su disponibilidad por WhatsApp." : "Tecnología para trabajar, jugar y todo lo demás."}</p>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-filters">
          <ResponsiveFilters>
            <summary>
              <SlidersHorizontal size={18} /> Filtrar productos <span />
            </summary>
            <form action="/catalogo" key={JSON.stringify(p)}>
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
                    step="0.01"
                    placeholder="Desde"
                    aria-label="Precio mínimo"
                    defaultValue={min === undefined ? undefined : min / 100}
                  />
                  <span>—</span>
                  <input
                    name="max"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Hasta"
                    aria-label="Precio máximo"
                    defaultValue={max === undefined ? undefined : max / 100}
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
          {swapped && <p className="info-box" role="status">Ordenamos el rango de menor a mayor. Mostrando productos entre S/ {(min! / 100).toFixed(2)} y S/ {(max! / 100).toFixed(2)}.</p>}
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
              <Link href={p.ofertas === "1" ? href({ ofertas: "", pagina: "" }) : "/catalogo"} className="filter-chip">
                {p.ofertas === "1" ? "Quitar ofertas" : "Quitar filtros"} <X size={13} />
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
