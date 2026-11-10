import { AppError } from "./security";
function storageConfig() {
  const base = process.env.STORAGE_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY || process.env.STORAGE_SERVICE_ROLE_KEY,
    bucket = process.env.STORAGE_BUCKET || "leytech-products";
  if (
    !base ||
    !key ||
    key.startsWith('sb_publishable_') ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) ||
    !/^[a-z0-9-]{1,100}$/.test(bucket)
  )
    throw new AppError(
      "Configura Supabase Storage privado para guardar imágenes en producción.",
      503,
    );
  return { base, key, bucket };
}
function storageHeaders(key:string):Record<string,string>{return key.startsWith('sb_secret_')?{apikey:key}:{apikey:key,Authorization:`Bearer ${key}`};}
export async function uploadObject(
  name: string,
  buffer: Buffer,
  contentType: string,
) {
  const { base, key, bucket } = storageConfig();
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${name}`, {
    method: "POST",
    headers: {
      ...storageHeaders(key),
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok)
    throw new AppError(
      "No se pudo guardar la imagen en el almacenamiento.",
      502,
    );
  return `/media/${name}`;
}
export async function downloadObject(name: string) {
  const { base, key, bucket } = storageConfig();
  return fetch(`${base}/storage/v1/object/authenticated/${bucket}/${name}`, {
    headers: storageHeaders(key),
    signal: AbortSignal.timeout(15000),
  });
}
