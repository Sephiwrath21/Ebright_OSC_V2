import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import { BulkAddToQueueButton } from "@/app/induction/components/BulkAddToQueueButton";
import HiresTableBody, {
  type HireRow,
} from "@/app/induction/components/HiresTableBody";
import { canManageInductions } from "@/app/induction/roles";
import { getCombinedUpcomingHires } from "@/app/induction/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Onboarding Detail",
};

export default async function OnboardingDetailPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const canManage = canManageInductions(actor?.role?.role_type ?? null);
  if (!canManage) redirect("/dashboards/hrms");

  // Match the HR dashboard hover window (-1 week → +6 months) so employees
  // who started in the last 7 days (still in induction) remain visible here.
  const hires = await getCombinedUpcomingHires(180, 7);
  const highlightedUserIds = hires
    .filter(
      (h) =>
        h.source === "local" &&
        h.userId !== null &&
        h.isWithin7Days &&
        !h.hasPendingRequest &&
        h.inductionProfileStatus === null,
    )
    .map((h) => h.userId as number);

  const userEmail = session.user.email;
  const userRole = actor?.role?.role_type ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50">
          <header className="bg-emerald-600 text-white px-4 sm:px-6 lg:px-8 py-5">
            <div className="w-full mx-auto">
              <Link
                href="/induction/hr-dashboard"
                className="inline-flex items-center gap-1 text-emerald-100 text-sm hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back to Overview
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Onboarding (-1 week → +6 months) [{hires.length}]
              </h1>
              <p className="text-sm text-emerald-100">Green = within 1 week</p>
            </div>
          </header>

          <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">#</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Position</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Department</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Start Date</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <HiresTableBody
                    rows={hires.map<HireRow>((h) => ({
                      key: h.key,
                      source: h.source,
                      userId: h.userId,
                      fullName: h.fullName,
                      position: h.position,
                      departmentName: h.departmentName,
                      startDate: h.startDate,
                      isWithin7Days: h.isWithin7Days,
                    }))}
                  />
                </tbody>
              </table>
            </div>

            <BulkAddToQueueButton userIds={highlightedUserIds} accent="emerald" />
          </div>
      </div>
    </AppShell>
  );
}
