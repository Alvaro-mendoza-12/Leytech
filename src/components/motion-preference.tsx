"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

const storageKey = "leytech-motion-v1";
const changeEvent = "leytech-motion";

export function useMotionPreference() {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    function sync(event?: Event) {
      let preference: string | null = null;
      try { preference = localStorage.getItem(storageKey); } catch {}
      const full = event?.type === changeEvent ? (event as CustomEvent<boolean>).detail
        : preference === "full" || (preference !== "reduced" && !media.matches);
      document.documentElement.dataset.motion = full ? "full" : "reduced";
      setEnabledState(full);
    }
    sync();
    media.addEventListener("change", sync);
    window.addEventListener(changeEvent, sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener(changeEvent, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function setEnabled(value: boolean) {
    try { localStorage.setItem(storageKey, value ? "full" : "reduced"); } catch {}
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: value }));
  }

  return { enabled, setEnabled };
}

export function MotionToggle() {
  const { enabled, setEnabled } = useMotionPreference();
  return <button type="button" className="motion-toggle" aria-pressed={enabled}
    onClick={() => setEnabled(!enabled)}>
    <Sparkles size={15} aria-hidden="true" /> Animaciones {enabled ? "activadas" : "desactivadas"}
  </button>;
}
