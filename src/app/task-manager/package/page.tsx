// /task-manager/package — placeholder (2026-08-06). Sidebar sub-item under
// Task Manager; content to be specified separately.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

export default async function TaskManagerPackagePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const su = session.user as { email: string; name?: string | null; role?: string };

  return (
    <AppShell email={su.email} role={su.role} name={su.name}>
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold">Package</h1>
        <p className="mt-2 text-sm text-gray-500">Coming soon.</p>
      </div>
    </AppShell>
  );
}
