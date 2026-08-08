import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";
import FlowghanEmbed from "@/app/components/FlowghanEmbed";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Flowghan",
};

export default async function FlowghanPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <FlowghanEmbed />
    </AppShell>
  );
}
