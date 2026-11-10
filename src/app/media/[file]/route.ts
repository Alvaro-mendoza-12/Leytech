import { downloadObject } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(file))
    return new Response(null, { status: 404 });
  try {
    const response = await downloadObject(file);
    if (!response.ok) return new Response(null, { status: 404 });
    const type = file.endsWith(".png")
      ? "image/png"
      : file.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return new Response(response.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public,max-age=31536000,immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
