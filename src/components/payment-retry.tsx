"use client";
import { useState } from "react";
export function PaymentRetry({ token }: { token: string }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      const res = await fetch("/api/orders/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn btn-primary" disabled={busy} onClick={retry}>
        {busy ? "Conectando…" : "Continuar al pago"}
      </button>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
