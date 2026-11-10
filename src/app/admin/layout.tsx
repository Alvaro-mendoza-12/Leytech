import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cachedSettings } from "@/lib/catalog";
import { officialIcon } from "@/lib/brand";
import { adminDescription, adminSocialCard, publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cachedSettings();
  return {
    ...publicMetadata(store, { path: "/admin/login", title: "Acceso administrativo",
      description: adminDescription, image: adminSocialCard, index: false }),
    icons: { icon: store.logoUrl || officialIcon },
    robots: { index: false, follow: false },
  };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
