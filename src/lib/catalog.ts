import { db, type Queryable } from "./db";
import type { Product, Variant, Category, StoreSettings } from "./types";
import { cache } from "react";
import { searchTerms } from "./search-terms";

export async function settings(q: Queryable = db) {
  const { rows } = await q.query<{ value: StoreSettings }>(
    "SELECT value FROM settings WHERE id='store'",
  );
  if (!rows[0])
    throw new Error("Ejecuta npm run db:setup antes de iniciar Leytech.");
  return {
    ...rows[0].value,
    orderChannel: rows[0].value.orderChannel || 'whatsapp',
    showSamples: rows[0].value.showSamples ?? true,
    primaryColor: rows[0].value.primaryColor || "#2563eb",
    logoUrl: rows[0].value.logoUrl || "",
    heroImage: rows[0].value.heroImage || "/images/hero.jpg",
  };
}
export const cachedSettings = cache(() => settings());

export function catalogVisibility(store: StoreSettings) {
  return store.showSamples ? "samples" : store.demoMode ? "demo" : "published";
}

// Queries use the same product and category aliases in the catalog, detail and filter options.
export function visibleProduct(parameter: string) {
  return `c.active=true AND (
    (p.status='published' AND (NOT p.is_demo OR ${parameter}::text <> 'published'))
    OR (p.status='draft' AND p.is_demo AND ${parameter}::text = 'samples')
  )`;
}

function publicVariants(variants: Variant[], sample: boolean) {
  return sample ? variants.map(v => ({ ...v, compare_at: null })) : variants;
}
export async function categories(all = false) {
  return (
    await db.query<Category>(
      `SELECT * FROM categories ${all ? "" : "WHERE active=true"} ORDER BY name`,
    )
  ).rows;
}
export async function hasActiveOffers() {
  const { rows } = await db.query<{ exists: boolean }>(`SELECT EXISTS (
    SELECT 1 FROM variants v JOIN products p ON p.id=v.product_id JOIN categories c ON c.id=p.category_id
    WHERE c.active AND p.status='published' AND NOT p.is_demo AND v.active AND v.compare_at>v.price
  )`);
  return rows[0].exists;
}
export async function products(
  options: {
    q?: string;
    category?: string;
    brand?: string;
    color?: string;
    min?: number;
    max?: number;
    sort?: string;
    offer?: boolean;
    page?: number;
    all?: boolean;
    featured?: boolean;
    limit?: number;
    preferReal?: boolean;
  } = {},
) {
  const params: unknown[] = options.all ? [] : [catalogVisibility(await settings())];
  const where: string[] = [
    options.all ? "true" : visibleProduct("$1"),
  ];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  const terms = searchTerms(options.q || "");
  for (const term of terms) {
    add(
      `(EXISTS (SELECT 1 FROM unnest(?::text[]) AS alias
                WHERE strpos(translate(lower(concat_ws(' ', p.name, p.brand, p.summary, p.description, p.specifications::text, c.name)), 'áéíóúü', 'aeiouu'), alias) > 0)
        OR EXISTS (SELECT 1 FROM variants search_variant WHERE search_variant.product_id=p.id AND search_variant.active=true
                   AND EXISTS (SELECT 1 FROM unnest(?::text[]) AS alias WHERE strpos(lower(search_variant.sku), alias) > 0)))`,
      term,
    );
  }
  if (options.category) add("c.slug=?", options.category);
  if (options.brand) add("p.brand=?", options.brand);
  const variantFilters = ["v.product_id=p.id", "v.active=true"];
  function variantFilter(sql: string, value: unknown) {
    params.push(value);
    variantFilters.push(sql.replace("?", `$${params.length}`));
  }
  if (options.color) variantFilter("v.color=?", options.color);
  if (options.min != null) variantFilter("v.price>=?", options.min);
  if (options.max != null) variantFilter("v.price<=?", options.max);
  if (options.offer) variantFilters.push("NOT p.is_demo AND v.compare_at>v.price");
  if (!options.all || variantFilters.length > 2)
    where.push(
      `EXISTS(SELECT 1 FROM variants v WHERE ${variantFilters.join(" AND ")})`,
    );
  if (options.featured) where.push("p.featured=true");
  const base = `FROM products p JOIN categories c ON c.id=p.category_id WHERE ${where.join(" AND ")}`;
  const total = Number(
    (await db.query<{ count: string }>(`SELECT count(*) ${base}`, params))
      .rows[0].count,
  );
  const order =
    options.sort === "price-asc"
      ? "min_price ASC"
      : options.sort === "price-desc"
        ? "min_price DESC"
        : options.sort === "newest"
        ? "p.created_at DESC,p.id"
          : "p.featured DESC,p.created_at DESC";
  const limit = options.all ? 1000 : Math.max(1, Math.min(12, Math.floor(options.limit || 12)));
  const page = Math.max(1, Math.min(Math.floor(options.page || 1), 10000));
  const { rows } = await db.query<Product & { min_price: number }>(
    `SELECT p.*, c.name AS category_name,c.slug AS category_slug,(SELECT min(v.price) FROM variants v WHERE v.product_id=p.id AND v.active=true) AS min_price ${base} ORDER BY ${options.preferReal ? "p.is_demo," : ""}${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params,
  );
  if (rows.length) {
    const variants = (
      await db.query<Variant>(
        `SELECT * FROM variants WHERE product_id=ANY($1::text[]) ${options.all ? "" : "AND active=true"} ORDER BY sku`,
        [rows.map((x) => x.id)],
      )
    ).rows;
    rows.forEach((p) => {
      p.variants = publicVariants(variants.filter((v) => v.product_id === p.id), !options.all && p.is_demo);
    });
  }
  return { products: rows, total, page, pages: Math.ceil(total / limit) };
}
export async function productBySlug(slug: string, all = false) {
  const params = all ? [slug] : [slug, catalogVisibility(await settings())];
  const { rows } = await db.query<Product>(
    `SELECT p.*, c.name AS category_name,c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id WHERE p.slug=$1 ${all ? "" : `AND ${visibleProduct("$2")}`}`,
    params,
  );
  if (!rows[0]) return null;
  rows[0].variants = publicVariants((
    await db.query<Variant>(
      `SELECT * FROM variants WHERE product_id=$1 ${all ? "" : "AND active=true"} ORDER BY sku`,
      [rows[0].id],
    )
  ).rows, !all && rows[0].is_demo);
  return rows[0];
}
export const cachedProductBySlug = cache((slug: string) => productBySlug(slug));
