"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  LockKeyhole,
  LoaderCircle,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { useCart } from "./cart-provider";
import { money } from "@/lib/format";
import type { StoreSettings } from "@/lib/types";
export function CheckoutPage({
  settings: s,
  onlineEnabled,
  mode,
}: {
  settings: StoreSettings;
  onlineEnabled: boolean;
  mode: string;
}) {
  const cart = useCart(),
    router = useRouter();
  const [delivery, setDelivery] = useState(
      s.demoMode
        ? "pickup"
        : s.shippingEnabled
          ? "shipping"
          : s.pickupEnabled
            ? "pickup"
            : "coordinate",
    ),
    [method, setMethod] = useState(
      s.demoMode
        ? "coordinate"
        : onlineEnabled
          ? "mercadopago"
          : s.transferEnabled
            ? "transfer"
            : "coordinate",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [idempotency, setIdempotency] = useState(""),
    [digitalOnly, setDigitalOnly] = useState(false),
    [validated, setValidated] = useState(false);
  const cartSignature = cart.items
    .map((i) => `${i.variantId}:${i.quantity}:${i.price}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (!cart.ready) return;
    let key = crypto.randomUUID();
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("leytech-checkout") || "null",
      );
      if (saved?.signature === cartSignature && typeof saved.key === "string")
        key = saved.key;
      sessionStorage.setItem(
        "leytech-checkout",
        JSON.stringify({ signature: cartSignature, key }),
      );
    } catch {}
    setIdempotency(key);
  }, [cart.ready, cartSignature]);
  useEffect(() => {
    if (!cart.ready || !cart.items.length) return;
    fetch("/api/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const digital = data.items.every(
          (i: { type: string }) => i.type === "digital",
        );
        setDigitalOnly(digital);
        if (digital) setDelivery("digital");
        if (data.items.some((i: { priceChanged: boolean }) => i.priceChanged)) {
          setError(
            "El precio cambió. Vuelve al carrito y revisa el total antes de continuar.",
          );
        } else setValidated(true);
      })
      .catch((e) => setError(e.message));
  }, [cart.ready]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotency,
          items: cart.items,
          customer: {
            name: data.get("name"),
            email: data.get("email"),
            phone: data.get("phone"),
            delivery,
            address: data.get("address") || "",
            district: delivery === "shipping" ? s.shippingZone : "",
          },
          method,
          consent: data.get("consent") === "on",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      try {
        sessionStorage.removeItem("leytech-checkout");
      } catch {}
      try {
        const history = JSON.parse(
          localStorage.getItem("leytech-orders") || "[]",
        );
        localStorage.setItem(
          "leytech-orders",
          JSON.stringify(
            [result.token, ...(Array.isArray(history) ? history : [])].slice(
              0,
              20,
            ),
          ),
        );
      } catch {}
      cart.clear();
      if (result.paymentUrl) window.location.assign(result.paymentUrl);
      else router.push(`/pedido/${result.token}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0),
    shipping = delivery === "shipping" ? s.shippingFee : 0;
  const enabled =
    validated &&
    (s.demoMode ||
      (s.salesEnabled && delivery !== "coordinate" && method !== "coordinate"));
  if (!cart.ready) return <div className="skeleton" style={{ height: 400 }} />;
  if (!cart.items.length)
    return (
      <div className="empty-state">
        <ShoppingBag size={40} />
        <h2>Primero elige tu próximo upgrade</h2>
        <p>Agrega un producto al carrito para continuar.</p>
        <Link href="/catalogo" className="btn btn-primary">
          Ver catálogo
        </Link>
      </div>
    );
  return (
    <>
      <div className="steps">
        <span>
          <b>1</b> Carrito
        </span>
        <span className="active">
          <b>2</b> Datos del pedido
        </span>
        <span>
          <b>3</b> Confirmación
        </span>
      </div>
      <div className="page-heading">
        <div>
          <h1>Un paso más cerca.</h1>
          <p>Completa tus datos. No necesitas crear una cuenta.</p>
        </div>
      </div>
      {s.demoMode && (
        <div className="info-box">
          <strong>Modo de demostración.</strong> Crearás un pedido de prueba,
          sin cobro ni entrega real. No ingreses datos personales reales.
        </div>
      )}
      {!enabled && (
        <div className="info-box">
          Las compras están en preparación. Puedes cotizar tu carrito y
          coordinar disponibilidad y entrega por WhatsApp.{" "}
          <Link className="text-link" href="/carrito">
            Volver al carrito
          </Link>
        </div>
      )}
      <form onSubmit={submit}>
        <div className="checkout-layout">
          <div>
            <section className="form-panel">
              <h2>¿A nombre de quién?</h2>
              <p>Usaremos estos datos únicamente para atender tu pedido.</p>
              <div className="form-grid">
                <label className="wide">
                  Nombre y apellidos
                  <input
                    name="name"
                    autoComplete="name"
                    minLength={3}
                    maxLength={100}
                    required
                    placeholder="Tu nombre completo"
                  />
                </label>
                <label>
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={150}
                    placeholder="nombre@correo.com"
                  />
                </label>
                <label>
                  Celular
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    minLength={9}
                    maxLength={18}
                    placeholder="999 999 999"
                  />
                </label>
              </div>
            </section>
            <section className="form-panel">
              <h2>¿Cómo lo recibes?</h2>
              <p>Revisa la opción de entrega y su costo antes de confirmar.</p>
              <div className="choice-list">
                {digitalOnly ? (
                  <div className="choice-label">
                    <span>
                      <strong>Entrega digital · Sin costo de envío</strong>
                      <small>
                        El equipo autorizado enviará las instrucciones después
                        de confirmar el pago.
                      </small>
                    </span>
                  </div>
                ) : s.demoMode ? (
                  <label className="choice-label">
                    <input type="radio" checked readOnly name="delivery" />
                    <span>
                      <strong>Entrega de prueba · S/ 0.00</strong>
                      <small>
                        Este pedido no genera un envío ni un recojo real.
                      </small>
                    </span>
                  </label>
                ) : (
                  <>
                    {s.shippingEnabled && (
                      <label className="choice-label">
                        <input
                          type="radio"
                          name="delivery"
                          checked={delivery === "shipping"}
                          onChange={() => setDelivery("shipping")}
                        />
                        <span>
                          <strong>
                            Envío a {s.shippingZone} · {money(s.shippingFee)}
                          </strong>
                          <small>
                            Disponible únicamente dentro de esta zona.
                          </small>
                        </span>
                      </label>
                    )}
                    {s.pickupEnabled && (
                      <label className="choice-label">
                        <input
                          type="radio"
                          name="delivery"
                          checked={delivery === "pickup"}
                          onChange={() => setDelivery("pickup")}
                        />
                        <span>
                          <strong>Recojo · Sin costo adicional</strong>
                          <small>{s.pickupInstructions}</small>
                        </span>
                      </label>
                    )}
                    {!s.shippingEnabled && !s.pickupEnabled && (
                      <p>
                        Solicita una cotización para confirmar las opciones de
                        entrega.
                      </p>
                    )}
                  </>
                )}
              </div>
              {delivery === "shipping" && (
                <div className="form-grid" style={{ marginTop: 20 }}>
                  <label className="wide">
                    Dirección de entrega
                    <input
                      name="address"
                      autoComplete="street-address"
                      required
                      minLength={5}
                      maxLength={250}
                      placeholder="Calle, número, departamento y referencia"
                    />
                  </label>
                  <label>
                    Zona de entrega
                    <input value={s.shippingZone} readOnly />
                  </label>
                </div>
              )}
            </section>
            <section className="form-panel">
              <h2>Medio de pago</h2>
              <p>
                {s.demoMode
                  ? "Los pagos reales están deshabilitados en esta demostración."
                  : "Selecciona una opción habilitada por Leytech."}
              </p>
              <div className="choice-list">
                {s.demoMode ? (
                  <label className="choice-label">
                    <input type="radio" checked readOnly />
                    <span>
                      <strong>Pedido de prueba · Sin cobro</strong>
                      <small>
                        El estado será pendiente. No se simula un pago exitoso.
                      </small>
                    </span>
                  </label>
                ) : (
                  <>
                    {onlineEnabled && (
                      <label className="choice-label">
                        <input
                          type="radio"
                          name="method"
                          checked={method === "mercadopago"}
                          onChange={() => setMethod("mercadopago")}
                        />
                        <span>
                          <strong>
                            Tarjeta y medios disponibles en Mercado Pago
                            {mode === "sandbox" ? " · Prueba oficial" : ""}
                          </strong>
                          <small>
                            Completarás el pago en la página segura del
                            proveedor.
                          </small>
                        </span>
                      </label>
                    )}
                    {s.transferEnabled && (
                      <label className="choice-label">
                        <input
                          type="radio"
                          name="method"
                          checked={method === "transfer"}
                          onChange={() => setMethod("transfer")}
                        />
                        <span>
                          <strong>Transferencia bancaria</strong>
                          <small>{s.transferInstructions}</small>
                        </span>
                      </label>
                    )}
                    {!onlineEnabled && !s.transferEnabled && (
                      <p>
                        No hay medios de pago habilitados. Solicita una
                        cotización.
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
            <label className="consent-label">
              <input type="checkbox" name="consent" required />
              <span>
                He leído y acepto los{" "}
                <Link href="/informacion/terminos" target="_blank">
                  términos y condiciones
                </Link>{" "}
                y la{" "}
                <Link href="/informacion/privacidad" target="_blank">
                  política de privacidad
                </Link>
                .
                {s.demoMode &&
                  " Entiendo que se trata de un pedido de demostración."}
              </span>
            </label>
            {error && (
              <div className="error-box" role="alert">
                {error}{" "}
                <Link className="text-link" href="/carrito">
                  Revisar carrito
                </Link>
              </div>
            )}
          </div>
          <aside className="order-summary">
            <h2>Tu pedido</h2>
            {cart.items.map((i) => (
              <div className="checkout-item" key={i.variantId}>
                <div>
                  <Image
                    src={i.image || "/images/placeholder.svg"}
                    alt=""
                    fill
                    sizes="48px"
                  />
                </div>
                <div>
                  <p>{i.name}</p>
                  <small>
                    {i.variant} · Cant. {i.quantity}
                  </small>
                </div>
                <strong>{money(i.price * i.quantity)}</strong>
              </div>
            ))}
            <div className="summary-row" style={{ marginTop: 23 }}>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div className="summary-row">
              <span>Entrega</span>
              <strong>
                {delivery === "coordinate" ? "Por confirmar" : money(shipping)}
              </strong>
            </div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <strong>{money(subtotal + shipping)}</strong>
            </div>
            <button
              className="btn btn-primary full"
              type="submit"
              disabled={busy || !enabled || !idempotency}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <LockKeyhole size={16} />
              )}{" "}
              {s.demoMode
                ? "Crear pedido de prueba"
                : method === "mercadopago"
                  ? "Continuar al pago"
                  : "Confirmar pedido"}{" "}
              <ArrowRight size={16} />
            </button>
            <p className="summary-note">
              Reservamos tu stock durante 30 minutos. El pedido queda pendiente
              hasta verificar el pago.
              {mode === "sandbox" && onlineEnabled
                ? " Mercado Pago está en entorno de pruebas."
                : ""}
            </p>
            <Link
              href="/carrito"
              className="text-link"
              style={{ marginTop: 16 }}
            >
              Volver a mi carrito
            </Link>
          </aside>
        </div>
      </form>
    </>
  );
}
