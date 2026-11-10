"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export type HeroSlide = {
  id: string;
  image: string;
  name: string;
  href: string;
  label: string;
};

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [transition, setTransition] = useState<{ current: string; previous?: string; direction: number }>({
    current: slides[0].id, direction: 1,
  });
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const region = useRef<HTMLElement>(null);
  const foundIndex = slides.findIndex(slide => slide.id === transition.current);
  const index = Math.max(0, foundIndex);
  const current = slides[index];
  const previous = foundIndex >= 0 ? slides.find(slide => slide.id === transition.previous) : undefined;
  const canRotate = slides.length > 1;
  const rotating = canRotate && playing && !hovered && onScreen;
  const next = slides[(index + 1) % slides.length];
  const standby = next.id !== current.id && next.id !== previous?.id ? next : undefined;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const respectMotion = () => setPlaying(!media.matches);
    respectMotion();
    media.addEventListener("change", respectMotion);
    return () => media.removeEventListener("change", respectMotion);
  }, []);

  useEffect(() => {
    if (!region.current) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.intersectionRatio >= 0.25), { threshold: 0.25 });
    observer.observe(region.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setTransition({ current: next.id, previous: current.id, direction: 1 });
      }
    }, 4500);
    return () => window.clearInterval(timer);
  }, [current.id, next.id, rotating]);

  function move(direction: number) {
    const next = slides[(index + direction + slides.length) % slides.length];
    setPlaying(false);
    setTransition({ current: next.id, previous: current.id, direction });
  }

  return (
    <section className="hero-visual" ref={region} aria-label="Selección de Leytech"
      aria-roledescription={canRotate ? "carrusel" : undefined}
      onFocusCapture={event => {
        if (event.target.matches(":focus-visible") && !event.currentTarget.contains(event.relatedTarget)) setPlaying(false);
      }}>
      <div className={`hero-stage${transition.direction < 0 ? " backward" : ""}`} aria-hidden="true">
        {[previous, current, standby].map(slide => slide && (
          <div key={slide.id} className={`hero-slide${slide === standby ? " standby" : slide === previous ? " leaving" : previous ? " entering" : ""}`}>
            <Image src={slide.image} alt="" fill loading="eager"
              sizes="(max-width:560px) 100vw,(max-width:800px) 55vw,40vw" />
          </div>
        ))}
      </div>
      {canRotate && <div className="hero-controls" role="group" aria-label="Controles de productos">
        <button type="button" aria-label={playing ? "Pausar rotación" : "Iniciar rotación"}
          onClick={() => setPlaying(value => !value)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button type="button" aria-label="Producto anterior" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <button type="button" aria-label="Producto siguiente" onClick={() => move(1)}><ChevronRight size={18} /></button>
      </div>}
      <div className="hero-product-label" aria-live={rotating ? "off" : "polite"}
        onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}>
        <span>{current.label}</span>
        <Link href={current.href}>{current.name} <ArrowUpRight size={16} /></Link>
      </div>
    </section>
  );
}
