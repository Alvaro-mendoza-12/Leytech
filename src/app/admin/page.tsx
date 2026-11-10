import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionAdmin } from "@/lib/security";
import { Dashboard } from "@/components/admin/dashboard";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (!(await sessionAdmin((await cookies()).get("leytech_session")?.value)))
    redirect("/admin/login");
  return <Dashboard />;
}
