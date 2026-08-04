import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import LeadsDashboard from "@/app/components/LeadsDashboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads Dashboard",
};

export default async function LeadDashboardPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <LeadsDashboard />
    </AppShell>
  );
}
