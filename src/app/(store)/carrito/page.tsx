import { CartPage } from "@/components/cart-page";
export const metadata = { title: "Mi carrito" };
export default function Page() {
  return (
    <div className="container page-container">
      <nav className="breadcrumbs">
        <a href="/">Inicio</a>
        <span>/</span>
        <span>Mi carrito</span>
      </nav>
      <CartPage />
    </div>
  );
}
