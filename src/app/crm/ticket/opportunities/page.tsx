import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import CrmTicketOpportunitiesPage from "@/app/components/CrmTicketOpportunitiesPage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ticket Opportunities" };

export default async function TicketOpportunitiesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole  = (session.user as { role?: string }).role ?? "";
  const userName  = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <CrmTicketOpportunitiesPage />
    </AppShell>
  );
}
