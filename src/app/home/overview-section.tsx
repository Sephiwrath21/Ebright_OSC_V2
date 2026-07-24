// Server section for the Home page: fetches the signed-in superadmin's
// org-wide Task Manager rollups and renders the overview donut grids
// (ui/home-overview.tsx). Renders NOTHING unless the account resolves to a
// Task Manager ADMIN with org data — and swallows every Task Manager error
// (database not connected, no account, bridge failure): the Home page must
// never break or nag because of Task Manager state; /task-manager is where
// those states surface as status cards.
import { getFlowDetail } from "@/task-manager/data";
import { HomeTaskOverview } from "@/task-manager/ui/home-overview";

export async function HomeOverviewSection({ email }: { email: string }) {
  try {
    const [daily, monthly] = await Promise.all([
      getFlowDetail(email, "daily"),
      getFlowDetail(email, "monthly"),
    ]);
    if (daily.me.me.role !== "ADMIN" || !daily.org) return null;
    return (
      <HomeTaskOverview
        dailyOrg={daily.org}
        monthlyOrg={monthly.org}
        adhocByRegion={daily.adhocByRegion}
        departmentOverviewHref="/task-manager/department-overview"
      />
    );
  } catch {
    return null;
  }
}
