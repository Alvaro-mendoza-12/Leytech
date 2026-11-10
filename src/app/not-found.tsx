import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container page-container">
      <div className="empty-state">
        <h1>Este enlace tomó otro camino.</h1>
        <p>El producto o la página ya no está disponible.</p>
        <Link href="/catalogo" className="btn btn-primary">
          Explorar el catálogo
        </Link>
      </div>
    </div>
  );
}
