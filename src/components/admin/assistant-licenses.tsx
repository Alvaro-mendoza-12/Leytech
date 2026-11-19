"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { date } from "@/lib/format";
import { adminApi } from "./api";

type Entry = { id: string; redeemed_at: string | null; email: string; created_at: string };
type History = { enabled: boolean; entries: Entry[] };
type Issued = { code: string };

export function AssistantLicenses({ notify }: { notify: (message: string) => void }) {
  const [history, setHistory] = useState<History>();
  const [loadError, setLoadError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<Issued>();
  const [issueError, setIssueError] = useState("");
  const pendingRequest = useRef<string | null>(null);
  const submitting = useRef(false);

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

  async function generate() {
    if (submitting.current) return;
    submitting.current = true;
    setIssuing(true);
    setIssueError("");
    try {
      pendingRequest.current ??= crypto.randomUUID();
      const result: Issued = await adminApi("assistant-licenses", { requestId: pendingRequest.current });
      setIssued(result);
      pendingRequest.current = null;
      void reload();
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "No se pudo emitir la licencia.");
    } finally {
      submitting.current = false;
      setIssuing(false);
    }
  }

  async function copyLicense() {
    if (!issued || issuing) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setIssueError("");
      notify("Licencia copiada. Ya puedes enviarla por WhatsApp.");
    } catch {
      setIssueError("Selecciona el código y cópialo manualmente.");
    }
  }

  return (
    <>
      <section className="admin-panel" aria-labelledby="emitir-licencia">
        <div className="admin-panel-heading"><h2 id="emitir-licencia">Licencia para Windows</h2></div>
        <div className="admin-panel-body">
          {loadError && <p role="alert">{loadError} <button className="btn btn-outline" onClick={() => void reload()}>Reintentar</button></p>}
          {!history && !loadError && <p role="status">Cargando emisión de licencias…</p>}
          {history?.enabled === false && <p role="status">La emisión todavía no está habilitada en este sitio.</p>}
          {history?.enabled && (
            <button type="button" className="btn btn-primary" disabled={issuing} onClick={generate}>
              <KeyRound size={17} aria-hidden="true" /> {issuing ? "Generando…" : "Generar licencia"}
            </button>
          )}
          {issued && (
            <div className="assistant-license-result">
              <p role="status">Copia la licencia y envíala por WhatsApp.</p>
              <label>Código de activación
                <input readOnly value={issued.code} onFocus={event => event.target.select()} />
              </label>
              <button type="button" className="btn btn-outline" disabled={issuing} onClick={copyLicense}>
                <Copy size={16} aria-hidden="true" /> Copiar licencia
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
                  <thead><tr><th>Estado</th><th>Emitida por</th><th>Fecha de emisión</th></tr></thead>
                  <tbody>{history.entries.map(entry => (
                    <tr key={entry.id}>
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
