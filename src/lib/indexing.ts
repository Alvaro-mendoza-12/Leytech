import { db } from "./db";
import { siteUrl } from "./site";
import { publicInfo } from "./seo";

// Call after committed edits so indexing cannot delay or undo a saved change.
export async function notifyIndexNow(productId?: string) {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (process.env.VERCEL_ENV !== "production" || !key || !/^[a-f0-9]{32}$/.test(key)) return;
  try {
    const origin = new URL(siteUrl());
    if (origin.protocol !== "https:") return;
    const paths = ["/", "/catalogo"];
    if (productId) {
      const { rows } = await db.query<{ slug: string; category: string; is_demo: boolean }>(
        "SELECT p.slug,p.is_demo,c.slug AS category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=$1", [productId],
      );
      const product = rows[0];
      if (!product || product.is_demo) return;
      paths.push(`/producto/${product.slug}`, `/catalogo?categoria=${encodeURIComponent(product.category)}`);
    } else paths.push(...Object.keys(publicInfo).map(slug => `/informacion/${slug}`), "/reclamaciones");
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: origin.host, key, keyLocation: new URL(`/${key}.txt`, origin).href,
        urlList: paths.map(path => new URL(path, origin).href) }),
      signal: AbortSignal.timeout(6000),
    });
    if (![200, 202].includes(response.status)) console.warn(`[indexnow] Submission returned ${response.status}`);
  } catch {
    console.warn("[indexnow] Submission could not be completed. URLs remain available in sitemap.xml.");
  }
}
