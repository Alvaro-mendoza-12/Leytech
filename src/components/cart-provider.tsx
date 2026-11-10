"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { CartLine, SnapshotLine } from "@/lib/types";
export type StoredLine = CartLine & {
  name: string;
  variant: string;
  image: string;
  slug: string;
  max: number;
  price: number;
  isSample?: boolean;
};
type Context = {
  items: StoredLine[];
  ready: boolean;
  count: number;
  add: (item: StoredLine) => boolean;
  update: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  replace: (lines: SnapshotLine[], expected?: StoredLine[]) => void;
  notice: string;
  setNotice: (s: string) => void;
};
const CartContext = createContext<Context | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StoredLine[]>([]),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("leytech-cart-v1") || "[]",
      );
      if (Array.isArray(stored))
        setItems(
          stored
            .slice(0, 60)
            .filter(
              (i) =>
                typeof i.variantId === "string" &&
                Number.isInteger(i.quantity) &&
                i.quantity > 0 &&
                i.quantity <= 99 &&
                Number.isInteger(i.price) &&
                i.price > 0 &&
                typeof i.name === "string" &&
                typeof i.image === "string" &&
                typeof i.slug === "string" &&
                typeof i.variant === "string" &&
                Number.isInteger(i.max),
            ),
        );
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("leytech-cart-v1", JSON.stringify(items));
  }, [items, ready]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  const add = useCallback(
    (item: StoredLine) => {
      const previous = items.find((x) => x.variantId === item.variantId);
      const limit = Math.min(99, item.max);
      if ((previous?.quantity || 0) + item.quantity > limit) {
        setNotice(`Máximo ${limit} unidades de esta variante.`);
        return false;
      }
      setItems((current) => {
        const prev = current.find((x) => x.variantId === item.variantId);
        return prev
          ? current.map((x) =>
              x.variantId === item.variantId
                ? {
                    ...item,
                    max: limit,
                    quantity: Math.min(limit, x.quantity + item.quantity),
                  }
                : x,
            )
          : [...current, { ...item, max: limit }];
      });
      setNotice(`${item.name} se agregó al carrito`);
      return true;
    },
    [items],
  );
  const update = (id: string, quantity: number) =>
    setItems((current) =>
      current.map((i) =>
        i.variantId === id
          ? { ...i, quantity: Math.max(1, Math.min(quantity, i.max, 99)) }
          : i,
      ),
    );
  const replace = (lines: SnapshotLine[], expected?: StoredLine[]) =>
    setItems((current) => {
      if (expected && current !== expected) return current;
      return lines.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        price: i.price,
        name: i.name,
        variant: i.variant,
        image: i.image,
        slug: i.slug,
        max: i.available,
        isSample: i.isDemo,
      }));
    });
  return (
    <CartContext.Provider
      value={{
        items,
        ready,
        count: items.reduce((s, i) => s + i.quantity, 0),
        add,
        update,
        remove: (id) => setItems((c) => c.filter((i) => i.variantId !== id)),
        clear: () => setItems([]),
        replace,
        notice,
        setNotice,
      }}
    >
      {children}
      <div
        className={`toast ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </CartContext.Provider>
  );
}
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("CartProvider requerido");
  return value;
}
