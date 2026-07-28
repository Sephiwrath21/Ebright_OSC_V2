// Server section for the department Home dashboards (Marketing/Academy/
// Operations): the signed-in account's OWN department Task Manager status —
// real Daily + Monthly donuts with drill-down, replacing the legacy
// DEMO-MODE ClickUp widget's hardcoded numbers (2026-07-28 decision).
// Fail-safe like HomeOverviewSection: any Task Manager problem (database
// not connected, no account, bridge failure) renders nothing — the Home
// page must never break because of Task Manager state.
import { getFlowDetail } from "@/task-manager/data";
import { StatusOverviewCard } from "@/task-manager/ui/bits";

export async function HomeDeptOverviewSection({ email }: { email: string }) {
  try {
    const [daily, monthly] = await Promise.all([
      getFlowDetail(email, "daily"),
      getFlowDetail(email, "monthly"),
    ]);
    if (!daily.department || !monthly.department) return null;
    return (
      <div className="flex flex-col gap-6">
        <StatusOverviewCard
          title="Daily"
          subtitle={`${daily.department.name} — today`}
          totals={daily.department.totals}
          tasks={daily.department.tasks}
        />
        <StatusOverviewCard
          title="Monthly"
          subtitle={`${monthly.department.name} — this month`}
          totals={monthly.department.totals}
          tasks={monthly.department.tasks}
        />
      </div>
    );
  } catch {
    return null;
  }
}
