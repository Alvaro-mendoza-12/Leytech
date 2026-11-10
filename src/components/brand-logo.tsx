import Link from "next/link";
import { officialLogo } from "@/lib/brand";

export function LogoImage({ src, alt }: { src?: string; alt: string }) {
  if (src) return <img className="custom-logo" src={src} alt={alt} />;
  return (
    <span className="official-logo">
      <img src={officialLogo} alt={alt} />
    </span>
  );
}

export function BrandLogo({ name = "Leytech", src }: { name?: string; src?: string }) {
  return (
    <Link href="/" className="logo" aria-label={`${name}, inicio`}>
      <LogoImage src={src} alt="" />
    </Link>
  );
}
