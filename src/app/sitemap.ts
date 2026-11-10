import type { MetadataRoute } from "next";
import { settings } from "@/lib/catalog";
import { db } from "@/lib/db";
import {siteUrl} from '@/lib/site';
import { publicInfo } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl(),
    s = await settings();
  if (s.demoMode) return [];
  const { rows } = await db.query<{ slug: string; updated_at: string; category: string }>(`SELECT p.slug,p.updated_at,c.slug AS category
    FROM products p JOIN categories c ON c.id=p.category_id
    WHERE p.status='published' AND NOT p.is_demo AND c.active
      AND EXISTS (SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active)
    ORDER BY p.updated_at DESC,p.id LIMIT 49000`);
  return [
    { url: `${base}/` },
    { url: `${base}/catalogo` },
    ...Object.keys(publicInfo).map(slug => ({ url: `${base}/informacion/${slug}` })),
    { url: `${base}/reclamaciones` },
    ...[...new Set(rows.map(p => p.category))].map(slug => ({ url: `${base}/catalogo?categoria=${encodeURIComponent(slug)}` })),
    ...rows.map(p => ({ url: `${base}/producto/${p.slug}`, lastModified: p.updated_at })),
  ];
}
