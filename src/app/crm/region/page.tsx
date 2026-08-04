import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import CrmRegionPage from "@/app/components/CrmRegionPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Region",
};

export default async function RegionPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole  = (session.user as { role?: string }).role ?? "";
  const userName  = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <CrmRegionPage />
    </AppShell>
  );
}
