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
import { settings, categories, products } from "@/lib/catalog";
import { CategoryIcon } from "@/components/icons";
import { ProductGrid } from "@/components/store-ui";
import { Benefits } from "@/components/store-shell";
export default async function Home() {
  const [s, c, featured, newest] = await Promise.all([
    settings(),
    categories(),
    products({ featured: true }),
    products({ sort: "newest" }),
  ]);
  return (
    <>
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
          <div className="hero-visual">
            <Image
              src={s.heroImage}
              alt="Audífonos negros sobre un fondo neutro"
              fill
              priority
              sizes="(max-width:700px) 100vw,55vw"
            />
            <div className="hero-product-label">
              <span>Encuentra tu sonido</span>
              <Link href="/catalogo?categoria=audio">
                Explora audio <ArrowUpRight size={17} />
              </Link>
            </div>
          </div>
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
            Pronto encontrarás aquí nuestros productos destacados.
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
      <section className="container section">
        <div className="section-heading">
          <div>
            <h2>Lo último en llegar</h2>
            <p>Nuevas posibilidades para tu próximo upgrade.</p>
          </div>
          <Link href="/catalogo?sort=newest" className="text-link">
            Ver novedades <ArrowRight size={16} />
          </Link>
        </div>
        <ProductGrid products={newest.products.slice(4, 8)} />
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
