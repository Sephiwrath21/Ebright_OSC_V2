// Server section for the Home page: fetches the signed-in superadmin's
// org-wide Task Manager rollups and renders the overview donut grids
// (ui/home-overview.tsx). Renders NOTHING unless the account resolves to a
// Task Manager ADMIN with org data — and swallows every Task Manager error
// (database not connected, no account, bridge failure): the Home page must
// never break or nag because of Task Manager state; /task-manager is where
// those states surface as status cards.
import { getFlowDetail } from "@/task-manager/data";
import { formatLocalDate } from "@/task-manager/analytics/_lib";
import { HomeTaskOverview } from "@/task-manager/ui/home-overview";

export async function HomeOverviewSection({
  email,
  dailyDate,
  monthlyDate,
  adhocDate,
}: {
  email: string;
  /** Optional YYYY-MM-DD anchors from ?date= / ?mdate= / ?adate= —
   *  independent date filters for the Daily, Monthly and Ad hoc parts of
   *  the overview (departments AND branch regions each follow their own
   *  section's anchor). Omitted = today / current month. */
  dailyDate?: string;
  monthlyDate?: string;
  adhocDate?: string;
}) {
  try {
    // Ad hoc always gets a concrete day (default today) — the payload's
    // dateless form means ALL-TIME, which the Home section no longer shows.
    const adhocAnchor = adhocDate ?? formatLocalDate(new Date());
    const [daily, monthly] = await Promise.all([
      getFlowDetail(email, "daily", dailyDate, { adhocDate: adhocAnchor }),
      getFlowDetail(email, "monthly", monthlyDate),
    ]);
    if (daily.me.me.role !== "ADMIN" || !daily.org) return null;
    return (
      <HomeTaskOverview
        dailyOrg={daily.org}
        monthlyOrg={monthly.org}
        adhocByRegion={daily.adhocByRegion}
        departmentOverviewHref="/task-manager?view=department"
        dailyDate={daily.date}
        monthlyDate={monthly.date}
        adhocDate={adhocAnchor}
        dateFilterParams={{ date: dailyDate, mdate: monthlyDate, adate: adhocDate }}
      />
    );
  } catch {
    return null;
  }
}
