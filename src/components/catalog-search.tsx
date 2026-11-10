"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { money } from "@/lib/format";

type Suggestion = {
  slug: string;
  name: string;
  category: string;
  image: string;
  price: number;
  sample: boolean;
};

export function CatalogSearch({ revision }: { revision: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [result, setResult] = useState<{ key: string; items: Suggestion[]; failed?: boolean } | null>(null);
  const router = useRouter();
  const listId = useId();
  const term = query.trim();
  const expanded = open && term.length >= 2;
  const resultKey = `${revision}:${term}`;
  const current = result?.key === resultKey ? result : null;
  const items = current?.items ?? [];
  const activeId = expanded && items[selected] ? `${listId}-${selected}` : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/suggestions?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!controller.signal.aborted) setResult({ key: resultKey, items: data.items });
      } catch {
        if (!controller.signal.aborted) setResult({ key: resultKey, items: [], failed: true });
      }
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [term, expanded, resultKey]);

  function visit(item: Suggestion) {
    setOpen(false);
    setSelected(-1);
    router.push(`/producto/${encodeURIComponent(item.slug)}`);
  }

  return (
    <form action="/catalogo" className="search-shell" role="search"
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <div className="search-bar">
        <Search size={20} aria-hidden="true" />
        <input type="search" name="q" role="combobox" maxLength={120} autoComplete="off"
          value={query} placeholder="Busca SSD, mouse, marcas…" aria-label="Buscar productos"
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
          aria-activedescendant={activeId}
          onFocus={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setOpen(true); setSelected(-1); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && expanded) {
              event.preventDefault();
              setOpen(false);
              setSelected(-1);
              return;
            }
            if (event.key === "Enter" && expanded && items[selected]) {
              event.preventDefault();
              visit(items[selected]);
              return;
            }
            if (!items.length || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
            event.preventDefault();
            setOpen(true);
            setSelected(index => event.key === "ArrowDown" ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1));
          }} />
        <button type="submit">Buscar</button>
      </div>
      {expanded && <div className="search-results">
        <ul id={listId} role="listbox" aria-label="Productos sugeridos">
          {items.map((item, index) => (
            <li id={`${listId}-${index}`} key={item.slug} role="option" aria-selected={selected === index}
              onPointerDown={event => event.preventDefault()} onClick={() => visit(item)}>
              <img src={item.image} alt="" width={44} height={44} />
              <span><strong>{item.name}</strong><small>{item.category}{item.sample ? " · Muestra" : ""}</small></span>
              <b>{money(item.price)}</b>
            </li>
          ))}
        </ul>
        {!items.length && <p className="search-result-message" role="status">{
          !current ? "Buscando productos…" : current.failed ? "Abre el catálogo para continuar la búsqueda." : "No encontramos coincidencias. Prueba con otro nombre o un SKU."
        }</p>}
        <button type="submit" className="search-all">
          Ver resultados en el catálogo <ArrowRight size={16} />
        </button>
      </div>}
    </form>
  );
}
