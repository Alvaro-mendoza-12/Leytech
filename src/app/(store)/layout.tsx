import { StoreHeader, StoreFooter } from "@/components/store-shell";
import { settings, categories } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [s, c] = await Promise.all([settings(), categories()]);
  return (
    <div
      className="store-theme"
      style={{ "--blue": s.primaryColor } as React.CSSProperties}
    >
      <StoreHeader settings={s} categories={c} />
      <main id="contenido">{children}</main>
      <StoreFooter settings={s} />
      <a
        className="floating-whatsapp"
        href={`https://wa.me/${s.whatsapp}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Hablar con Leytech por WhatsApp"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          width="26"
          height="26"
        >
          <path d="M20.5 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.6-4.8A8.5 8.5 0 1 1 20.5 11.5Z" />
          <path d="M8.2 7.2c-.8 1.4-.3 3.4 1.6 5.2 1.8 1.9 3.9 2.5 5.2 1.6l-1.6-2-1.3.5-2.3-2.4.4-1.3-2-1.6Z" />
        </svg>
      </a>
    </div>
  );
}
