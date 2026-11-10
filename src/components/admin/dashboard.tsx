"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Megaphone,
  Settings,
  ExternalLink,
  LogOut,
  ArrowRight,
  MessageCircle,
  TriangleAlert,
  Activity,
  RefreshCw,
} from "lucide-react";
import { quoteCode, date } from "@/lib/format";
import { useCart } from "@/components/cart-provider";
import { CatalogManager } from "./catalog-manager";
import { SalesManager, quoteStatusLabels } from "./sales-manager";
import { SettingsManager } from "./settings-manager";
import type { AdminData } from "./api";
import { BrandLogo } from "../brand-logo";
import { useVisiblePolling } from "../use-visible-polling";
const menu = [
  { id: "resumen", label: "Resumen", icon: LayoutDashboard, tabs: [] },
  {
    id: "catalogo",
    label: "Catálogo",
    icon: Package,
    tabs: ["productos", "categorias", "inventario", "marcas"],
  },
  {
    id: "ventas",
    label: "Solicitudes",
    icon: ShoppingBag,
    tabs: ["cotizaciones", "reclamaciones"],
  },
  { id: "marketing", label: "Marketing", icon: Megaphone, tabs: ["inicio"] },
  {
    id: "configuracion",
    label: "Configuración",
    icon: Settings,
    tabs: [
      "negocio",
      "whatsapp",
      "politicas",
      "usuarios",
      "seguridad",
    ],
  },
];
const labels: Record<string, string> = {
  productos: "Productos",
  categorias: "Categorías",
  inventario: "Inventario",
  marcas: "Marcas",
  cotizaciones: "Solicitudes de WhatsApp",
  whatsapp: "Atención por WhatsApp",
  reclamaciones: "Reclamaciones",
  inicio: "Página de inicio",
  negocio: "Negocio",
  politicas: "Políticas",
  usuarios: "Usuarios",
  seguridad: "Seguridad",
};
const subtitles: Record<string, string> = {
  resumen: "Todo lo que pasa en tu negocio, en un lugar.",
  catalogo: "Tus productos y su disponibilidad, siempre al día.",
  ventas: "Organiza las consultas que los visitantes preparan para WhatsApp.",
  marketing: "Dale a tu tienda una voz propia.",
  configuracion: "Los detalles que hacen funcionar tu negocio.",
};
export function Dashboard() {
  const [data, setData] = useState<AdminData | null>(null),
    [section, setSection] = useState("resumen"),
    [tab, setTab] = useState(""),
    [error, setError] = useState(""),
    [syncStatus, setSyncStatus] = useState<"connecting" | "current" | "retrying">("connecting"),
    [loading, setLoading] = useState(true);
  const router = useRouter(),
    { setNotice } = useCart();
  const requestSequence = useRef(0);
  const refresh = useCallback(async (revision?: string, signal?: AbortSignal) => {
    const request = ++requestSequence.current;
    const path = revision ? `/api/admin/data?revision=${encodeURIComponent(revision)}` : "/api/admin/data";
    const res = await fetch(path, { cache: "no-store", signal });
    if (request !== requestSequence.current || signal?.aborted) return;
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.status === 204) { setSyncStatus("current"); return; }
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    if (request === requestSequence.current && !signal?.aborted) {
      setData(result);
      setError("");
      setSyncStatus("current");
    }
  }, [router]);
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  useVisiblePolling(async signal => {
    try { await refresh(data?.revision, signal); }
    catch { setSyncStatus("retrying"); }
  }, "admin", !!data);
  function navigate(id: string, target?: string) {
    setSection(id);
    setTab(target || menu.find((m) => m.id === id)?.tabs[0] || "");
  }
  const title = menu.find((m) => m.id === section)?.label || "Resumen";
  const low =
    data?.products
      .filter((p) => p.status === "published" && !p.is_demo)
      .flatMap((p) =>
        p.variants
          .filter((v) => v.active && v.stock - v.reserved <= 3)
          .map((v) => ({ product: p.name, ...v })),
      ) || [];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <BrandLogo name={data?.settings.name} src={data?.settings.logoUrl} />
        <p className="admin-caption">Tu negocio, bajo control.</p>
        <nav className="admin-nav" aria-label="Panel administrativo">
          {menu.map((m) => (
            <button
              key={m.id}
              className={section === m.id ? "active" : ""}
              onClick={() => navigate(m.id)}
              title={m.label}
              aria-label={m.label}
            >
              <m.icon size={18} />
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={16} />
            <span>Ver mi tienda</span>
          </Link>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/admin/login");
              router.refresh();
            }}
          >
            <LogOut size={16} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <main className="admin-main" id="contenido">
        <header className="admin-topbar">
          <span>
            Mi tienda{" "}
            <span style={{ padding: "0 10px", color: "#bdc7d7" }}>/</span>
            {title}
          </span>
          <div className="admin-user">
            <button
              className="icon-button"
              aria-label="Actualizar datos"
              onClick={() =>
                refresh()
                  .then(() => setNotice("Datos actualizados"))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={14} />
            </button>
            <span className="admin-avatar">
              {data?.admin.email[0].toUpperCase() || "L"}
            </span>
            <span>
              {data?.admin.email || "Leytech"}
              <small>
                {data?.admin.role === "owner" ? "Propietario" : "Personal"}
              </small>
            </span>
            <button
              className="icon-button"
              aria-label="Salir del panel"
              title="Cerrar sesión"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/admin/login");
                router.refresh();
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>
        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <h1>
                {section === "resumen" ? "Tu negocio, de un vistazo." : title}
              </h1>
              <p>{subtitles[section]}</p>
            </div>
            <span className={`panel-sync panel-sync-${syncStatus}`}>
              <span aria-hidden="true" />
              {syncStatus === "current" ? "Datos al día" : syncStatus === "retrying" ? "Reconectando…" : "Conectando…"}
            </span>
          </div>
          {loading ? (
            <div className="skeleton" style={{ height: 350 }} />
          ) : error ? (
            <div className="error-box" role="alert">
              {error}
              <button
                className="btn btn-outline"
                onClick={() => refresh().catch((e) => setError(e.message))}
              >
                Reintentar
              </button>
            </div>
          ) : (
            data && (
              <>
                {menu.find((m) => m.id === section)!.tabs.length > 0 && (
                  <nav
                    className="admin-tabs"
                    aria-label={`Secciones de ${title}`}
                  >
                    {menu
                      .find((m) => m.id === section)!
                      .tabs.map((t) => (
                        <button
                          key={t}
                          className={tab === t ? "active" : ""}
                          onClick={() => setTab(t)}
                        >
                          {labels[t]}
                        </button>
                      ))}
                  </nav>
                )}
                {section === "resumen" && (
                  <>
                    <div className="stats-grid">
                      {[
                        {
                          title: "Productos publicados",
                          value: data.products.filter(p => p.status === "published" && !p.is_demo).length,
                          note: "Productos reales del catálogo",
                          icon: Package,
                        },
                        {
                          title: "Solicitudes atendidas",
                          value: data.quotes.filter(
                            (q) => q.status === "contacted",
                          ).length,
                          note: "Marcadas como atendidas",
                          icon: ShoppingBag,
                        },
                        {
                          title: "Cotizaciones por revisar",
                          value: data.quotes.filter(
                            (q) => q.status === "pending",
                          ).length,
                          note: "Solicitudes registradas",
                          icon: MessageCircle,
                        },
                        {
                          title: "Variantes con stock bajo",
                          value: low.length,
                          note: "3 unidades disponibles o menos",
                          icon: TriangleAlert,
                        },
                      ].map((stat) => (
                        <div className="stat-card" key={stat.title}>
                          <div className="stat-card-top">
                            <span>{stat.title}</span>
                            <stat.icon size={20} />
                          </div>
                          <strong>{stat.value}</strong>
                          <small>{stat.note}</small>
                        </div>
                      ))}
                    </div>
                    {!data.settings.demoMode && (!data.settings.legalName || !data.settings.ruc || !data.settings.address || !data.settings.email) && (
                      <div className="info-box">
                        Completa el titular, RUC, dirección y correo de atención en Configuración → Negocio.
                        Puedes mostrar u ocultar las muestras desde Configuración → Negocio.
                      </div>
                    )}
                    <div className="admin-columns">
                      <div>
                        <div className="admin-panel">
                          <div className="admin-panel-heading">
                            <h2>Solicitudes recientes</h2>
                            <button
                              className="text-link"
                              style={{ border: 0, background: "none" }}
                              onClick={() => navigate("ventas", "cotizaciones")}
                            >
                              Ver todos <ArrowRight size={14} />
                            </button>
                          </div>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Solicitud</th>
                                  <th>Productos</th>
                                  <th>Fecha</th>
                                  <th>Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.quotes.filter(quote => quote.status !== "closed").slice(0, 5).map((quote) => (
                                  <tr key={quote.id}>
                                    <td>
                                      <strong>{quoteCode(quote.code)}</strong>
                                    </td>
                                    <td>{quote.items.length}</td>
                                    <td>{date(quote.created_at)}</td>
                                    <td>
                                      <span className={`badge ${quote.status}`}>
                                        {quoteStatusLabels[quote.status]}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {!data.quotes.some(quote => quote.status !== "closed") && (
                            <div className="admin-empty">
                              Aquí verás las solicitudes que aún estén abiertas.
                            </div>
                          )}
                        </div>
                        <div className="admin-panel">
                          <div className="admin-panel-heading">
                            <h2>Actividad reciente</h2>
                          </div>
                          <div className="admin-panel-body">
                            {data.audit.slice(0, 6).map((a) => (
                              <div key={a.id} className="audit-entry">
                                <Activity size={15} />
                                <div>
                                  <strong>
                                    {(
                                      {
                                        "auth.login": "Inicio de sesión",
                                        "product.created": "Producto creado",
                                        "product.updated":
                                          "Producto actualizado",
                                        "settings.updated":
                                          "Configuración actualizada",
                                        "inventory.adjusted":
                                          "Inventario ajustado",
                                        "quote.status":
                                          "Cotización actualizada",
                                        "image.uploaded": "Imagen subida",
                                        "auth.password_changed":
                                          "Contraseña actualizada",
                                      } as Record<string, string>
                                    )[a.action] ||
                                      (
                                        {
                                          "user.created": "Usuario creado",
                                          "user.updated":
                                            "Acceso de usuario actualizado",
                                          "category.saved":
                                            "Categoría guardada",
                                          "brand.renamed": "Marca actualizada",
                                          "claim.status":
                                            "Solicitud actualizada",
                                        } as Record<string, string>
                                      )[a.action] ||
                                      "Acción administrativa"}
                                  </strong>
                                  <small>
                                    {a.email} · {date(a.created_at)}
                                  </small>
                                </div>
                              </div>
                            ))}
                            {!data.audit.length && (
                              <p className="admin-empty">
                                Los cambios se registrarán aquí.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="admin-panel">
                          <div className="admin-panel-heading">
                            <h2>Atención al inventario</h2>
                          </div>
                          <div className="admin-panel-body">
                            {low.slice(0, 6).map((v) => (
                              <div key={v.id} className="audit-entry">
                                <Package size={18} />
                                <div style={{ flex: 1 }}>
                                  <strong>{v.product}</strong>
                                  <small>
                                    {v.name} · {v.sku}
                                  </small>
                                </div>
                                <span className="badge pending">
                                  {v.stock - v.reserved}
                                </span>
                              </div>
                            ))}
                            {!low.length && (
                              <p className="admin-empty">
                                El inventario no tiene alertas.
                              </p>
                            )}
                            <button
                              className="btn btn-outline full"
                              style={{ marginTop: 17 }}
                              onClick={() => navigate("catalogo", "inventario")}
                            >
                              Gestionar inventario <ArrowRight size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="admin-panel">
                          <div className="admin-panel-body">
                            <h3>Haz crecer tu catálogo</h3>
                            <p style={{ color: "var(--muted)", fontSize: 12 }}>
                              Crea productos, configura variantes y publícalos
                              cuando estén listos.
                            </p>
                            <button
                              className="btn btn-primary full"
                              onClick={() => navigate("catalogo", "productos")}
                            >
                              Ir a productos <ArrowRight size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {section === "catalogo" && (
                  <CatalogManager
                    key={tab}
                    data={data}
                    tab={tab}
                    refresh={refresh}
                    notify={setNotice}
                  />
                )}
                {section === "ventas" && (
                  <SalesManager
                    key={section + tab}
                    data={data}
                    tab={tab}
                    refresh={refresh}
                    notify={setNotice}
                  />
                )}
                {(section === "marketing" || section === "configuracion") && (
                  <SettingsManager
                    key={section + tab}
                    data={data}
                    tab={tab}
                    refresh={refresh}
                    notify={setNotice}
                  />
                )}
              </>
            )
          )}
        </div>
      </main>
    </div>
  );
}
