import type { Metadata } from "next";
import { CartProvider } from "@/components/cart-provider";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: "Leytech | Tecnología que va contigo",
    template: "%s | Leytech",
  },
  description:
    "Explora tecnología para trabajar, jugar y disfrutar. Accesorios, audio, gaming y cotizaciones por WhatsApp en Leytech.",
  openGraph: {
    title: "Leytech | Tecnología que va contigo",
    description: "Tu próximo upgrade empieza aquí.",
    locale: "es_PE",
    type: "website",
    images: ["/images/hero.jpg"],
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
