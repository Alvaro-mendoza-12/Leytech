"use client";
import { useState } from "react";
import {
  Plus,
  Search,
  Edit3,
  Copy,
  ExternalLink,
  Package,
  ArrowUpDown,
} from "lucide-react";
import { money, slugify, statusLabel, date } from "@/lib/format";
import type { Product, Category } from "@/lib/types";
import { ProductEditor } from "./product-editor";
import { Modal } from "./modal";
import { adminApi, type AdminData } from "./api";
export function CatalogManager({
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
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [editor, setEditor] = useState<{
      product?: Product;
      duplicate?: boolean;
    } | null>(null),
    [category, setCategory] = useState<Partial<Category> | null>(null),
    [adjust, setAdjust] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const productList = data.products.filter(
    (p) =>
      (!status || p.status === status) &&
      `${p.name} ${p.brand} ${p.variants.map((v) => v.sku).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const allVariants = data.products
    .flatMap((p) => p.variants.map((v) => ({ ...v, product: p.name })))
    .filter((v) =>
      `${v.product} ${v.sku}`.toLowerCase().includes(search.toLowerCase()),
    );
  async function categorySave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminApi("categories", category);
      await refresh();
      setCategory(null);
      notify("Categoría guardada");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adjustStock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await adminApi("inventory", {
        variantId: adjust,
        delta: Number(f.get("delta")),
        reason: f.get("reason"),
      });
      await refresh();
      setAdjust(null);
      notify("Inventario actualizado");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {tab === "productos" && (
        <>
          <div className="toolbar">
            <input
              aria-label="Buscar en productos"
              placeholder="Buscar por nombre, marca o SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filtrar por estado"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="published">Publicados</option>
              <option value="draft">Borradores</option>
              <option value="archived">Archivados</option>
            </select>
            <span>{productList.length} productos</span>
            <button className="btn btn-primary" onClick={() => setEditor({})}>
              <Plus size={16} /> Crear producto
            </button>
          </div>
          <div className="admin-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Precio desde</th>
                    <th>Stock disponible</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {productList.map((p) => {
                    const activeCategory = data.categories.some(c => c.id === p.category_id && c.active);
                    const visible = activeCategory && p.variants.some(v => v.active) && (
                      p.is_demo
                        ? p.status !== "archived" && (data.settings.showSamples || (data.settings.demoMode && p.status === "published"))
                        : p.status === "published"
                    );
                    return <tr key={p.id}>
                      <td>
                        <div className="table-product">
                          <img
                            src={p.images[0] || "/images/placeholder.svg"}
                            alt=""
                          />
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {p.brand} · {p.category_name}
                              {p.is_demo ? " · Muestra" : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {money(
                          Math.min(
                            ...p.variants
                              .filter((v) => v.active)
                              .map((v) => v.price),
                            ...(!p.variants.some((v) => v.active) ? [0] : []),
                          ),
                        )}
                      </td>
                      <td>
                        {p.is_demo ? "Por consultar" : p.variants
                          .filter((v) => v.active)
                          .reduce((s, v) => s + v.stock - v.reserved, 0)}
                        <small>{p.variants.length} variantes</small>
                      </td>
                      <td>
                        <span className={`badge ${visible ? "published" : p.status}`}>
                          {visible && p.is_demo ? "Muestra visible" : statusLabel[p.status]}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={`Editar ${p.name}`}
                            title="Editar"
                            onClick={() => setEditor({ product: p })}
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Duplicar ${p.name}`}
                            title="Duplicar"
                            onClick={() =>
                              setEditor({ product: p, duplicate: true })
                            }
                          >
                            <Copy size={15} />
                          </button>
                          {visible && (
                            <a
                              href={`/producto/${p.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="icon-button"
                              title="Ver en tienda"
                              aria-label={`Ver ${p.name} en tienda`}
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {!productList.length && (
              <div className="admin-empty">
                No encontramos productos con estos filtros.
              </div>
            )}
          </div>
        </>
      )}
      {tab === "categorias" && (
        <>
          <div className="toolbar">
            <span>{data.categories.length} categorías</span>
            <button
              className="btn btn-primary"
              onClick={() => {
                setError("");
                setCategory({
                  name: "",
                  slug: "",
                  active: true,
                  parent_id: null,
                });
              }}
            >
              <Plus size={16} /> Crear categoría
            </button>
          </div>
          <div className="admin-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Enlace</th>
                    <th>Grupo superior</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>{c.slug}</td>
                      <td>
                        {data.categories.find((p) => p.id === c.parent_id)
                          ?.name || "Principal"}
                      </td>
                      <td>
                        <span
                          className={`badge ${c.active ? "published" : "archived"}`}
                        >
                          {c.active ? "Visible" : "Oculta"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Editar categoría ${c.name}`}
                          onClick={() => {
                            setError("");
                            setCategory({ ...c });
                          }}
                        >
                          <Edit3 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {tab === "inventario" && (
        <>
          <div className="toolbar">
            <input
              aria-label="Buscar inventario"
              placeholder="Buscar producto o SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>Stock por variante</span>
          </div>
          <div className="admin-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Producto / variante</th>
                    <th>SKU</th>
                    <th>Físico</th>
                    <th>Reservado</th>
                    <th>Disponible</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {allVariants.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.product}</strong>
                        <small>
                          {v.name}
                          {!v.active ? " · Inactiva" : ""}
                        </small>
                      </td>
                      <td>{v.sku}</td>
                      <td>{v.stock}</td>
                      <td>{v.reserved}</td>
                      <td>
                        <span
                          className={`badge ${v.stock - v.reserved <= 3 ? "pending" : "published"}`}
                        >
                          {v.stock - v.reserved}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-outline"
                          onClick={() => {
                            setAdjust(v.id);
                            setError("");
                          }}
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="admin-panel">
            <div className="admin-panel-heading">
              <h2>Movimientos recientes</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>SKU</th>
                    <th>Movimiento</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{date(m.created_at)}</td>
                      <td>{m.sku}</td>
                      <td
                        style={{
                          color: m.delta > 0 ? "var(--green)" : "#b91c1c",
                        }}
                      >
                        {m.delta > 0 ? "+" : ""}
                        {m.delta}
                      </td>
                      <td>{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.movements.length && (
              <div className="admin-empty">
                Los ajustes y ventas confirmadas se registrarán aquí.
              </div>
            )}
          </div>
        </>
      )}
      {tab === "marcas" && (
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <h2>Marcas del catálogo</h2>
          </div>
          <div className="admin-panel-body">
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Agrega una marca al crear un producto. Puedes renombrarla en todo
              el catálogo desde aquí.
            </p>
            {[...new Set(data.products.map((p) => p.brand))].map((brand) => (
              <form
                key={brand}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 15,
                }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    await adminApi("brands", {
                      name: brand,
                      newName: f.get("name"),
                    });
                    await refresh();
                    notify("Marca actualizada");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <input
                  name="name"
                  defaultValue={brand}
                  required
                  maxLength={80}
                  aria-label={`Nombre de marca ${brand}`}
                />
                <span
                  style={{
                    whiteSpace: "nowrap",
                    fontSize: 11,
                    color: "var(--muted)",
                  }}
                >
                  {data.products.filter((p) => p.brand === brand).length}{" "}
                  productos
                </span>
                <button className="btn btn-outline">Guardar</button>
              </form>
            ))}
          </div>
        </div>
      )}
      {editor && (
        <ProductEditor
          product={editor.product}
          duplicate={editor.duplicate}
          categories={data.categories}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            await refresh();
            notify("Producto guardado");
          }}
        />
      )}
      {category && (
        <Modal
          title={category.id ? "Editar categoría" : "Crear categoría"}
          onClose={() => setCategory(null)}
        >
          <form onSubmit={categorySave}>
            <div className="form-grid">
              <label className="wide">
                Nombre
                <input
                  required
                  value={category.name || ""}
                  onChange={(e) =>
                    setCategory((c) => ({
                      ...c,
                      name: e.target.value,
                      ...(!c?.id ? { slug: slugify(e.target.value) } : {}),
                    }))
                  }
                />
              </label>
              <label className="wide">
                Enlace
                <input
                  required
                  value={category.slug || ""}
                  onChange={(e) =>
                    setCategory((c) => ({ ...c, slug: e.target.value }))
                  }
                />
              </label>
              <label className="wide">
                Grupo superior
                <select
                  value={category.parent_id || ""}
                  onChange={(e) =>
                    setCategory((c) => ({
                      ...c,
                      parent_id: e.target.value || null,
                    }))
                  }
                >
                  <option value="">Categoría principal</option>
                  {data.categories
                    .filter((c) => c.id !== category.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="consent-label wide">
                <input
                  type="checkbox"
                  checked={!!category.active}
                  onChange={(e) =>
                    setCategory((c) => ({ ...c, active: e.target.checked }))
                  }
                />
                Mostrar en la tienda
              </label>
            </div>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              disabled={busy}
            >
              Guardar categoría
            </button>
          </form>
        </Modal>
      )}
      {adjust && (
        <Modal title="Ajustar inventario" onClose={() => setAdjust(null)}>
          <p>{allVariants.find((v) => v.id === adjust)?.sku}</p>
          <form onSubmit={adjustStock}>
            <div className="form-grid">
              <label className="wide">
                Unidades a agregar o retirar
                <input
                  type="number"
                  name="delta"
                  required
                  placeholder="Ej. 5 para agregar, -2 para retirar"
                />
              </label>
              <label className="wide">
                Motivo del ajuste
                <textarea
                  name="reason"
                  minLength={5}
                  required
                  placeholder="Ej. Ingreso de mercadería, comprobante…"
                />
              </label>
            </div>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              disabled={busy}
            >
              Guardar ajuste
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
