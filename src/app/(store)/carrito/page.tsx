import { CartPage } from "@/components/cart-page";
import { storefrontRevision } from "@/lib/revisions";
export const metadata = { title: "Mi carrito", robots: { index: false, follow: false } };
export default async function Page() {
  const revision = await storefrontRevision();
  return (
    <div className="container page-container">
      <nav className="breadcrumbs">
        <a href="/">Inicio</a>
        <span>/</span>
        <span>Mi carrito</span>
      </nav>
      <CartPage revision={revision} />
    </div>
  );
}
