import Link from "next/link";
import { Download, Headphones, Laptop, Mic, Volume2 } from "lucide-react";
import { assistantDownloadUrl } from "@/lib/assistant-download";
import { cachedSettings } from "@/lib/catalog";
import { publicMetadata } from "@/lib/seo";
import { WhatsAppIcon } from "@/components/icons";
import styles from "./assistant.module.css";

const description = "Descarga Leytech Asistente para Windows y actívalo con el código de tu compra.";

export async function generateMetadata() {
  return publicMetadata(await cachedSettings(), {
    path: "/asistente", title: "Leytech Asistente para Windows", description,
    index: Boolean(assistantDownloadUrl()),
  });
}

export default async function AssistantPage() {
  const store = await cachedSettings();
  const download = assistantDownloadUrl();
  const message = "Hola, quiero activar Leytech Asistente.\nMi referencia de compra: ";
  const whatsapp = `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(message)}`;

  return (
    <div className={`container ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="titulo-asistente">
        <div className={styles.intro}>
          <Link href="/" className={styles.back}>Leytech / Asistente</Link>
          <h1 id="titulo-asistente">Leytech Asistente</h1>
          <p>Controla el volumen de tu PC y usa comandos de voz en Windows. El asistente está incluido con compras elegibles.</p>
          {download ? (
            <a className="btn btn-primary" href={download} download>
              <Download size={20} aria-hidden="true" /> Descargar para Windows
            </a>
          ) : <p className={styles.unavailable}>La descarga se habilitará cuando la tienda publique el instalador.</p>}
          <ul className={styles.requirements} aria-label="Requisitos">
            <li><Laptop size={16} aria-hidden="true" /> Windows 10 u 11 x64</li>
            <li><Headphones size={16} aria-hidden="true" /> Auriculares y micrófono</li>
          </ul>
        </div>
        <div className={styles.voice} aria-label="Ejemplo de comando de voz">
          <div className={styles.voiceIcon}><Mic size={34} aria-hidden="true" /></div>
          <p>«Computadora,<br /> sube el volumen»</p>
          <div className={styles.response}><Volume2 size={18} aria-hidden="true" /> Volumen del sistema</div>
        </div>
      </section>
      <section className={styles.activation} aria-labelledby="como-activar">
        <div>
          <h2 id="como-activar">Actívalo con tu compra</h2>
          <p>Necesitas Internet para activar el asistente por primera vez. Después puedes usar los comandos locales sin conexión.</p>
          <a className="btn btn-outline" href={whatsapp} target="_blank" rel="noreferrer">
            <WhatsAppIcon /> Solicitar código por WhatsApp
          </a>
        </div>
        <ol>
          <li><strong>Instala y abre el asistente</strong> en el equipo donde quieres usarlo.</li>
          <li><strong>Solicita tu código por WhatsApp.</strong> Envía la referencia de tu compra.</li>
          <li><strong>Pega el código que recibas</strong> y pulsa «Activar». Solo puedes canjearlo una vez.</li>
        </ol>
      </section>
    </div>
  );
}
