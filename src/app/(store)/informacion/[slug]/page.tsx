import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, MapPin, Mail } from "lucide-react";
import { settings } from "@/lib/catalog";
const titles: Record<string, string> = {
  nosotros: "Somos Leytech.",
  contacto: "Conversemos.",
  ayuda: "Te ayudamos a elegir.",
  envios: "Envíos y entregas",
  garantias: "Cambios, devoluciones y garantías",
  terminos: "Términos y condiciones",
  privacidad: "Política de privacidad",
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return { title: titles[(await params).slug] || "Información" };
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!titles[slug]) notFound();
  const s = await settings();
  const configured = s.policies[slug];
  const faqs = [
    [
      "¿Cómo puedo cotizar?",
      "Agrega tus productos al carrito y selecciona “Cotizar carrito por WhatsApp”. Registraremos tu solicitud con un código. Después abre WhatsApp y envía el mensaje a Leytech.",
    ],
    [
      "¿Debo crear una cuenta?",
      "Puedes comprar como invitado. Solo solicitamos los datos necesarios para atender el pedido.",
    ],
    [
      "¿Mi carrito reserva los productos?",
      "No. El stock se comprueba de nuevo al cotizar y al crear un pedido. Los pedidos reservan unidades durante 30 minutos. Una cotización no reserva stock.",
    ],
    [
      "¿Cómo confirmo las opciones de envío?",
      "Consulta las opciones habilitadas en el checkout. Si tu zona no aparece, cotiza por WhatsApp antes de comprar.",
    ],
    [
      "¿Cómo sé si mi pago fue confirmado?",
      "Consulta el enlace privado de tu pedido. Solo se mostrará “Pagado” después de verificar el pago. La redirección de la pasarela, por sí sola, no lo confirma.",
    ],
    [
      "¿Qué ocurre con un producto digital?",
      "El equipo autorizado entrega las instrucciones de activación después de confirmar el pago. Las claves de licencia nunca se publican en el catálogo.",
    ],
  ];
  return (
    <div className="container page-container">
      <nav className="breadcrumbs">
        <Link href="/">Inicio</Link>
        <span>/</span>
        <span>{titles[slug]}</span>
      </nav>
      <div className="info-page">
        <nav className="info-nav" aria-label="Información de Leytech">
          {Object.entries(titles).map(([key, title]) => (
            <Link
              href={`/informacion/${key}`}
              key={key}
              className={key === slug ? "active" : ""}
            >
              {title}
            </Link>
          ))}
          <Link href="/reclamaciones">Libro de Reclamaciones</Link>
        </nav>
        <article className="info-content">
          <h1>{titles[slug]}</h1>
          {configured ? (
            <div className="policy-text">{configured}</div>
          ) : (
            <>
              {slug === "nosotros" && (
                <>
                  <p>
                    En Leytech queremos ayudarte a encontrar la tecnología que
                    acompaña tu forma de trabajar, jugar y disfrutar.
                  </p>
                  <h2>Un upgrade para cada día</h2>
                  <p>
                    Explora audio, periféricos, componentes, conectividad y
                    accesorios. Compara las características y elige la variante
                    que va contigo.
                  </p>
                  <h2>Hablemos de lo que necesitas</h2>
                  <p>
                    Si tienes dudas, puedes cotizar un producto o tu carrito
                    completo por WhatsApp. Confirmaremos contigo la
                    disponibilidad y las condiciones de entrega antes de
                    comprar.
                  </p>
                </>
              )}
              {slug === "contacto" && (
                <>
                  <p>
                    Cuéntanos qué estás buscando o compártenos el código de tu
                    cotización o pedido para ayudarte.
                  </p>
                  <div className="contact-card">
                    <strong>WhatsApp Leytech</strong>
                    <p>
                      +51{" "}
                      {s.whatsapp
                        .slice(-9)
                        .replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
                    </p>
                    <a
                      className="btn btn-whatsapp"
                      href={`https://wa.me/${s.whatsapp}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle size={17} /> Escribir por WhatsApp
                    </a>
                    {s.address && (
                      <p style={{ marginTop: 20 }}>
                        <MapPin size={16} /> {s.address}
                      </p>
                    )}
                    {s.email && (
                      <p>
                        <a href={`mailto:${s.email}`}>
                          <Mail size={16} /> {s.email}
                        </a>
                      </p>
                    )}
                  </div>
                </>
              )}
              {slug === "ayuda" && (
                <div className="faq">
                  {faqs.map(([q, a]) => (
                    <details key={q}>
                      <summary>{q}</summary>
                      <p>{a}</p>
                    </details>
                  ))}
                </div>
              )}
              {slug === "envios" && (
                <>
                  <p>
                    Las opciones y el costo de entrega se muestran antes de
                    confirmar el pedido. Si tu zona no está habilitada, solicita
                    una cotización por WhatsApp.
                  </p>
                  {s.shippingEnabled ? (
                    <>
                      <h2>Envío disponible</h2>
                      <p>
                        {s.shippingZone}. Costo configurado: S/{" "}
                        {(s.shippingFee / 100).toFixed(2)}. Confirma el plazo de
                        entrega con Leytech antes de comprar.
                      </p>
                    </>
                  ) : (
                    <div className="info-box">
                      Aún no se publicaron tarifas ni zonas de envío. Cotiza con
                      Leytech para consultar tu ubicación.
                    </div>
                  )}
                  {s.pickupEnabled && (
                    <>
                      <h2>Recojo</h2>
                      <p>{s.pickupInstructions}</p>
                    </>
                  )}
                </>
              )}
              {slug === "garantias" && (
                <>
                  <p>
                    Consulta la información de garantía de cada producto y
                    confirma las condiciones con Leytech antes de comprar.
                  </p>
                  <div className="info-box">
                    Las políticas comerciales de cambios, devoluciones y
                    garantías están pendientes de ser publicadas por el negocio.
                    La tienda aún no está habilitada para ventas reales.
                  </div>
                  <h2>¿Necesitas ayuda con un producto?</h2>
                  <p>
                    Escríbenos con el código del pedido y una descripción del
                    problema. Conserva tu comprobante y la información del
                    producto.
                  </p>
                </>
              )}
              {slug === "terminos" && (
                <>
                  <div className="info-box">
                    Documento preliminar. Leytech debe completar y aprobar las
                    condiciones comerciales antes del lanzamiento.
                  </div>
                  <p>
                    El catálogo de demostración contiene productos, precios e
                    inventario de ejemplo. Los pedidos de prueba no generan
                    cobros ni entregas.
                  </p>
                  <h2>Cotizaciones y pedidos</h2>
                  <p>
                    Una cotización registra una consulta y prepara un mensaje
                    para WhatsApp. No constituye una reserva. El envío del
                    mensaje depende del cliente. Los precios y la disponibilidad
                    se comprueban de nuevo al crear el pedido.
                  </p>
                  <p>
                    El stock se reserva durante 30 minutos. Un pedido queda
                    pendiente hasta verificar el pago. Los costos de entrega
                    deben mostrarse antes de confirmar.
                  </p>
                </>
              )}
              {slug === "privacidad" && (
                <>
                  <div className="info-box">
                    Política preliminar. Pendiente identificar formalmente al
                    responsable, plazos de conservación, proveedores y canales
                    para ejercer derechos antes del lanzamiento.
                  </div>
                  <h2>Qué información utiliza esta tienda</h2>
                  <p>
                    El carrito se conserva en el navegador. Al crear un pedido,
                    se registran nombre, correo, celular y, cuando corresponde,
                    dirección para atenderlo. Las cotizaciones guardan los
                    productos solicitados. No pedimos ni almacenamos los datos
                    completos de tarjetas.
                  </p>
                  <h2>WhatsApp</h2>
                  <p>
                    Al abrir un enlace de cotización, se preparan el código, los
                    productos, sus variantes y el subtotal en WhatsApp. Revisa
                    el mensaje antes de enviarlo. WhatsApp aplica sus propias
                    condiciones de uso.
                  </p>
                  <h2>Contacto</h2>
                  <p>
                    Por ahora puedes contactar al negocio mediante el WhatsApp
                    publicado. No ingreses información personal real en la
                    demostración.
                  </p>
                </>
              )}
            </>
          )}
          {s.demoMode && (
            <div className="info-box">
              Estás viendo una tienda en demostración. La información comercial
              y legal debe completarse antes de aceptar ventas reales.
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
