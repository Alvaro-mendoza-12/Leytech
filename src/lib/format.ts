export const money = (cents: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    cents / 100,
  );
export const quoteCode = (code: string | number) =>
  `COT-${String(code).padStart(5, "0")}`;
export const orderCode = (code: string | number) =>
  `PED-${String(code).padStart(5, "0")}`;
export const date = (value: string) =>
  new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
export const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  contacted: "Contactada",
  closed: "Cerrada",
  paid: "Pagado",
  cancelled: "Cancelado",
  expired: "Expirado",
  review: "Requiere revisión",
  refunded: "Reembolsado",
  unfulfilled: "Por preparar",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  published: "Publicado",
  draft: "Borrador",
  archived: "Archivado",
  resolved: "Resuelto",
};
