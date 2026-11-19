export function assistantDownloadUrl() {
  const value = process.env.LEYTECH_ASSISTANT_DOWNLOAD_URL?.trim();
  if (value === "/descargas/Leytech-Asistente-Windows-x64.exe" && !process.env.VERCEL) return value;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
