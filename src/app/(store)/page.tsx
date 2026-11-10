import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  Headphones,
  Check,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cachedSettings, categories, products } from "@/lib/catalog";
import { CategoryIcon } from "@/components/icons";
import { ProductGrid } from "@/components/store-ui";
import { Benefits } from "@/components/store-shell";
import { HeroCarousel, type HeroSlide } from "@/components/hero-carousel";
import { organization, publicMetadata, storeDescription } from "@/lib/seo";

export async function generateMetadata() {
  const store = await cachedSettings();
  return publicMetadata(store, { path: "/", title: "Tienda de tecnología y gaming en Perú", description: storeDescription });
}
export default async function Home() {
  const [s, c, featured, newest] = await Promise.all([
    cachedSettings(),
    categories(),
    products({ featured: true }),
    products({ sort: "newest", preferReal: true, limit: 7 }),
  ]);
  const cover: HeroSlide = {
    id: "cover", image: s.heroImage, href: "/catalogo", name: "Explora el catálogo", label: "Leytech",
  };
  const leadSample = s.heroImage === "/images/hero.jpg"
    ? featured.products.find(p => p.slug === "audifonos-inalambricos-studio") : undefined;
  const selection = leadSample
    ? [leadSample, ...newest.products.filter(p => p.id !== leadSample.id)]
    : newest.products;
  const slides: HeroSlide[] = selection.map(p => ({
    id: p.id,
    image: p.id === leadSample?.id ? s.heroImage : p.images[0] || "/images/placeholder.svg",
    href: `/producto/${p.slug}`,
    name: p.name,
    label: p.is_demo ? `${p.category_name} · Muestra` : p.category_name,
  }));
  if (!leadSample) slides.unshift(cover);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization(s)).replace(/</g, "\\u003c") }} />
      <div className="container home-intro">
        <div className="hero">
          <div className="hero-content">
            <span className="hero-tag">
              <span /> Conecta con lo que te mueve
            </span>
            <h1>{s.heroTitle}</h1>
            <p>{s.heroSubtitle}</p>
            <Link href="/catalogo" className="btn btn-white">
              Explorar productos <ArrowRight size={18} />
            </Link>
            <div className="hero-footnote">
              <span className="mini-sound">
                <Headphones size={17} />
              </span>
              <span>
                Pequeños cambios.
                <br />
                <strong>Grandes experiencias.</strong>
              </span>
            </div>
          </div>
          <HeroCarousel slides={slides.slice(0, 7)} />
        </div>
        <div className="hero-asides">
          <Link
            href="/catalogo?categoria=gaming"
            className="aside-card gaming-card"
          >
            <Image
              src="/images/setup.jpg"
              fill
              sizes="350px"
              alt="Escritorio para gaming con iluminación"
            />
            <div>
              <span>Tu espacio. Tus reglas.</span>
              <h2>
                Modo gaming:
                <br />
                activado.
              </h2>
              <span className="aside-link">
                Arma tu setup <ArrowUpRight size={17} />
              </span>
            </div>
          </Link>
          <div className="aside-card help-card">
            <span className="help-card-icon">
              <MessageCircle size={24} />
            </span>
            <h2>
              ¿No sabes
              <br />
              cuál elegir?
            </h2>
            <p>Conversemos. Te ayudamos a encontrar tu próximo upgrade.</p>
            <a
              href={`https://wa.me/${s.whatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              Escríbenos <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
      </div>
      <Benefits />
      <section className="container section category-section">
        <div className="section-heading">
          <div>
            <h2>¿Qué tienes en mente?</h2>
            <p>Encuentra lo que necesitas, a tu manera.</p>
          </div>
          <Link href="/catalogo" className="text-link">
            Ver todo <ArrowRight size={16} />
          </Link>
        </div>
        <div className="category-grid">
          {c.map((cat) => (
            <Link
              href={`/catalogo?categoria=${cat.slug}`}
              key={cat.id}
              className="category-tile"
            >
              <div>
                <CategoryIcon name={cat.icon} size={30} />
              </div>
              <span>{cat.name}</span>
              <ChevronRight size={14} />
            </Link>
          ))}
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <h2>
              Un buen lugar para empezar<span className="heading-dot">.</span>
            </h2>
            <p>Una selección para renovar tu día a día.</p>
          </div>
          <Link href="/catalogo" className="text-link">
            Ver catálogo <ArrowRight size={16} />
          </Link>
        </div>
        {featured.products.length ? (
          <ProductGrid products={featured.products.slice(0, 4)} />
        ) : (
          <p className="empty-inline">
            Estamos preparando nuestro catálogo. <a href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noreferrer">Consulta por WhatsApp el producto que buscas.</a>
          </p>
        )}
      </section>
      <section className="container">
        <div className="upgrade-banner">
          <div className="banner-icon">
            <KeyboardDrawing />
          </div>
          <div>
            <span>Tu escritorio también merece un upgrade</span>
            <h2>Haz espacio para tus mejores ideas.</h2>
            <p>Accesorios que acompañan tu forma de trabajar y crear.</p>
          </div>
          <Link href="/catalogo?categoria=perifericos" className="btn btn-dark">
            Renovar mi setup <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section className="container section home-newest">
        <div className="section-heading">
          <div>
            <h2>Lo último en llegar</h2>
            <p>Los productos agregados más recientemente al catálogo.</p>
          </div>
          <Link href="/catalogo?sort=newest" className="text-link">
            Ver novedades <ArrowRight size={16} />
          </Link>
        </div>
        {newest.products.length > 0 ? <ProductGrid products={newest.products.slice(0, 4)} />
          : <p className="empty-inline">Las novedades aparecerán aquí cuando se publiquen.</p>}
      </section>
      <section className="container personal-help">
        <div className="personal-help-symbol">
          <MessageCircle size={35} />
        </div>
        <div>
          <h2>La tecnología se entiende mejor conversando.</h2>
          <p>
            Cuéntanos qué necesitas. Cotiza un producto o tu carrito completo
            por WhatsApp.
          </p>
        </div>
        <a
          href={`https://wa.me/${s.whatsapp}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-whatsapp"
        >
          Hablemos <ArrowUpRight size={18} />
        </a>
      </section>
    </>
  );
}
function KeyboardDrawing() {
  return (
    <svg width="140" height="90" viewBox="0 0 140 90" fill="none">
      <g transform="rotate(-12 70 45)" stroke="currentColor" strokeWidth="1.5">
        <rect x="8" y="18" width="124" height="60" rx="8" />
        {Array.from({ length: 40 }, (_, i) => (
          <rect
            key={i}
            x={16 + (i % 10) * 11}
            y={26 + Math.floor(i / 10) * 11}
            width={7}
            height={7}
            rx="1"
          />
        ))}
        <path d="M48 65h44" />
      </g>
    </svg>
  );
}
