"use client";
import { useState } from "react";
export function ClaimForm() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const data = Object.fromEntries(f);
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, consent: f.get("consent") === "on" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setCode(result.code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (code)
    return (
      <div className="success-box" role="status">
        <h2>Registramos tu solicitud: {code}</h2>
        <p>
          Conserva tu constancia. Puedes guardarla o imprimirla con el botón
          siguiente.
        </p>
        <button className="btn btn-outline" onClick={() => window.print()}>
          Imprimir constancia
        </button>
      </div>
    );
  return (
    <form onSubmit={submit}>
      <section className="form-panel">
        <h2>Datos de la persona consumidora</h2>
        <div className="form-grid">
          <label className="wide">
            Nombre y apellidos
            <input name="name" required minLength={3} maxLength={150} />
          </label>
          <label>
            Documento de identidad
            <input name="document" required minLength={8} maxLength={20} />
          </label>
          <label>
            Celular
            <input
              name="phone"
              type="tel"
              required
              minLength={9}
              maxLength={30}
            />
          </label>
          <label className="wide">
            Correo electrónico
            <input name="email" type="email" required />
          </label>
          <label className="wide">
            Dirección
            <input name="address" required minLength={5} maxLength={250} />
          </label>
        </div>
      </section>
      <section className="form-panel">
        <h2>Detalle de la solicitud</h2>
        <div className="form-grid">
          <label className="wide">
            Tipo
            <select name="type">
              <option value="reclamo">
                Reclamo: disconformidad con el producto o servicio
              </option>
              <option value="queja">
                Queja: disconformidad con la atención
              </option>
            </select>
          </label>
          <label className="wide">
            Producto, pedido y descripción de los hechos
            <textarea
              name="description"
              required
              minLength={15}
              maxLength={5000}
            />
          </label>
          <label className="wide">
            ¿Qué solución solicitas?
            <textarea name="request" required minLength={10} maxLength={3000} />
          </label>
        </div>
      </section>
      <label className="consent-label">
        <input type="checkbox" name="consent" required />
        <span>
          Autorizo el uso de estos datos para tramitar y responder mi solicitud
          conforme a la política de privacidad.
        </span>
      </label>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <button
        className="btn btn-primary"
        disabled={busy}
        style={{ marginTop: 20 }}
      >
        {busy ? "Registrando…" : "Registrar solicitud"}
      </button>
    </form>
  );
}
