import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionAdmin } from "@/lib/security";
import { AdminLogin } from "@/components/admin/login";
import { settings } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Ingresar al panel",
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (await sessionAdmin((await cookies()).get("leytech_session")?.value))
    redirect("/admin");
  const store = await settings();
  return <AdminLogin name={store.name} logoUrl={store.logoUrl} />;
}
