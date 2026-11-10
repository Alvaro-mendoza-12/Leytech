import Link from "next/link";

export function BrandLogo({ name = "Leytech", src }: { name?: string; src?: string }) {
  return (
    <Link href="/" className="logo" aria-label={`${name}, inicio`}>
      {src ? (
        <img className="custom-logo" src={src} alt="" />
      ) : (
        <span className="official-logo">
          <img src="/images/leytech-logo.png" alt="" />
        </span>
      )}
    </Link>
  );
}
