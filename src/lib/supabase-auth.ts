import { z } from "zod";
import { AppError } from "./security";

const identitySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  email_confirmed_at: z.string().min(1),
  created_at: z.string(),
});

function config(key: string | undefined) {
  const base = process.env.STORAGE_SUPABASE_URL;
  if (!base || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !key) {
    throw new AppError("El acceso con Supabase todavía no está configurado.", 503);
  }
  return { base, key };
}

async function authRequest(path: string, key: string | undefined, body?: object) {
  const { base, key: apikey } = config(key);
  try {
    return await fetch(`${base}/auth/v1${path}`, {
      method: body ? "POST" : "GET",
      headers: { apikey, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError("Supabase Auth no está disponible. Intenta de nuevo en unos minutos.", 503);
  }
}

export async function signInWithSupabase(email: string, password: string) {
  const response = await authRequest("/token?grant_type=password", process.env.SUPABASE_PUBLISHABLE_KEY, { email, password });
  if (response.status === 429) throw new AppError("Demasiados intentos. Intenta de nuevo más tarde.", 429);
  if (response.status >= 500) throw new AppError("Supabase Auth no está disponible.", 503);
  if (!response.ok) return null;
  const parsed = z.object({ user: identitySchema, expires_in: z.number().int().positive() })
    .safeParse(await response.json());
  if (!parsed.success || parsed.data.user.email.toLowerCase() !== email) return null;
  return { identity: parsed.data.user, expiresIn: Math.min(parsed.data.expires_in, 3600) };
}

export async function publicSignupDisabled() {
  const response = await authRequest("/settings", process.env.SUPABASE_PUBLISHABLE_KEY);
  if (!response.ok) throw new AppError("No pudimos verificar la configuración de Supabase Auth.", 503);
  const data = await response.json();
  return data.disable_signup === true && data.external?.anonymous !== true;
}

export async function confirmedSupabaseUser(userId: string, email: string) {
  const response = await authRequest(`/admin/users/${encodeURIComponent(userId)}`, process.env.SUPABASE_SECRET_KEY);
  if (response.status === 404) throw new AppError("No encontramos ese ID en Supabase Auth.", 404);
  if (!response.ok) throw new AppError("No pudimos consultar el usuario en Supabase Auth.", 503);
  const parsed = identitySchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.id !== userId || parsed.data.email.toLowerCase() !== email) {
    throw new AppError("El ID debe corresponder al mismo correo confirmado en Supabase Auth.");
  }
  return parsed.data;
}
