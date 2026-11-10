"use client";
import { useState } from "react";
import {
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Upload,
  ChevronUp,
  ChevronDown,
  Save,
  Check,
  LoaderCircle,
} from "lucide-react";
import type { z } from "zod";
import type { productSchema } from "@/lib/validation";
import type { Product, Category } from "@/lib/types";
import { slugify, money } from "@/lib/format";
import { Modal } from "./modal";
import { adminApi } from "./api";
type Draft = z.input<typeof productSchema>;
const newVariant = () => ({
  sku: `LT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
  name: "Estándar",
  color: "",
  color_hex: "#242933",
  attributes: {},
  image: "",
  price: 100,
  compare_at: null,
  stock: 0,
  active: true,
});
export function ProductEditor({
  product,
  categories,
  onClose,
  onSaved,
  duplicate = false,
}: {
  product?: Product;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  duplicate?: boolean;
}) {
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(() =>
    product
      ? {
          id: duplicate ? undefined : product.id,
          name: product.name + (duplicate ? " (copia)" : ""),
          slug:
            product.slug +
            (duplicate ? `-copia-${Date.now().toString(36)}` : ""),
          brand: product.brand,
          category_id: product.category_id,
          summary: product.summary,
          description: product.description,
          specifications: product.specifications,
          images: [...product.images],
          status: duplicate ? "draft" : product.status,
          type: product.type,
          warranty: product.warranty,
          featured: duplicate ? false : product.featured,
          seo_title: product.seo_title || "",
          seo_description: product.seo_description || "",
          variants: product.variants.map((v) => ({
            ...v,
            id: duplicate ? undefined : v.id,
            sku: duplicate ? `${v.sku}-C${Date.now().toString(36)}` : v.sku,
            stock: duplicate ? 0 : v.stock,
          })),
        }
      : {
          name: "",
          slug: "",
          brand: "",
          category_id: categories[0]?.id || "",
          summary: "",
          description: "",
          specifications: {},
          images: [],
          status: "draft",
          type: "physical",
          warranty: "",
          featured: false,
          seo_title: "",
          seo_description: "",
          variants: [newVariant()],
        },
  );
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function variant(index: number, key: string, value: unknown) {
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v, i) =>
        i === index ? { ...v, [key]: value } : v,
      ),
    }));
  }
  async function save(status: Draft["status"]) {
    setBusy(true);
    setError("");
    try {
      await adminApi("products", { ...draft, status });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      field("images", [...draft.images, data.url].slice(0, 8));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function moveImage(index: number, delta: number) {
    const images = [...draft.images],
      other = index + delta;
    if (other < 0 || other >= images.length) return;
    [images[index], images[other]] = [images[other], images[index]];
    field("images", images);
  }
  const steps = [
    "Información",
    "Precio y categoría",
    "Imágenes",
    "Variantes y stock",
    "Características",
    "Revisión",
  ];
  return (
    <Modal
      title={
        duplicate
          ? "Duplicar producto"
          : product
            ? "Editar producto"
            : "Crear producto"
      }
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-outline"
            disabled={busy}
            onClick={() => save("draft")}
          >
            <Save size={15} /> Guardar borrador
          </button>
          <div>
            {step > 0 && (
              <button
                className="btn btn-outline"
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeft size={15} /> Atrás
              </button>
            )}
            {step < 5 ? (
              <button
                className="btn btn-primary"
                onClick={() => setStep((s) => s + 1)}
              >
                Continuar <ArrowRight size={15} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={busy || uploading}
                onClick={() => save(draft.status)}
              >
                {busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Check size={15} />
                )}{" "}
                Guardar producto
              </button>
            )}
          </div>
        </>
      }
    >
      <nav className="editor-steps" aria-label="Pasos para crear producto">
        {steps.map((label, i) => (
          <button
            key={label}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
            aria-current={step === i ? "step" : undefined}
          >
            <b>{i + 1}</b>
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <section className="editor-section">
        <h3>{steps[step]}</h3>
        <p>
          {
            [
              "Empieza por lo que tus clientes necesitan saber.",
              "Configura la categoría y el precio de la primera variante.",
              "Hasta 8 fotografías PNG, JPEG o WebP. La primera será la portada.",
              "Cada combinación tiene su propio precio, SKU e inventario.",
              "Agrega las especificaciones que ayudan a elegir.",
              "Comprueba la información y elige cómo publicarlo.",
            ][step]
          }
        </p>
        {step === 0 && (
          <div className="form-grid">
            <label className="wide">
              Nombre del producto
              <input
                value={draft.name}
                maxLength={160}
                onChange={(e) => {
                  field("name", e.target.value);
                  if (!product) field("slug", slugify(e.target.value));
                }}
                placeholder="Ej. Mouse inalámbrico Precision"
              />
            </label>
            <label>
              Marca
              <input
                value={draft.brand}
                maxLength={80}
                onChange={(e) => field("brand", e.target.value)}
                placeholder="Marca del producto"
              />
            </label>
            <label>
              Tipo de producto
              <select
                value={draft.type}
                onChange={(e) => field("type", e.target.value as Draft["type"])}
              >
                <option value="physical">Físico</option>
                <option value="digital">Digital (entrega manual)</option>
              </select>
            </label>
            <label className="wide">
              Enlace en la tienda
              <input
                value={draft.slug}
                onChange={(e) => field("slug", e.target.value)}
                placeholder="mouse-inalambrico"
              />
            </label>
            <label className="wide">
              Descripción breve
              <input
                value={draft.summary}
                maxLength={250}
                onChange={(e) => field("summary", e.target.value)}
              />
            </label>
            <label className="wide">
              Descripción completa
              <textarea
                rows={5}
                value={draft.description}
                onChange={(e) => field("description", e.target.value)}
              />
            </label>
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            <label className="wide">
              Categoría
              <select
                value={draft.category_id}
                onChange={(e) => field("category_id", e.target.value)}
              >
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                    {!c.active ? " (oculta)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Precio de venta (S/)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.variants[0].price / 100}
                onChange={(e) =>
                  variant(0, "price", Math.round(Number(e.target.value) * 100))
                }
              />
            </label>
            <label>
              Precio anterior real (opcional)
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Sin descuento"
                value={
                  draft.variants[0].compare_at
                    ? draft.variants[0].compare_at / 100
                    : ""
                }
                onChange={(e) =>
                  variant(
                    0,
                    "compare_at",
                    e.target.value
                      ? Math.round(Number(e.target.value) * 100)
                      : null,
                  )
                }
              />
            </label>
            <label className="consent-label wide">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(e) => field("featured", e.target.checked)}
              />
              Destacar en la página de inicio
            </label>
            <div className="info-box wide">
              Solo configura un precio anterior si corresponde a una oferta
              real. Puedes ajustar el precio de cada variante en el paso 4.
            </div>
          </div>
        )}
        {step === 2 && (
          <>
            <div className="upload-box">
              <label>
                <Upload size={26} />
                {uploading
                  ? "Subiendo imagen…"
                  : "Selecciona una fotografía (máximo 5 MB)"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading || draft.images.length >= 8}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
            </div>
            <div className="image-list">
              {draft.images.map((url, i) => (
                <div key={`${url}-${i}`}>
                  <img src={url} alt={`Fotografía ${i + 1}`} />
                  <span>
                    {i === 0 ? "Portada" : `Imagen ${i + 1}`}
                    <br />
                    {url}
                  </span>
                  <button
                    className="icon-button"
                    disabled={i === 0}
                    aria-label="Subir imagen de posición"
                    onClick={() => moveImage(i, -1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={i === draft.images.length - 1}
                    aria-label="Bajar imagen de posición"
                    onClick={() => moveImage(i, 1)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Eliminar imagen"
                    onClick={() =>
                      field(
                        "images",
                        draft.images.filter((_, index) => index !== i),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {step === 3 && (
          <>
            {draft.variants.map((v, i) => (
              <div key={i} className="variant-editor">
                <div className="variant-editor-heading">
                  <strong>
                    Variante {i + 1}: {v.name}
                  </strong>
                  {draft.variants.length > 1 && (
                    <button
                      className="icon-button"
                      aria-label={`Eliminar variante ${i + 1}`}
                      onClick={() =>
                        field(
                          "variants",
                          draft.variants.filter((_, n) => n !== i),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="form-grid">
                  <label>
                    Nombre / combinación
                    <input
                      value={v.name}
                      onChange={(e) => variant(i, "name", e.target.value)}
                      placeholder="Negro / 1 TB"
                    />
                  </label>
                  <label>
                    SKU único
                    <input
                      value={v.sku}
                      onChange={(e) => variant(i, "sku", e.target.value)}
                    />
                  </label>
                  <label>
                    Color (opcional)
                    <input
                      value={v.color}
                      onChange={(e) => variant(i, "color", e.target.value)}
                    />
                  </label>
                  <label>
                    Muestra de color
                    <input
                      type="color"
                      value={v.color_hex}
                      onChange={(e) => variant(i, "color_hex", e.target.value)}
                    />
                  </label>
                  <label>
                    Precio (S/)
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={v.price / 100}
                      onChange={(e) =>
                        variant(
                          i,
                          "price",
                          Math.round(Number(e.target.value) * 100),
                        )
                      }
                    />
                  </label>
                  <label>
                    Stock físico
                    <input
                      type="number"
                      min="0"
                      value={v.stock}
                      onChange={(e) =>
                        variant(i, "stock", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Precio anterior (S/)
                    <input
                      type="number"
                      step="0.01"
                      value={v.compare_at ? v.compare_at / 100 : ""}
                      onChange={(e) =>
                        variant(
                          i,
                          "compare_at",
                          e.target.value
                            ? Math.round(Number(e.target.value) * 100)
                            : null,
                        )
                      }
                    />
                  </label>
                  <label>
                    Imagen asociada
                    <select
                      value={v.image || ""}
                      onChange={(e) => variant(i, "image", e.target.value)}
                    >
                      <option value="">Imagen principal</option>
                      {draft.images.map((url, index) => (
                        <option value={url} key={url}>
                          Imagen {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="consent-label">
                    <input
                      type="checkbox"
                      checked={v.active}
                      onChange={(e) => variant(i, "active", e.target.checked)}
                    />
                    Variante activa
                  </label>
                </div>
              </div>
            ))}
            <button
              className="btn btn-outline"
              onClick={() =>
                field("variants", [...draft.variants, newVariant()])
              }
            >
              <Plus size={16} /> Agregar variante
            </button>
          </>
        )}
        {step === 4 && (
          <>
            <div style={{ marginBottom: 20 }}>
              {Object.entries(draft.specifications).map(([key, value], i) => (
                <div className="attribute-row" key={i}>
                  <input
                    aria-label={`Característica ${i + 1}`}
                    value={key}
                    onChange={(e) => {
                      const entries = Object.entries(draft.specifications);
                      entries[i] = [e.target.value, value];
                      field("specifications", Object.fromEntries(entries));
                    }}
                    placeholder="Ej. Capacidad"
                  />
                  <input
                    aria-label={`Valor de característica ${i + 1}`}
                    value={value}
                    onChange={(e) =>
                      field("specifications", {
                        ...draft.specifications,
                        [key]: e.target.value,
                      })
                    }
                    placeholder="Ej. 1 TB"
                  />
                  <button
                    className="icon-button"
                    aria-label="Eliminar característica"
                    onClick={() =>
                      field(
                        "specifications",
                        Object.fromEntries(
                          Object.entries(draft.specifications).filter(
                            ([k]) => k !== key,
                          ),
                        ),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="btn btn-outline"
                onClick={() =>
                  field("specifications", {
                    ...draft.specifications,
                    [`Característica ${Object.keys(draft.specifications).length + 1}`]:
                      "",
                  })
                }
              >
                <Plus size={15} /> Agregar característica
              </button>
            </div>
            <div className="form-grid">
              <label className="wide">
                Condiciones de garantía
                <textarea
                  value={draft.warranty}
                  onChange={(e) => field("warranty", e.target.value)}
                />
              </label>
              <label className="wide">
                Título para buscadores (opcional)
                <input
                  value={draft.seo_title}
                  onChange={(e) => field("seo_title", e.target.value)}
                />
              </label>
              <label className="wide">
                Descripción para buscadores (opcional)
                <textarea
                  value={draft.seo_description}
                  onChange={(e) => field("seo_description", e.target.value)}
                />
              </label>
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <div className="review-grid">
              <img
                src={draft.images[0] || "/images/placeholder.svg"}
                alt="Vista previa"
              />
              <div>
                <span className="product-brand">{draft.brand}</span>
                <h3>{draft.name || "Producto sin nombre"}</h3>
                <p>{draft.summary}</p>
                <strong>{money(draft.variants[0].price)}</strong>
                <p>
                  {draft.variants.length} variantes ·{" "}
                  {draft.variants.reduce((s, v) => s + v.stock, 0)} unidades
                  físicas
                </p>
              </div>
            </div>
            <div className="form-grid" style={{ marginTop: 25 }}>
              <label className="wide">
                Estado de publicación
                <select
                  value={draft.status}
                  onChange={(e) =>
                    field("status", e.target.value as Draft["status"])
                  }
                >
                  <option value="draft">Guardar como borrador</option>
                  <option value="published">Publicar en la tienda</option>
                  <option value="archived">Archivar</option>
                </select>
              </label>
            </div>
            <div className="info-box">
              Comprueba imágenes, precios, legitimidad de licencias y
              condiciones de garantía antes de publicar. Los pedidos históricos
              conservarán su información original.
            </div>
          </>
        )}
      </section>
    </Modal>
  );
}
