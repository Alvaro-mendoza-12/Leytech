"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldCheck, Save } from "lucide-react";
import type { StoreSettings } from "@/lib/types";
import { adminApi, type AdminData } from "./api";
import { Modal } from "./modal";
import { LogoImage } from "../brand-logo";
export function SettingsManager({
  data,
  tab,
  refresh,
  notify,
}: {
  data: AdminData;
  tab: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [s, setS] = useState<StoreSettings>({
      ...data.settings,
      policies: { ...data.settings.policies },
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [newUser, setNewUser] = useState(false),
    [supabaseAccount, setSupabaseAccount] = useState(false),
    [password, setPassword] = useState("");
  const router = useRouter();
  const owner = data.admin.role === "owner";
  function update<K extends keyof StoreSettings>(
    key: K,
    value: StoreSettings[K],
  ) {
    setS((current) => ({ ...current, [key]: value }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminApi("settings", s);
      await refresh();
      notify("Configuración guardada");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function uploadImage(
    file: File | undefined,
    field: "logoUrl" | "heroImage",
  ) {
    if (!file) return;
    if(file.size>4000000){setError('La imagen debe pesar como máximo 4 MB.');return;}
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      update(field, result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("repeat")) {
      setError("Las contraseñas nuevas no coinciden.");
      setBusy(false);
      return;
    }
    try {
      await adminApi("password", {
        current: f.get("current"),
        password: f.get("password"),
      });
      notify("Contraseña actualizada. Inicia sesión de nuevo.");
      router.push("/admin/login");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!owner && tab !== "seguridad")
    return (
      <div className="info-box">
        Esta configuración está disponible para el propietario. Puedes gestionar
        productos, inventario y cotizaciones con tu rol de personal.
      </div>
    );
  return (
    <>
      {tab === "usuarios" ? (
        <>
          <div className="toolbar">
            <span>
              El personal gestiona operaciones. El propietario configura el
              negocio.
            </span>
            <button
              className="btn btn-primary"
              onClick={() => {
                setNewUser(true);
                setSupabaseAccount(false);
                setPassword("");
                setError("");
              }}
            >
              <Plus size={16} /> Crear usuario
            </button>
          </div>
          <section className="info-box">
            <p>Para cuentas creadas en Supabase, vincula su correo e ID o activa el acceso automático para nuevas cuentas de Personal. El modo automático requiere cerrar el registro público en Supabase antes de activarlo.</p>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await adminApi("users/supabase-auto", { enabled: !data.autoSupabaseStaff });
                await refresh();
                notify("Acceso automático actualizado");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}>
              {data.autoSupabaseStaff ? "Desactivar acceso automático" : "Activar acceso automático de Supabase"}
            </button>
            {!newUser && error && <p role="alert">{error}</p>}
          </section>
          <div className="admin-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Acceso</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>{u.role === "owner" ? "Propietario" : "Personal"}</td>
                      <td>
                        <span
                          className={`badge ${u.active ? "published" : "archived"}`}
                        >
                          {u.active ? "Activo" : "Desactivado"}
                        </span>
                      </td>
                      <td>
                        {u.id !== data.admin.id && (
                          <button
                            className="btn btn-outline"
                            onClick={async () => {
                              try {
                                await adminApi("users/toggle", {
                                  id: u.id,
                                  active: !u.active,
                                });
                                await refresh();
                                notify("Acceso actualizado");
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }}
                          >
                            {u.active ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : tab === "seguridad" ? (
        <div className="admin-settings-form">
          {data.admin.authProvider === "supabase" ? (
            <section className="form-panel">
              <h2>Cuenta de Supabase</h2>
              <p>Esta cuenta usa la contraseña configurada en Supabase Auth. Gestiona su contraseña desde Supabase.</p>
            </section>
          ) : (
          <form
            className="form-panel"
            style={{ background: "white" }}
            onSubmit={changePassword}
          >
            <h2>Actualiza tu contraseña</h2>
            <p>
              Usa al menos 12 caracteres. El cambio cerrará todas tus sesiones.
            </p>
            <div className="form-grid">
              <label className="wide">
                Contraseña actual
                <input
                  type="password"
                  autoComplete="current-password"
                  name="current"
                  required
                />
              </label>
              <label>
                Nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  name="password"
                  minLength={12}
                  maxLength={200}
                  required
                />
              </label>
              <label>
                Repetir nueva contraseña
                <input
                  type="password"
                  autoComplete="new-password"
                  name="repeat"
                  minLength={12}
                  required
                />
              </label>
            </div>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              disabled={busy}
            >
              <ShieldCheck size={16} /> Actualizar contraseña
            </button>
          </form>
          )}
        </div>
      ) : (
        <form className="admin-settings-form" onSubmit={save}>
          {tab === "negocio" && (
            <>
              <section className="form-panel">
                <h2>La identidad de tu tienda</h2>
                <p>
                  Los datos de contacto se muestran en la tienda y en las
                  cotizaciones.
                </p>
                <div className="form-grid">
                  <label>
                    Nombre del negocio
                    <input
                      value={s.name}
                      required
                      onChange={(e) => update("name", e.target.value)}
                    />
                  </label>
                  <label>
                    WhatsApp internacional (sin +)
                    <input
                      value={s.whatsapp}
                      required
                      pattern="[1-9][0-9]{7,14}"
                      onChange={(e) => update("whatsapp", e.target.value)}
                      placeholder="51905886853"
                    />
                  </label>
                  <label className="wide">
                    Frase de marca
                    <input
                      value={s.tagline}
                      onChange={(e) => update("tagline", e.target.value)}
                    />
                  </label>
                  <label>
                    Color principal
                    <input
                      type="color"
                      value={s.primaryColor}
                      onChange={(e) => update("primaryColor", e.target.value)}
                    />
                  </label>
                  <label>
                    Logo (PNG, JPEG o WebP)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) =>
                        uploadImage(e.target.files?.[0], "logoUrl")
                      }
                    />
                    <LogoImage src={s.logoUrl} alt={`Logo de ${s.name}`} />
                    {s.logoUrl && (
                      <button
                        type="button"
                        className="text-link"
                        style={{ border: 0, background: "none", padding: 0 }}
                        onClick={() => update("logoUrl", "")}
                      >
                        Usar logo Leytech
                      </button>
                    )}
                  </label>
                  <label>
                    Razón social
                    <input
                      value={s.legalName}
                      onChange={(e) => update("legalName", e.target.value)}
                    />
                  </label>
                  <label>
                    RUC
                    <input
                      value={s.ruc}
                      maxLength={11}
                      onChange={(e) => update("ruc", e.target.value)}
                    />
                  </label>
                  <label className="wide">
                    Dirección comercial
                    <input
                      value={s.address}
                      onChange={(e) => update("address", e.target.value)}
                    />
                  </label>
                  <label className="wide">
                    Correo de atención
                    <input
                      type="email"
                      value={s.email}
                      onChange={(e) => update("email", e.target.value)}
                    />
                  </label>
                </div>
              </section>
              <section className="form-panel">
                <h2>Estado de la tienda</h2>
                <div className="choice-list">
                  <label className="choice-label">
                    <input
                      type="checkbox"
                      checked={s.showSamples}
                      onChange={(e) => update("showSamples", e.target.checked)}
                    />
                    <span>
                      <strong>Mostrar productos de muestra</strong>
                      <small>
                        Las muestras aparecen en el catálogo con precios referenciales y disponibilidad por consultar.
                      </small>
                    </span>
                  </label>
                  <label className="choice-label">
                    <input
                      type="checkbox"
                      checked={s.salesEnabled}
                      onChange={(e) => update("salesEnabled", e.target.checked)}
                    />
                    <span>
                        <strong>Recibir solicitudes de compra por WhatsApp</strong>
                      <small>
                          El carrito genera una solicitud para enviar por WhatsApp. Si pausas esta opción, puedes seguir atendiendo las solicitudes guardadas.
                      </small>
                    </span>
                  </label>
                </div>
              </section>
            </>
          )}
          {tab === "whatsapp" && (
            <section className="form-panel">
              <h2>Atención por WhatsApp</h2>
              <p>El visitante prepara su carrito y te envía el resumen con un código. Acuerda la compra, el pago y el envío en la conversación.</p>
              <label>
                WhatsApp del negocio (internacional, sin +)
                <input value={s.whatsapp} pattern="[1-9][0-9]{7,14}" required onChange={e => update("whatsapp", e.target.value)} />
              </label>
              <div className="info-box">Busca el código en Solicitudes → Solicitudes de WhatsApp y marca la consulta como atendida cuando respondas.</div>
            </section>
          )}
          {tab === "politicas" && (
            <section className="form-panel">
              <h2>Información y políticas</h2>
              <p>
                Se publican como texto, sin ejecutar HTML. Revisa y aprueba su
                contenido antes de aceptar ventas.
              </p>
              <div className="form-grid">
                {Object.entries({
                  nosotros: "Sobre nosotros",
                  envios: "Envíos y entregas",
                  garantias: "Cambios, devoluciones y garantías",
                  terminos: "Términos y condiciones",
                  privacidad: "Política de privacidad",
                }).map(([key, label]) => (
                  <label className="wide" key={key}>
                    {label}
                    <textarea
                      rows={6}
                      value={s.policies[key] || ""}
                      onChange={(e) =>
                        update("policies", {
                          ...s.policies,
                          [key]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          )}
          {tab === "inicio" && (
            <>
              <section className="form-panel">
                <h2>El mensaje de tu página de inicio</h2>
                <p>Usa mensajes claros y beneficios que puedas cumplir.</p>
                <div className="form-grid">
                  <label className="wide">
                    Título principal
                    <input
                      value={s.heroTitle}
                      maxLength={100}
                      onChange={(e) => update("heroTitle", e.target.value)}
                    />
                  </label>
                  <label className="wide">
                    Texto de apoyo
                    <textarea
                      value={s.heroSubtitle}
                      maxLength={300}
                      onChange={(e) => update("heroSubtitle", e.target.value)}
                    />
                  </label>
                  <label className="wide">
                    Fotografía del banner
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) =>
                        uploadImage(e.target.files?.[0], "heroImage")
                      }
                    />
                    <img
                      src={s.heroImage}
                      alt="Banner actual"
                      style={{
                        width: 180,
                        height: 110,
                        objectFit: "cover",
                        borderRadius: 7,
                      }}
                    />
                  </label>
                </div>
              </section>
              <section className="form-panel">
                <h2>Promociones y destacados</h2>
                <p>
                  En Catálogo puedes marcar productos como destacados y
                  configurar precios de oferta por variante. Aparecen
                  automáticamente en el inicio y en Ofertas.
                </p>
                <div className="info-box">
                  No hay cupones activos. Se necesitan reglas comerciales
                  definidas antes de habilitarlos.
                </div>
              </section>
            </>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Save size={16} /> {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </form>
      )}
      {newUser && (
        <Modal
          title="Crear usuario administrativo"
          onClose={() => setNewUser(false)}
        >
          {password ? (
            <div className="success-box">
              <strong>Usuario creado</strong>
              <p>Contraseña temporal (se muestra una sola vez):</p>
              <code style={{ wordBreak: "break-all" }}>{password}</code>
              <p>
                Entrégala por un canal seguro y solicita que la cambie al
                ingresar.
              </p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  const result = await adminApi("users", {
                    email: f.get("email"),
                    role: f.get("role"),
                    supabaseId: supabaseAccount ? String(f.get("supabaseId") || "").trim() : undefined,
                  });
                  await refresh();
                  if (result.linked) {
                    setNewUser(false);
                    notify("Cuenta de Supabase vinculada");
                  } else setPassword(result.password);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="form-grid">
                <label className="wide">
                  Tipo de acceso
                  <select value={supabaseAccount ? "supabase" : "local"} onChange={e => setSupabaseAccount(e.target.value === "supabase")}>
                    <option value="local">Crear contraseña de Leytech</option>
                    <option value="supabase">Vincular cuenta de Supabase</option>
                  </select>
                </label>
                <label className="wide">
                  Correo electrónico
                  <input type="email" name="email" required />
                </label>
                {supabaseAccount && <label className="wide">
                  ID del usuario en Supabase Auth
                  <input name="supabaseId" required minLength={36} maxLength={36} />
                </label>}
                <label className="wide">
                  Rol
                  <select name="role">
                    <option value="staff">Personal</option>
                    <option value="owner">Propietario</option>
                  </select>
                </label>
              </div>
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              <button
                className="btn btn-primary"
                style={{ marginTop: 20 }}
                disabled={busy}
              >
                {supabaseAccount ? "Vincular cuenta" : "Crear usuario"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
