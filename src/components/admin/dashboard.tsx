"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Megaphone,
  Settings,
  ExternalLink,
  LogOut,
  ArrowRight,
  Wallet,
  MessageCircle,
  TriangleAlert,
  Activity,
  RefreshCw,
} from "lucide-react";
import { money, orderCode, date, statusLabel } from "@/lib/format";
import { useCart } from "@/components/cart-provider";
import { CatalogManager } from "./catalog-manager";
import { SalesManager } from "./sales-manager";
import { SettingsManager } from "./settings-manager";
import type { AdminData } from "./api";
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
    label: "Ventas",
    icon: ShoppingBag,
    tabs: ["pedidos", "cotizaciones", "pagos", "reclamaciones"],
  },
  { id: "clientes", label: "Clientes", icon: Users, tabs: [] },
  { id: "marketing", label: "Marketing", icon: Megaphone, tabs: ["inicio"] },
  {
    id: "configuracion",
    label: "Configuración",
    icon: Settings,
    tabs: [
      "negocio",
      "pagos",
      "entregas",
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
  pedidos: "Pedidos",
  cotizaciones: "Cotizaciones",
  pagos: "Pagos",
  reclamaciones: "Reclamaciones",
  inicio: "Página de inicio",
  negocio: "Negocio",
  entregas: "Entregas",
  politicas: "Políticas",
  usuarios: "Usuarios",
  seguridad: "Seguridad",
};
const subtitles: Record<string, string> = {
  resumen: "Todo lo que pasa en tu negocio, en un lugar.",
  catalogo: "Tus productos y su disponibilidad, siempre al día.",
  ventas: "Del primer contacto a la entrega.",
  clientes: "Conoce a quienes eligen Leytech.",
  marketing: "Dale a tu tienda una voz propia.",
  configuracion: "Los detalles que hacen funcionar tu negocio.",
};
export function Dashboard() {
  const [data, setData] = useState<AdminData | null>(null),
    [section, setSection] = useState("resumen"),
    [tab, setTab] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const router = useRouter(),
    { setNotice } = useCart();
  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/data", { cache: "no-store" });
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    setData(result);
    setError("");
  }, [router]);
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  function navigate(id: string, target?: string) {
    setSection(id);
    setTab(target || menu.find((m) => m.id === id)?.tabs[0] || "");
  }
  const title = menu.find((m) => m.id === section)?.label || "Resumen";
  const low =
    data?.products
      .filter((p) => p.status === "published")
      .flatMap((p) =>
        p.variants
          .filter((v) => v.active && v.stock - v.reserved <= 3)
          .map((v) => ({ product: p.name, ...v })),
      ) || [];
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="logo">
          <span className="logo-mark">
            L<span />
          </span>
          Leytech<span className="logo-dot">.</span>
        </Link>
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
            <span className="badge">
              {data?.settings.demoMode
                ? "Modo de demostración"
                : "Panel privado"}
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
                          title: "Ventas confirmadas",
                          value: money(
                            data.orders
                              .filter((o) => o.status === "paid" && !o.is_demo)
                              .reduce((s, o) => s + o.total, 0),
                          ),
                          note: "Pedidos reales del historial cargado",
                          icon: Wallet,
                        },
                        {
                          title: "Pedidos pendientes",
                          value: data.orders.filter(
                            (o) => o.status === "pending",
                          ).length,
                          note: "Con reserva de stock vigente",
                          icon: ShoppingBag,
                        },
                        {
                          title: "Cotizaciones por atender",
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
                    {data.settings.demoMode && (
                      <div className="info-box">
                        Estás preparando tu tienda. El catálogo inicial es de
                        ejemplo y los pagos reales están deshabilitados.
                        Completa la información comercial en Configuración antes
                        del lanzamiento.
                      </div>
                    )}
                    <div className="admin-columns">
                      <div>
                        <div className="admin-panel">
                          <div className="admin-panel-heading">
                            <h2>Pedidos recientes</h2>
                            <button
                              className="text-link"
                              style={{ border: 0, background: "none" }}
                              onClick={() => navigate("ventas", "pedidos")}
                            >
                              Ver todos <ArrowRight size={14} />
                            </button>
                          </div>
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Pedido</th>
                                  <th>Cliente</th>
                                  <th>Total</th>
                                  <th>Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.orders.slice(0, 5).map((o) => (
                                  <tr key={o.id}>
                                    <td>
                                      <strong>{orderCode(o.code)}</strong>
                                      {o.is_demo && <small>Prueba</small>}
                                    </td>
                                    <td>{o.customer.name}</td>
                                    <td>{money(o.total)}</td>
                                    <td>
                                      <span className={`badge ${o.status}`}>
                                        {statusLabel[o.status]}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {!data.orders.length && (
                            <div className="admin-empty">
                              Tus primeros pedidos aparecerán aquí.
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
                                        "order.paid": "Pago confirmado",
                                        "order.cancelled": "Pedido cancelado",
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
                                          "order.preparing":
                                            "Pedido en preparación",
                                          "order.shipped": "Pedido enviado",
                                          "order.delivered": "Pedido entregado",
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
                {(section === "ventas" || section === "clientes") && (
                  <SalesManager
                    key={section + tab}
                    data={data}
                    tab={section === "clientes" ? "clientes" : tab}
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
