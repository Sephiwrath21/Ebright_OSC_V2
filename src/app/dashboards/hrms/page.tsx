import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import HrmsDashboard from "@/app/components/HrmsDashboard";
import { getNavAccess } from "@/app/components/navAccess.actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "HRMS",
};

export default async function HrmsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;
  const nav = await getNavAccess();

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <HrmsDashboard role={userRole} features={nav.features} privileged={nav.privileged} />
    </AppShell>
  );
}
