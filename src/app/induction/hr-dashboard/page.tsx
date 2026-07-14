import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Home, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import AppShell from "@/app/components/AppShell";
import { canManageInductions } from "@/app/induction/roles";
import {
  HrDashboardListCard,
  formatPrettyDate,
  relativeFromToday,
  type HrDashboardItem,
} from "@/app/induction/components/HrDashboardListCard";
import {
  getOnboarding,
  getOffboarding,
  getMcLastMonth,
  getAnnualLeaveNext2Weeks,
  getFlaggedThisMonth,
  getMia,
  todayMytIso,
} from "@/lib/hr-dashboard-stats";
import { titleCaseName } from "@/lib/text";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "HR Dashboard",
};

export default async function HrDashboardPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const actor = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const canManage = canManageInductions(actor?.role?.role_type ?? null);
  if (!canManage) redirect("/dashboards/hrms");

  const today = todayMytIso();
  const monthYyyyMm = today.slice(0, 7);
  const [onboarding, offboarding, mcRows, alRows, flaggedStaff, miaStaff] = await Promise.all([
    getOnboarding(today),
    getOffboarding(today),
    getMcLastMonth(today),
    getAnnualLeaveNext2Weeks(today),
    getFlaggedThisMonth(monthYyyyMm),
    getMia(today),
  ]);

  // ── Map to HrDashboardItem rows ────────────────────────────────────────
  // Keys include the array index to guarantee uniqueness — same employee can
  // have multiple leave rows on the same date (e.g. half-day pairs), and the
  // empNo+date alone would collide.
  const onboardingItems: HrDashboardItem[] = onboarding.items.map((s, i) => {
    const rel = s.date ? relativeFromToday(s.date) : null;
    return {
      key: `onb-${i}-${s.empNo ?? s.name}`,
      name: titleCaseName(s.name) || s.name,
      meta: [s.role, s.branch].filter(Boolean).join(" · "),
      date: s.date ? formatPrettyDate(s.date) : null,
      relative: rel?.text ?? null,
      highlight: rel?.isUpcoming === true && (rel.text === "Today" || /^in [1-9]\d*d$/.test(rel.text)),
    };
  });

  const offboardingItems: HrDashboardItem[] = offboarding.items.map((s, i) => {
    const rel = s.date ? relativeFromToday(s.date) : null;
    return {
      key: `off-${i}-${s.empNo ?? s.name}`,
      name: titleCaseName(s.name) || s.name,
      meta: [s.role, s.branch].filter(Boolean).join(" · "),
      date: s.date ? formatPrettyDate(s.date) : null,
      relative: rel?.text ?? null,
      highlight: rel?.isUpcoming === true,
    };
  });

  const alItems: HrDashboardItem[] = alRows.map((r, i) => {
    const rel = relativeFromToday(r.date);
    return {
      key: `al-${i}-${r.empNo ?? r.name}-${r.date}`,
      name: titleCaseName(r.name) || r.name,
      meta: [r.role, r.branch, "AL"].filter(Boolean).join(" · "),
      date: formatPrettyDate(r.date),
      relative: rel.text,
      highlight: rel.isUpcoming,
      statusChip: "AL",
    };
  });

  const mcItems: HrDashboardItem[] = mcRows.map((r, i) => {
    const rel = relativeFromToday(r.date);
    return {
      key: `mc-${i}-${r.empNo ?? r.name}-${r.date}`,
      name: titleCaseName(r.name) || r.name,
      meta: [r.role, r.branch, r.leaveTypeCode].filter(Boolean).join(" · "),
      date: formatPrettyDate(r.date),
      relative: rel.text,
      highlight: rel.text === "Today",
      statusChip: r.leaveTypeCode ?? "MC",
    };
  });

  const flaggedItems: HrDashboardItem[] = flaggedStaff.map((s, i) => ({
    key: `flag-${s.empNo ?? i}`,
    name: titleCaseName(s.name) || s.name,
    meta: [s.role, s.branch, s.detail].filter(Boolean).join(" · "),
    statusChip: "SL",
    highlight: true,
  }));

  const miaItems: HrDashboardItem[] = miaStaff.map((s, i) => ({
    key: `mia-${s.empNo ?? i}`,
    name: titleCaseName(s.name) || s.name,
    meta: [s.role, s.branch, s.detail].filter(Boolean).join(" · "),
    statusChip: s.detail?.includes("UL") ? "UL" : "MIA",
    highlight: true,
  }));

  // MIA splits: UL count vs missing-today count.
  const miaUlCount = miaStaff.filter((s) => s.detail?.includes("UL")).length;
  const miaMissingCount = miaStaff.filter((s) => s.detail === "Missing today").length;

  const userEmail = session.user.email;
  const userRole = actor?.role?.role_type ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <div className="min-h-full bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 pt-4 pb-12">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-5">
            <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-slate-900 font-medium">HR Dashboard</span>
          </nav>

          <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
                HR Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-600">Employee Lifecycle Data</p>
            </div>
            <Link
              href="/dashboards/hrms"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to HRMS
            </Link>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <HrDashboardListCard
              accent="emerald"
              title="Onboarding"
              windowLabel="−1 week → +6 months"
              stats={[
                { value: onboarding.ptCount, label: "PT" },
                { value: onboarding.ftCount, label: "FT" },
                { value: onboarding.intCount, label: "INT" },
                { value: onboarding.signedThisMonth, label: "Signed in" },
                { value: onboarding.startingIn2Weeks, label: "2 WK", emphasis: "primary" },
              ]}
              items={onboardingItems}
              viewAllHref="/induction/hr-dashboard/onboarding-detail"
            />
            <HrDashboardListCard
              accent="rose"
              title="Offboarding"
              windowLabel="−1 week → +2 months"
              stats={[
                { value: offboarding.in2Months, label: "2 MO" },
                { value: offboarding.in2Weeks, label: "2 WK", emphasis: "primary" },
              ]}
              items={offboardingItems}
              viewAllHref="/induction/hr-dashboard/offboarding-detail"
            />
            <HrDashboardListCard
              accent="violet"
              title="Annual Leave"
              windowLabel="today → +2 weeks"
              stats={[{ value: alRows.length, label: "Total", emphasis: "primary" }]}
              items={alItems}
              viewAllHref="/induction/hr-dashboard/annual-leave-detail"
            />
            <HrDashboardListCard
              accent="amber"
              title="MC"
              windowLabel="−1 month → today"
              stats={[{ value: mcRows.length, label: "Total", emphasis: "primary" }]}
              items={mcItems}
              viewAllHref="/induction/hr-dashboard/mc-detail"
            />
            <HrDashboardListCard
              accent="amber"
              title="Flagged"
              windowLabel="SL > 2 · this month"
              stats={[{ value: flaggedStaff.length, label: "Flagged", emphasis: "primary" }]}
              items={flaggedItems}
              viewAllHref="/induction/hr-dashboard#flagged"
              emptyText="No-one flagged this month."
            />
            <HrDashboardListCard
              accent="rose"
              title="MIA"
              windowLabel="Unpaid · −2 wks → today · + Missing today"
              stats={[
                { value: miaMissingCount, label: "Missing" },
                { value: miaUlCount, label: "UL", emphasis: "primary" },
              ]}
              items={miaItems}
              viewAllHref="/induction/hr-dashboard#mia"
              emptyText="No-one missing."
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
