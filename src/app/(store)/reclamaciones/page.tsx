import { settings } from "@/lib/catalog";
import { ClaimForm } from "@/components/claim-form";
import { MessageCircle } from "lucide-react";
export const metadata = { title: "Libro de Reclamaciones" };
export default async function Page() {
  const s = await settings();
  return (
    <div className="container page-container">
      <div className="info-content" style={{ margin: "0 auto" }}>
        <h1>Libro de Reclamaciones</h1>
        {s.legalName && s.ruc ? (
          <>
            <p>
              {s.legalName} · RUC {s.ruc}
              <br />
              {s.address}
            </p>
            <ClaimForm />
          </>
        ) : (
          <>
            <div className="info-box">
              El negocio está completando la información legal necesaria para
              habilitar este libro. Aún no se aceptan ventas reales.
            </div>
            <p>
              Si necesitas comunicarte con Leytech, escríbenos por WhatsApp.
            </p>
            <a
              className="btn btn-whatsapp"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/${s.whatsapp}`}
            >
              <MessageCircle size={18} /> Contactar con Leytech
            </a>
          </>
        )}
      </div>
    </div>
  );
}
