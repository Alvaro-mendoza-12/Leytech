import type { Metadata } from "next";
import { officialLogo, officialTikTok } from "./brand";
import { siteUrl } from "./site";
import type { StoreSettings } from "./types";

export const socialCard = "/images/leytech-presentacion.png";
export const adminSocialCard = "/images/leytech-administracion.png";
export const adminDescription = "Acceso al portal administrativo de Leytech. Gestión de productos, inventario y atención de solicitudes para el personal autorizado.";
export const publicInfo = {
  nosotros: { title: "Sobre Leytech", description: "Conoce Leytech, tienda peruana de tecnología, gaming, audio, accesorios y componentes de cómputo." },
  contacto: { title: "Contacto", description: "Habla con Leytech por WhatsApp para consultas de productos, disponibilidad y entregas en Perú." },
  ayuda: { title: "Preguntas frecuentes", description: "Encuentra respuestas sobre cotizaciones, stock, variantes, pagos y atención por WhatsApp en Leytech." },
  envios: { title: "Envíos y entregas", description: "Consulta cómo coordinar la cobertura, el costo y el plazo de entrega con Leytech por WhatsApp." },
  garantias: { title: "Cambios, devoluciones y garantías", description: "Consulta las condiciones de cambios, devoluciones y garantías de los productos de Leytech." },
  terminos: { title: "Términos y condiciones", description: "Conoce las condiciones de uso del catálogo y el proceso de compra por WhatsApp en Leytech." },
  privacidad: { title: "Política de privacidad", description: "Conoce cómo Leytech usa los datos de atención al cliente y del Libro de Reclamaciones." },
} as const;

export const storeDescription = "Tecnología, gaming y accesorios de cómputo en Perú. Consulta nuestro catálogo, precios y disponibilidad. Atención personalizada por WhatsApp.";

export function publicMetadata(store: StoreSettings, page: {
  path: string; title: string; description: string; image?: string; index?: boolean; shareTitle?: string;
}): Metadata {
  const canonical = new URL(page.path, siteUrl()).href;
  const title = `${page.title} | ${store.name}`;
  const source = page.image || store.logoUrl || socialCard;
  const url = new URL(source, siteUrl()).href;
  const image = { url, secureUrl: url.startsWith("https:") ? url : undefined,
    alt: page.image ? page.title : store.name,
    ...([socialCard, adminSocialCard].includes(source) ? { width: 1200, height: 630, type: "image/png" } : {}) };
  const shareTitle = page.shareTitle || title;
  return {
    title: { absolute: title },
    description: page.description,
    alternates: { canonical },
    robots: { index: !store.demoMode && page.index !== false, follow: true, "max-image-preview": "large" },
    openGraph: { type: "website", siteName: store.name, locale: "es_PE", title: shareTitle, description: page.description, url: canonical, images: [image] },
    twitter: { card: "summary_large_image", title: shareTitle, description: page.description, images: [image] },
  };
}

export function organization(store: StoreSettings) {
  const url = `${siteUrl()}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${url}#website`, name: store.name, alternateName: `${store.name} Perú`,
        url, inLanguage: "es-PE", publisher: { "@id": `${url}#organization` } },
      { "@type": "Organization", "@id": `${url}#organization`, name: store.name, legalName: store.legalName || undefined,
        url, logo: new URL(store.logoUrl || officialLogo, url).href, description: storeDescription, sameAs: [officialTikTok],
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", areaServed: "PE",
          telephone: `+${store.whatsapp}`, url: `https://wa.me/${store.whatsapp}`, availableLanguage: "es" } },
    ],
  };
}
