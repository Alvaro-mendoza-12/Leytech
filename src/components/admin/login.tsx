"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { BrandLogo } from "../brand-logo";
export function AdminLogin({ name, logoUrl }: { name: string; logoUrl: string }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <img src="/images/setup.jpg" alt="" />
        <BrandLogo name={name} src={logoUrl} />
        <div>
          <h1>Tu próximo gran paso empieza aquí.</h1>
          <p>
            Gestiona tus productos, atiende tus cotizaciones y haz crecer tu
            negocio.
          </p>
        </div>
        <span style={{ fontSize: 11, color: "#8da4c6" }}>
          Panel privado de administración
        </span>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <h2>Hola de nuevo.</h2>
          <p>Ingresa para administrar tu tienda.</p>
          <form onSubmit={submit}>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="Tu correo de administrador"
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Tu contraseña"
              />
            </label>
            {error && (
              <div className="error-box" role="alert" style={{ margin: 0 }}>
                {error}
              </div>
            )}
            <button className="btn btn-primary full" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={17} /> : null}
              Ingresar al panel <ArrowRight size={16} />
            </button>
          </form>
          <small>
            Usa tu acceso de Leytech o la cuenta de Supabase autorizada para este panel. Si necesitas ayuda, contacta al propietario.
          </small>
          <Link href="/" className="login-back">
            <ArrowLeft size={14} /> Volver a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}
