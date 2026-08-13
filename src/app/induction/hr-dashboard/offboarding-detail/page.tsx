import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import { BulkAddToQueueButton } from "@/app/induction/components/BulkAddToQueueButton";
import { canManageInductions } from "@/app/induction/roles";
import { getCombinedUpcomingExits } from "@/app/induction/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Offboarding Detail",
};

export default async function OffboardingDetailPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const canManage = canManageInductions(actor?.role?.role_type ?? null);
  if (!canManage) redirect("/dashboards/hrms");

  // Match the HR dashboard window (-1 week → +2 months) so employees in their
  // final week / just-left remain visible for offboarding follow-up.
  const exits = await getCombinedUpcomingExits(60, 7);
  const highlightedUserIds = exits
    .filter(
      (e) =>
        e.source === "local" &&
        e.userId !== null &&
        e.isWithin7Days &&
        !e.hasPendingRequest &&
        e.inductionProfileStatus === null,
    )
    .map((e) => e.userId as number);

  const userEmail = session.user.email;
  const userRole = actor?.role?.role_type ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
          <header className="bg-rose-600 text-white px-4 sm:px-6 lg:px-8 py-5">
            <div className="w-full mx-auto">
              <Link
                href="/induction/hr-dashboard"
                className="inline-flex items-center gap-1 text-rose-100 text-sm hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back to Overview
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Offboarding (-1 week → +2 months) [{exits.length}]
              </h1>
              <p className="text-sm text-rose-100">Green = within 1 week</p>
            </div>
          </header>

          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">#</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Position</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Department</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">End Date</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {exits.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        No upcoming exits in the next month.
                      </td>
                    </tr>
                  ) : (
                    exits.map((e, i) => (
                      <tr
                        key={e.key}
                        className={e.isWithin7Days ? "bg-emerald-50 dark:bg-emerald-900" : "bg-white dark:bg-slate-900"}
                      >
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {e.isWithin7Days && (
                            <span className="text-emerald-600 dark:text-emerald-400 mr-1.5" aria-hidden="true">●</span>
                          )}
                          {e.fullName}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.position ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.departmentName ?? "—"}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{e.endDate}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={
                            e.source === "local"
                              ? "rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-700 dark:text-slate-300"
                              : "rounded bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-blue-700 dark:text-blue-300"
                          }>
                            {e.source === "local" ? "hrfs" : "ebrightleads"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <BulkAddToQueueButton userIds={highlightedUserIds} accent="rose" />
          </div>
      </div>
    </AppShell>
  );
}
