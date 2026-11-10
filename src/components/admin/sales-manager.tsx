"use client";
import { useState } from "react";
import { Eye, MessageCircle, Search } from "lucide-react";
import { money, date, orderCode, quoteCode, statusLabel } from "@/lib/format";
import type { Order } from "@/lib/types";
import { adminApi, type AdminData, type Quote, type Claim } from "./api";
import { Modal } from "./modal";
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
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState<Order | null>(null),
    [quote, setQuote] = useState<Quote | null>(null),
    [claim, setClaim] = useState<Claim | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await adminApi("orders", {
        id: selected.id,
        action: f.get("action"),
        reason: f.get("reason") || "",
      });
      await refresh();
      setSelected(null);
      notify("Pedido actualizado");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const orders = data.orders.filter(
    (o) =>
      (!status || o.status === status) &&
      `${orderCode(o.code)} ${o.customer.name} ${o.customer.email}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      {tab === "pedidos" && (
        <>
          <div className="toolbar">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, nombre o correo…"
              aria-label="Buscar pedidos"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filtrar estado de pedido"
            >
              <option value="">Todos los estados</option>
              {[
                "pending",
                "paid",
                "cancelled",
                "expired",
                "review",
                "refunded",
              ].map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s]}
                </option>
              ))}
            </select>
            <span>{orders.length} pedidos · últimos 200</span>
          </div>
          <OrdersTable
            orders={orders}
            onSelect={(o) => {
              setSelected(o);
              setError("");
            }}
          />
        </>
      )}
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
                                {statusLabel[s]}
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
      {tab === "pagos" && (
        <div className="admin-panel">
          <div className="admin-panel-heading">
            <h2>Pagos verificados con el proveedor</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID Mercado Pago</th>
                  <th>Pedido</th>
                  <th>Importe</th>
                  <th>Estado del proveedor</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.provider_id}>
                    <td>{p.provider_id}</td>
                    <td>
                      {orderCode(
                        data.orders.find((o) => o.id === p.order_id)?.code ||
                          "—",
                      )}
                    </td>
                    <td>{money(p.amount)}</td>
                    <td>
                      <span className="badge">{p.status}</span>
                    </td>
                    <td>{date(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.payments.length && (
            <div className="admin-empty">
              No hay pagos verificados. Las reservas y los pedidos pendientes no
              cuentan como ventas.
            </div>
          )}
        </div>
      )}
      {tab === "clientes" && (
        <>
          <div className="toolbar">
            <input
              aria-label="Buscar clientes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre, correo o celular…"
            />
            <span>Datos de los pedidos registrados</span>
          </div>
          <div className="admin-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th>Pedidos</th>
                    <th>Compras confirmadas</th>
                    <th>Último pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(data.orders.map((o) => o.customer.email))]
                    .map((email) =>
                      data.orders.filter((o) => o.customer.email === email),
                    )
                    .filter((list) =>
                      `${list[0].customer.name} ${emailText(list)} ${list[0].customer.phone}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((list) => (
                      <tr key={list[0].customer.email}>
                        <td>
                          <strong>{list[0].customer.name}</strong>
                          <small>
                            {list.every((o) => o.is_demo)
                              ? "Datos de demostración"
                              : ""}
                          </small>
                        </td>
                        <td>
                          {list[0].customer.email}
                          <small>{list[0].customer.phone}</small>
                        </td>
                        <td>{list.length}</td>
                        <td>
                          {money(
                            list
                              .filter((o) => o.status === "paid" && !o.is_demo)
                              .reduce((s, o) => s + o.total, 0),
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-outline"
                            onClick={() => {
                              setSelected(list[0]);
                              setError("");
                            }}
                          >
                            {orderCode(list[0].code)}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!data.orders.length && (
              <div className="admin-empty">
                Los clientes se registrarán cuando recibas pedidos.
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
      {selected && (
        <Modal
          title={`Pedido ${orderCode(selected.code)}`}
          onClose={() => setSelected(null)}
        >
          <span className={`badge ${selected.status}`}>
            {statusLabel[selected.status]}
          </span>
          {selected.is_demo && (
            <div className="info-box">
              Pedido de prueba. No representa una venta ni un cobro real.
            </div>
          )}
          <h3 style={{ marginTop: 20 }}>{selected.customer.name}</h3>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            {selected.customer.email} · {selected.customer.phone}
            <br />
            {selected.customer.address} {selected.customer.district}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Producto / variante</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((i) => (
                  <tr key={i.variantId}>
                    <td>
                      <strong>{i.name}</strong>
                      <small>
                        {i.variant} · {i.sku}
                      </small>
                    </td>
                    <td>{i.quantity}</td>
                    <td>{money(i.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="summary-row summary-total">
            <span>Total con entrega</span>
            <strong>{money(selected.total)}</strong>
          </div>
          <p className="summary-note">
            Creado: {date(selected.created_at)} · Reserva:{" "}
            {date(selected.expires_at)} · Medio: {selected.method} · Entrega:{" "}
            {statusLabel[selected.fulfillment]}
          </p>
          {["pending", "paid"].includes(selected.status) && (
            <form onSubmit={action} style={{ marginTop: 22 }}>
              <div className="form-grid">
                <label className="wide">
                  Actualizar pedido
                  <select name="action">
                    {selected.status === "pending" ? (
                      <>
                        {selected.method !== "mercadopago" && (
                          <option value="paid">
                            {selected.is_demo
                              ? "Confirmar pago de prueba"
                              : "Confirmar ingreso de pago manual"}
                          </option>
                        )}
                        <option value="cancelled">
                          Cancelar y liberar reserva
                        </option>
                      </>
                    ) : (
                      <>
                        <option value="preparing">En preparación</option>
                        <option value="shipped">Enviado</option>
                        <option value="delivered">Entregado</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="wide">
                  Motivo o evidencia de verificación
                  <textarea
                    name="reason"
                    maxLength={1000}
                    placeholder="Para confirmar un pago: indica la referencia y cómo verificaste el ingreso."
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
                style={{ marginTop: 17 }}
                disabled={busy}
              >
                Guardar cambio
              </button>
            </form>
          )}
        </Modal>
      )}
      {quote && (
        <Modal
          title={`Cotización ${quoteCode(quote.code)}`}
          onClose={() => setQuote(null)}
        >
          <div className="info-box">
            Abrir WhatsApp no confirma que el cliente envió el mensaje. Estado:{" "}
            {statusLabel[quote.status]}.
          </div>
          {quote.items.map((i) => (
            <div key={i.variantId} className="summary-row">
              <div>
                <strong>{i.name}</strong>
                <br />
                <small>
                  {i.variant} · {i.sku} · {i.quantity} unidades
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
function emailText(orders: Order[]) {
  return orders[0].customer.email;
}
export function OrdersTable({
  orders,
  onSelect,
}: {
  orders: Order[];
  onSelect: (o: Order) => void;
}) {
  return (
    <div className="admin-panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{orderCode(o.code)}</strong>
                  {o.is_demo && <small>Demostración</small>}
                </td>
                <td>
                  {o.customer.name}
                  <small>{o.customer.email}</small>
                </td>
                <td>{money(o.total)}</td>
                <td>
                  <span className={`badge ${o.status}`}>
                    {statusLabel[o.status]}
                  </span>
                </td>
                <td>{date(o.created_at)}</td>
                <td>
                  <button
                    className="icon-button"
                    onClick={() => onSelect(o)}
                    aria-label={`Ver ${orderCode(o.code)}`}
                  >
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!orders.length && (
        <div className="admin-empty">
          Aún no hay pedidos. Los recibirás aquí cuando un cliente confirme su
          carrito.
        </div>
      )}
    </div>
  );
}
