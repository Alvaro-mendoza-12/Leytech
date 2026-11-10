"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { money, date, quoteCode, statusLabel } from "@/lib/format";
import { adminApi, type AdminData, type Quote, type Claim } from "./api";
import { Modal } from "./modal";
export const quoteStatusLabels: Record<string, string> = { pending: "Por atender", contacted: "Atendida", closed: "Cerrada" };

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
  const [quote, setQuote] = useState<Quote | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  return (
    <>
      {tab === "cotizaciones" && (
        <>
          <div className="toolbar">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código o producto…"
              aria-label="Buscar cotizaciones"
            />
            <span>Una cotización no reserva inventario</span>
          </div>
          <div className="admin-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Productos</th>
                    <th>Subtotal</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.quotes
                    .filter((q) =>
                      `${quoteCode(q.code)} ${q.items.map((i) => i.name).join(" ")}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((q) => (
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
                          <select
                            aria-label={`Estado de ${quoteCode(q.code)}`}
                            value={q.status}
                            onChange={async (e) => {
                              try {
                                await adminApi("quotes", {
                                  id: q.id,
                                  status: e.target.value,
                                });
                                await refresh();
                                notify("Estado actualizado");
                              } catch (e) {
                                notify((e as Error).message);
                              }
                            }}
                          >
                            {["pending", "contacted", "closed"].map((s) => (
                              <option key={s} value={s}>
                                {quoteStatusLabels[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            onClick={() => setQuote(q)}
                            aria-label={`Ver ${quoteCode(q.code)}`}
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!data.quotes.length && (
              <div className="admin-empty">
                Las solicitudes del catálogo y del carrito aparecerán aquí.
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
          onClose={() => setQuote(null)}
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
