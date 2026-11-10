import type { Metadata } from "next";
import { CartProvider } from "@/components/cart-provider";
import "./globals.css";
import {siteUrl} from '@/lib/site';
import { officialIcon } from "@/lib/brand";
import { socialCard, storeDescription } from "@/lib/seo";
export const metadata: Metadata = {
  metadataBase: new URL(
    siteUrl(),
  ),
  title: {
    default: "Leytech | Tecnología que va contigo",
    template: "%s | Leytech",
  },
  description: storeDescription,
  openGraph: { type: "website", siteName: "Leytech", locale: "es_PE",
    title: "Leytech | Tecnología y accesorios", description: storeDescription,
    images: [{ url: new URL(socialCard, siteUrl()).href, width: 1200, height: 630, type: "image/png", alt: "Leytech" }] },
  twitter: { card: "summary_large_image", title: "Leytech | Tecnología y accesorios",
    description: storeDescription, images: [new URL(socialCard, siteUrl()).href] },
  icons: { icon: officialIcon },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-PE" data-scroll-behavior="smooth">
      <body>
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
