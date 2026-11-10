import { settings } from "@/lib/catalog";
import { CheckoutPage } from "@/components/checkout-page";
import {redirect} from 'next/navigation';
export const metadata = {
  title: "Finalizar pedido",
  robots: { index: false, follow: false },
};
export default async function Page() {
  const s = await settings();
  if(s.orderChannel==='whatsapp')redirect('/carrito');
  return (
    <div className="container page-container">
      <CheckoutPage
        settings={s}
        onlineEnabled={
          !!(
            process.env.MERCADOPAGO_ACCESS_TOKEN &&
            process.env.MERCADOPAGO_WEBHOOK_SECRET &&
            process.env.MERCADOPAGO_COLLECTOR_ID
          ) && !s.demoMode
        }
        mode={process.env.MERCADOPAGO_MODE || "sandbox"}
      />
    </div>
  );
}
