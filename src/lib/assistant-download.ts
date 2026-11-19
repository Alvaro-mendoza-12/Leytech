import release from "../../public/asistente-release.json";

export function assistantDownloadUrl() {
  const value = process.env.LEYTECH_ASSISTANT_DOWNLOAD_URL?.trim();
  if (value === "/descargas/Leytech-Asistente-Windows-x64.exe" && !process.env.VERCEL) return value;
  return release.url;
}

export function assistantReleaseVersion() {
  return release.version;
}
