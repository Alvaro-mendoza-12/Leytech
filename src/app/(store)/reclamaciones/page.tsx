import { cachedSettings } from "@/lib/catalog";
import { ClaimForm } from "@/components/claim-form";
import { MessageCircle } from "lucide-react";
import { publicMetadata } from "@/lib/seo";
export async function generateMetadata() {
  return publicMetadata(await cachedSettings(), { path: "/reclamaciones", title: "Libro de Reclamaciones",
    description: "Registra una queja o reclamo en Leytech y conserva tu constancia con el código de atención." });
}
export default async function Page() {
  const s = await cachedSettings();
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
          </>
        ) : (
          <>
            <div className="info-box">
              Leytech está completando los datos de identificación del titular.
              Puedes registrar tu solicitud en el formulario o contactarnos por WhatsApp.
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
        <ClaimForm />
      </div>
    </div>
  );
}
