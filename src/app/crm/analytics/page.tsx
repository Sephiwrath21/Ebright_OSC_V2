import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import CrmAnalyticsPage from "@/app/components/CrmAnalyticsPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole  = (session.user as { role?: string }).role ?? "";
  const userName  = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <CrmAnalyticsPage />
    </AppShell>
  );
}
