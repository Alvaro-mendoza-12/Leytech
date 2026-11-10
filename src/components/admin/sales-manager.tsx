"use client";
import { useState } from "react";
import { Archive, Check, Eye, RotateCcw } from "lucide-react";
import { money, date, quoteCode, statusLabel } from "@/lib/format";
import { adminApi, type AdminData, type Claim } from "./api";
import { Modal } from "./modal";
export const quoteStatusLabels: Record<string, string> = { pending: "Por revisar", contacted: "Atendida", closed: "Archivada" };
const quoteTabs = { pending: "Por revisar", contacted: "Atendidas", closed: "Archivadas" } as const;
type QuoteStatus = keyof typeof quoteTabs;

export function SalesManager({
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
  const [search, setSearch] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("pending");
  const [saving, setSaving] = useState(false);
  const [claim, setClaim] = useState<Claim | null>(null);
  const quote = data.quotes.find(q => q.id === quoteId);
  const filteredQuotes = data.quotes.filter(q => q.status === quoteStatus &&
    `${quoteCode(q.code)} ${q.items.map(i => i.name).join(" ")}`
      .toLowerCase().includes(search.trim().toLowerCase()));

  async function changeQuote(id: string, status: QuoteStatus) {
    setSaving(true);
    try {
      await adminApi("quotes", { id, status });
      await refresh();
      setQuoteId(null);
      notify(`Cotización ${status === "closed" ? "archivada" : status === "contacted" ? "atendida" : "reabierta"}`);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {tab === "cotizaciones" && (
        <>
          <div className="admin-panel quote-panel">
            <div className="quote-toolbar">
              <div>
                <h2>Bandeja de cotizaciones</h2>
                <p>Cada solicitud se guarda al preparar el mensaje. La atención se realiza en WhatsApp.</p>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar código o producto…" aria-label="Buscar cotizaciones" />
            </div>
            <div className="quote-tabs" aria-label="Estado de las cotizaciones" role="group">
              {(Object.keys(quoteTabs) as QuoteStatus[]).map(status => (
                <button key={status} aria-pressed={quoteStatus === status} onClick={() => setQuoteStatus(status)}>
                  {quoteTabs[status]} <span>{data.quotes.filter(q => q.status === status).length}</span>
                </button>
              ))}
            </div>
            {filteredQuotes.length > 0 ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Productos</th>
                      <th>Subtotal</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map(q => (
                        <tr key={q.id}>
                          <td>
                            <strong>{quoteCode(q.code)}</strong>
                          </td>
                          <td>
                            {q.items.length} producto
                            {q.items.length > 1 ? "s" : ""}
                            <small>{q.items[0]?.name}</small>
                          </td>
                          <td>{money(q.subtotal)}</td>
                          <td>{date(q.created_at)}</td>
                          <td>
                            <span className={`badge ${q.status}`}>{quoteStatusLabels[q.status]}</span>
                          </td>
                          <td>
                            <div className="quote-actions">
                              <button className="icon-button" onClick={() => setQuoteId(q.id)}
                                aria-label={`Ver ${quoteCode(q.code)}`} title="Ver cotización">
                                <Eye size={16} />
                              </button>
                              <button className="btn btn-outline" disabled={saving}
                                onClick={() => changeQuote(q.id, q.status === "closed" ? "pending" : "closed")}>
                                {q.status === "closed" ? <><RotateCcw size={15} /> Reabrir</> : <><Archive size={15} /> Archivar</>}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty">
                {search.trim() ? "No hay coincidencias en esta bandeja."
                  : quoteStatus === "pending" ? "No hay cotizaciones por revisar."
                    : quoteStatus === "contacted" ? "Todavía no hay cotizaciones atendidas."
                      : "Todavía no hay cotizaciones archivadas."}
              </div>
            )}
          </div>
        </>
      )}
      {tab === "reclamaciones" && (
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <h2>Libro de Reclamaciones</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.claims.map((c) => (
                  <tr key={c.id}>
                    <td>REC-{String(c.code).padStart(5, "0")}</td>
                    <td>
                      {c.customer.name}
                      <small>{c.customer.email}</small>
                    </td>
                    <td>{c.type}</td>
                    <td>{date(c.created_at)}</td>
                    <td>
                      <span className={`badge ${c.status}`}>
                        {statusLabel[c.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => setClaim(c)}
                        aria-label="Ver reclamación"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.claims.length && (
            <div className="admin-empty">No hay solicitudes registradas.</div>
          )}
        </div>
      )}
      {quote && (
        <Modal
          title={`Cotización ${quoteCode(quote.code)}`}
          onClose={() => setQuoteId(null)}
        >
          <div className="info-box">
            Abrir WhatsApp no confirma que el cliente envió el mensaje. Estado:{" "}
            {quoteStatusLabels[quote.status]}.
          </div>
          {quote.items.map((i) => (
            <div key={i.variantId} className="summary-row">
              <div>
                <strong>{i.name}</strong>
                <br />
                <small>
                  {i.variant} · {i.sku} · {i.quantity} unidades{i.isDemo ? " · Muestra" : ""}
                </small>
              </div>
              <strong>{money(i.price * i.quantity)}</strong>
            </div>
          ))}
          <div className="summary-row summary-total">
            <span>Subtotal estimado</span>
            <strong>{money(quote.subtotal)}</strong>
          </div>
          <p className="summary-note">
            {date(quote.created_at)} · Inventario sin reservar
          </p>
          <p className="info-box">Usa el código para identificar la consulta en WhatsApp. La compra y el pago se confirman en el chat.</p>
          <div className="quote-actions">
            {quote.status === "pending" && (
              <button className="btn btn-primary" disabled={saving} onClick={() => changeQuote(quote.id, "contacted")}>
                <Check size={16} /> Marcar atendida
              </button>
            )}
            <button className="btn btn-outline" disabled={saving}
              onClick={() => changeQuote(quote.id, quote.status === "closed" ? "pending" : "closed")}>
              {quote.status === "closed" ? <><RotateCcw size={16} /> Reabrir</> : <><Archive size={16} /> Archivar</>}
            </button>
          </div>
        </Modal>
      )}
      {claim && (
        <Modal
          title={`Solicitud REC-${String(claim.code).padStart(5, "0")}`}
          onClose={() => setClaim(null)}
        >
          <p>
            <strong>{claim.customer.name}</strong>
            <br />
            {claim.customer.email} · {claim.customer.phone}
          </p>
          <h3>Descripción</h3>
          <p style={{ whiteSpace: "pre-line" }}>{claim.description}</p>
          <h3>Solución solicitada</h3>
          <p style={{ whiteSpace: "pre-line" }}>{claim.request}</p>
          <div className="info-box">
            Responde al consumidor por un canal válido y conserva la constancia
            antes de marcar como resuelto.
          </div>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                await adminApi("claims", {
                  id: claim.id,
                  status: claim.status === "resolved" ? "pending" : "resolved",
                });
                await refresh();
                setClaim(null);
                notify("Solicitud actualizada");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            {claim.status === "resolved"
              ? "Reabrir solicitud"
              : "Marcar como resuelta"}
          </button>
        </Modal>
      )}
    </>
  );
}
