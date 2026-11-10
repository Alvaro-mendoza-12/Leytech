"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";

export function ProductGallery({ images, name, sample }: { images: string[]; name: string; sample: boolean }) {
  const [selection, select] = useState("");
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const index = Math.max(0, images.indexOf(selection));
  const shown = images[index];
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const titleId = useId();

  function move(offset: number) {
    select(images[(index + offset + images.length) % images.length]);
    setZoomed(false);
  }

  function changeZoom() {
    setZoomed(!zoomed);
    requestAnimationFrame(() => {
      const frame = viewport.current;
      if (frame) {
        frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
        frame.scrollTop = (frame.scrollHeight - frame.clientHeight) / 2;
      }
    });
  }

  return (
    <div className="gallery">
      <button type="button" className="gallery-main gallery-enlarge" aria-label={`Ampliar imagen de ${name}`} aria-haspopup="dialog"
        onClick={() => { setOpen(true); dialog.current?.showModal(); }}
        onPointerMove={event => {
          if (event.pointerType !== "mouse") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty("--zoom-x", `${100 * (event.clientX - bounds.left) / bounds.width}%`);
          event.currentTarget.style.setProperty("--zoom-y", `${100 * (event.clientY - bounds.top) / bounds.height}%`);
        }}>
        <Image src={shown} alt="" fill loading="eager" sizes="(max-width:800px) 100vw,45vw" />
        {sample && <span className="product-badge blue">Producto de muestra</span>}
        <span className="gallery-zoom-label"><ZoomIn size={18} /> Ampliar</span>
      </button>
      {images.length > 1 && <div className="thumbnails" role="group" aria-label="Imágenes del producto">
        {images.map((url, i) => (
          <button type="button" key={url} onClick={() => select(url)} className={shown === url ? "selected" : ""}
            aria-pressed={shown === url} aria-label={`Ver imagen ${i + 1}`}>
            <Image src={url} alt="" width={80} height={80} />
          </button>
        ))}
      </div>}
      {sample && <p className="image-note">Imagen ilustrativa del producto de muestra.</p>}

      <dialog className="gallery-dialog" ref={dialog} aria-labelledby={titleId}
        onClose={() => { setOpen(false); setZoomed(false); }}>
        <div className="gallery-dialog-bar">
          <h2 id={titleId}>{name}</h2>
          <button type="button" className="icon-button" aria-label="Cerrar imagen ampliada" onClick={() => dialog.current?.close()}>
            <X size={21} />
          </button>
        </div>
        {open && <div className="gallery-dialog-viewport" ref={viewport} tabIndex={zoomed ? 0 : undefined}
          role="region" aria-label="Imagen del producto">
          <div className={`gallery-dialog-frame${zoomed ? " zoomed" : ""}`}>
            <Image src={shown} alt={`${name}, imagen ${index + 1}`} unoptimized fill sizes="100vw" />
          </div>
        </div>}
        <div className="gallery-dialog-controls">
          {images.length > 1 && <>
            <button type="button" className="icon-button" aria-label="Imagen anterior" onClick={() => move(-1)}><ChevronLeft size={20} /></button>
            <span aria-live="polite">{index + 1} / {images.length}</span>
            <button type="button" className="icon-button" aria-label="Imagen siguiente" onClick={() => move(1)}><ChevronRight size={20} /></button>
          </>}
          <button type="button" className="btn btn-outline" onClick={changeZoom}>
            {zoomed ? <><ZoomOut size={18} /> Tamaño normal</> : <><ZoomIn size={18} /> Acercar 2×</>}
          </button>
        </div>
      </dialog>
    </div>
  );
}
