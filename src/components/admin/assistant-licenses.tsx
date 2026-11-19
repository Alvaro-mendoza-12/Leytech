"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound } from "lucide-react";
import { date } from "@/lib/format";
import { adminApi } from "./api";

type Entry = { reference: string; redeemed_at: string | null; email: string; created_at: string };
type History = { enabled: boolean; entries: Entry[] };
type Issued = { code: string; reference: string; created: boolean };

export function AssistantLicenses({ notify }: { notify: (message: string) => void }) {
  const [history, setHistory] = useState<History>();
  const [loadError, setLoadError] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<Issued>();
  const [issueError, setIssueError] = useState("");

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/assistant-licenses", { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cargar el registro.");
      setHistory(result);
      setLoadError("");
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el registro.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIssuing(true);
    setIssueError("");
    setIssued(undefined);
    try {
      const result: Issued = await adminApi("assistant-licenses", { reference, confirmed });
      setIssued(result);
      void reload();
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "No se pudo emitir la licencia.");
    } finally {
      setIssuing(false);
    }
  }

  async function copyMessage() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        `Tu código de Leytech Asistente es:\n${issued.code}\n\nPégalo en el asistente y pulsa «Activar». Úsalo en el equipo donde quieres instalarlo.`,
      );
      notify("Mensaje copiado para pegar en WhatsApp.");
    } catch {
      setIssueError("Selecciona el código y cópialo manualmente.");
    }
  }

  return (
    <>
      <section className="admin-panel" aria-labelledby="emitir-licencia">
        <div className="admin-panel-heading"><h2 id="emitir-licencia">Emitir código para Windows</h2></div>
        <div className="admin-panel-body">
          {loadError && <p role="alert">{loadError} <button className="btn btn-outline" onClick={() => void reload()}>Reintentar</button></p>}
          {!history && !loadError && <p role="status">Cargando emisión de licencias…</p>}
          {history?.enabled === false && <p role="status">La emisión todavía no está habilitada en este sitio.</p>}
          {history?.enabled && (
            <form className="assistant-license-form" onSubmit={submit}>
              <div className="assistant-license-fields">
                <label>Referencia de compra
                  <input required placeholder="COT-00001 o PED-00001" maxLength={22} autoComplete="off"
                    value={reference} onChange={event => { setReference(event.target.value); setConfirmed(false); setIssued(undefined); }} />
                </label>
              </div>
              <label className="assistant-license-confirm">
                <input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                Verifiqué el pago y que esta compra incluye el asistente.
              </label>
              <button className="btn btn-primary" disabled={issuing || !confirmed}>
                <KeyRound size={17} aria-hidden="true" /> {issuing ? "Generando…" : "Generar código"}
              </button>
            </form>
          )}
          {issued && (
            <div className="assistant-license-result">
              <p role="status">{issued.created ? "Código generado." : "Código recuperado."} Cópialo y pégalo en el chat del comprador.</p>
              <label>Código de activación
                <input readOnly value={issued.code} onFocus={event => event.target.select()} />
              </label>
              <button type="button" className="btn btn-outline" onClick={copyMessage}>
                <Copy size={16} aria-hidden="true" /> Copiar mensaje para WhatsApp
              </button>
            </div>
          )}
          {issueError && <p role="alert" className="assistant-license-error">{issueError}</p>}
        </div>
      </section>
      {history?.enabled && (
        <section className="admin-panel assistant-license-history" aria-labelledby="registro-licencias">
          <div className="admin-panel-heading"><h2 id="registro-licencias">Últimas licencias</h2></div>
          <div className="admin-panel-body">
            {history.entries.length ? (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Compra</th><th>Estado</th><th>Emitida por</th><th>Fecha de emisión</th></tr></thead>
                  <tbody>{history.entries.map(entry => (
                    <tr key={entry.reference}>
                      <td>{entry.reference}</td>
                      <td>{entry.redeemed_at ? `Usado · ${date(entry.redeemed_at)}` : "Sin usar"}</td>
                      <td>{entry.email}</td><td>{date(entry.created_at)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p>Todavía no hay licencias emitidas desde el panel.</p>}
          </div>
        </section>
      )}
    </>
  );
}
