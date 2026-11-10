import type { Metadata } from "next";
import { CartProvider } from "@/components/cart-provider";
import "./globals.css";
import {siteUrl} from '@/lib/site';
import { officialIcon, officialLogo } from "@/lib/brand";
export const metadata: Metadata = {
  metadataBase: new URL(
    siteUrl(),
  ),
  title: {
    default: "Leytech | Tecnología que va contigo",
    template: "%s | Leytech",
  },
  description:
    "Explora tecnología para trabajar, jugar y disfrutar. Accesorios, audio, gaming y cotizaciones por WhatsApp en Leytech.",
  icons: { icon: officialIcon },
  openGraph: {
    title: "Leytech | Tecnología que va contigo",
    description: "Tu próximo upgrade empieza aquí.",
    locale: "es_PE",
    type: "website",
    images: [{ url: officialLogo, alt: "Logo de Leytech" }],
  },
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
