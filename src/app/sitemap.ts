import type { MetadataRoute } from "next";
import { products, settings } from "@/lib/catalog";
import {siteUrl} from '@/lib/site';
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl(),
    s = await settings();
  if (s.demoMode) return [];
  const p = await products({ all: true });
  return [
    { url: base },
    { url: `${base}/catalogo` },
    ...p.products
      .filter((p) => p.status === "published" && !p.is_demo)
      .map((p) => ({ url: `${base}/producto/${p.slug}` })),
  ];
}
