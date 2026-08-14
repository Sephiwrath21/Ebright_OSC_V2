import { redirect } from "next/navigation";
import { auth } from "@/auth";
import FlowghanEmbed from "@/app/components/FlowghanEmbed";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Flowghan",
};

// Deliberately no AppShell here: the sidebar link opens this route in a new
// tab (see Sidebar.tsx's `external: true` on the Flowghan item), so this page
// is its own standalone full-screen surface rather than a page inside the
// portal chrome. FlowghanEmbed supplies its own "back to home" affordance.
export default async function FlowghanPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return <FlowghanEmbed />;
}
