import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cachedSettings } from "@/lib/catalog";
import { officialIcon } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cachedSettings();
  return { icons: { icon: store.logoUrl || officialIcon } };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
