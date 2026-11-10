'use client';
import { useEffect,useRef,type ReactNode } from 'react';
export function ResponsiveFilters({children}:{children:ReactNode}){const ref=useRef<HTMLDetailsElement>(null);useEffect(()=>{const media=window.matchMedia('(min-width: 801px)');const update=()=>{if(ref.current)ref.current.open=media.matches;};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);return <details ref={ref}>{children}</details>;}
