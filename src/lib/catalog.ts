import { db, type Queryable } from "./db";
import type { Product, Variant, Category, StoreSettings } from "./types";

export async function settings(q: Queryable = db) {
  const { rows } = await q.query<{ value: StoreSettings }>(
    "SELECT value FROM settings WHERE id='store'",
  );
  if (!rows[0])
    throw new Error("Ejecuta npm run db:setup antes de iniciar Leytech.");
  return {
    ...rows[0].value,
    orderChannel: rows[0].value.orderChannel || 'whatsapp',
    primaryColor: rows[0].value.primaryColor || "#2563eb",
    logoUrl: rows[0].value.logoUrl || "",
    heroImage: rows[0].value.heroImage || "/images/hero.jpg",
  };
}
export async function categories(all = false) {
  return (
    await db.query<Category>(
      `SELECT * FROM categories ${all ? "" : "WHERE active=true"} ORDER BY name`,
    )
  ).rows;
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
  } = {},
) {
  const params: unknown[] = [];
  const where: string[] = [
    options.all ? "true" : "p.status='published' AND c.active=true",
  ];
  if (!options.all && !(await settings()).demoMode) where.push('p.is_demo=false');
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (options.q)
    add(
      "(p.name ILIKE ? OR p.brand ILIKE ? OR p.summary ILIKE ? OR c.name ILIKE ?)",
      `%${options.q.slice(0, 120)}%`,
    );
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
  if (options.offer) variantFilters.push("v.compare_at>v.price");
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
          ? "p.created_at DESC"
          : "p.featured DESC,p.created_at DESC";
  const limit = options.all ? 1000 : 12;
  const page = Math.max(1, Math.min(Math.floor(options.page || 1), 10000));
  const { rows } = await db.query<Product & { min_price: number }>(
    `SELECT p.*, c.name AS category_name,c.slug AS category_slug,(SELECT min(v.price) FROM variants v WHERE v.product_id=p.id AND v.active=true) AS min_price ${base} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
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
      p.variants = variants.filter((v) => v.product_id === p.id);
    });
  }
  return { products: rows, total, page, pages: Math.ceil(total / limit) };
}
export async function productBySlug(slug: string, all = false) {
  const hideExamples = !all && !(await settings()).demoMode;
  const { rows } = await db.query<Product>(
    `SELECT p.*, c.name AS category_name,c.slug AS category_slug FROM products p JOIN categories c ON c.id=p.category_id WHERE p.slug=$1 ${all ? "" : "AND p.status='published' AND c.active=true"} ${hideExamples ? 'AND p.is_demo=false' : ''}`,
    [slug],
  );
  if (!rows[0]) return null;
  rows[0].variants = (
    await db.query<Variant>(
      `SELECT * FROM variants WHERE product_id=$1 ${all ? "" : "AND active=true"} ORDER BY sku`,
      [rows[0].id],
    )
  ).rows;
  return rows[0];
}
