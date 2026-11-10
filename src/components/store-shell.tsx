import Link from "next/link";
import {
  Search,
  MessageCircle,
  ArrowUpRight,
  Mail,
  ChevronDown,
  Menu,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  BookOpen,
} from "lucide-react";
import type { Category, StoreSettings } from "@/lib/types";
import { CartLink } from "./store-ui";
import { CategoryIcon } from "./icons";
import { BrandLogo } from "./brand-logo";
export function StoreHeader({
  settings: s,
  categories,
}: {
  settings: StoreSettings;
  categories: Category[];
}) {
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <div className="topbar">
        <div className="container topbar-inner">
          <span>
            {s.demoMode
              ? "Estás explorando nuestro catálogo de demostración"
              : "Tu próximo upgrade está en Leytech"}
          </span>
          <Link href="/informacion/envios">
            <MapPin size={13} /> Consulta las opciones de entrega{" "}
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
      <header className="store-header">
        <div className="container header-main">
          <BrandLogo name={s.name} src={s.logoUrl} />
          <form action="/catalogo" className="search-bar" role="search">
            <Search size={20} />
            <input
              type="search"
              name="q"
              placeholder="¿Qué estás buscando hoy?"
              aria-label="Buscar productos"
            />
            <button type="submit">Buscar</button>
          </form>
          <a
            href={`https://wa.me/${s.whatsapp}`}
            target="_blank"
            rel="noreferrer"
            className="header-help"
          >
            <MessageCircle size={24} />
            <span>
              Hablemos por WhatsApp
              <strong>
                {s.whatsapp
                  .slice(-9)
                  .replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
              </strong>
            </span>
          </a>
          <CartLink />
        </div>
        <nav className="container nav-bar" aria-label="Navegación principal">
          <details className="category-menu">
            <summary>
              <Menu size={18} /> Todas las categorías <ChevronDown size={14} />
            </summary>
            <div className="category-dropdown">
              {categories.map((c) => (
                <Link key={c.id} href={`/catalogo?categoria=${c.slug}`}>
                  <CategoryIcon name={c.icon} size={19} />
                  {c.name}
                </Link>
              ))}
            </div>
          </details>
          <Link href="/catalogo">Todo el catálogo</Link>
          <Link href="/catalogo?sort=newest">Lo nuevo</Link>
          <Link href="/catalogo?categoria=gaming">Zona gaming</Link>
          <Link href="/catalogo?ofertas=1" className="nav-offers">
            Ofertas <span className="small-dot" />
          </Link>
          <Link href="/informacion/ayuda" className="nav-last">
            Te ayudamos a elegir <ArrowUpRight size={14} />
          </Link>
        </nav>
      </header>
    </>
  );
}
export function StoreFooter({ settings: s }: { settings: StoreSettings }) {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div>
          <BrandLogo name={s.name} src={s.logoUrl} />
          <p>
            {s.tagline}
            <br />
            Un upgrade para cada parte de tu día.
          </p>
          <a
            className="footer-whatsapp"
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/${s.whatsapp}`}
          >
            <MessageCircle size={18} /> +{s.whatsapp.slice(0, -9)}{" "}
            {s.whatsapp.slice(-9).replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
          </a>
          {s.email && (
            <a href={`mailto:${s.email}`}>
              <Mail size={16} /> {s.email}
            </a>
          )}
        </div>
        <div>
          <h3>Explora Leytech</h3>
          <Link href="/catalogo">Todos los productos</Link>
          <Link href="/catalogo?categoria=gaming">Zona gaming</Link>
          <Link href="/catalogo?ofertas=1">Ofertas</Link>
          <Link href="/informacion/nosotros">Sobre nosotros</Link>
        </div>
        <div>
          <h3>Estamos para ayudarte</h3>
          <Link href="/informacion/ayuda">Preguntas frecuentes</Link>
          <Link href="/informacion/envios">Envíos y entregas</Link>
          <Link href="/informacion/garantias">Cambios y garantías</Link>
          <Link href="/informacion/contacto">Contáctanos</Link>
        </div>
        <div>
          <h3>Compra con información</h3>
          <Link href="/informacion/terminos">Términos y condiciones</Link>
          <Link href="/informacion/privacidad">Política de privacidad</Link>
          <Link href="/reclamaciones" className="claims-link">
            <BookOpen size={22} /> Libro de
            <br />
            Reclamaciones
          </Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {s.name}.{" "}
          {s.legalName && `${s.legalName} · RUC ${s.ruc}`}
        </span>
        <div>
          <span>
            <ShieldCheck size={15} /> Tus datos, protegidos
          </span>
          <span>Precios en soles (PEN)</span>
          <Link href="/admin">Administración</Link>
        </div>
      </div>
    </footer>
  );
}
export function Benefits() {
  return (
    <div className="benefits container">
      <div>
        <ShoppingBag />
        <span>
          <strong>Compra a tu manera</strong>
          <small>Sin crear una cuenta</small>
        </span>
      </div>
      <div>
        <MessageCircle />
        <span>
          <strong>Una respuesta más cerca</strong>
          <small>Cotiza por WhatsApp</small>
        </span>
      </div>
      <div>
        <ShieldCheck />
        <span>
          <strong>Toda la información</strong>
          <small>Stock y variantes a la vista</small>
        </span>
      </div>
      <div>
        <MapPin />
        <span>
          <strong>Primero, tu tranquilidad</strong>
          <small>Confirma la entrega al cotizar</small>
        </span>
      </div>
    </div>
  );
}
