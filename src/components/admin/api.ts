import { announceUpdate } from "../live-updates";

export async function adminApi(path: string, data: unknown) {
  const response = await fetch(`/api/admin/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo guardar.");
  const storefront = ["products", "brands", "categories", "inventory", "settings"].includes(path);
  announceUpdate(storefront ? "both" : "admin");
  return result;
}
export type AdminData = {
  revision: string;
  autoSupabaseStaff: boolean;
  admin: import("@/lib/types").Admin;
  products: import("@/lib/types").Product[];
  categories: import("@/lib/types").Category[];
  settings: import("@/lib/types").StoreSettings;
  orders: import("@/lib/types").Order[];
  quotes: Quote[];
  movements: Movement[];
  audit: Audit[];
  claims: Claim[];
  users: User[];
  payments: Payment[];
};
export type Quote = {
  id: string;
  code: string;
  items: import("@/lib/types").SnapshotLine[];
  subtotal: number;
  status: string;
  created_at: string;
};
export type Movement = {
  id: string;
  sku: string;
  delta: number;
  reason: string;
  created_at: string;
};
export type Audit = {
  id: string;
  action: string;
  email: string;
  entity_id: string;
  created_at: string;
};
export type Claim = {
  id: string;
  code: string;
  customer: { name: string; email: string; phone: string };
  type: string;
  description: string;
  request: string;
  status: string;
  created_at: string;
};
export type User = { id: string; email: string; role: string; active: boolean };
export type Payment = {
  provider_id: string;
  order_id: string;
  status: string;
  amount: number;
  updated_at: string;
};
