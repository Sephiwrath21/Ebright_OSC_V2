# OSC integration package — Ebright Flow task progress

Drop-in for the OSC website (Next.js App Router + Tailwind): a **Task Progress
card** for the dashboard home (next to the To-Do List) and the **Task Manager
detail page**. Data comes from Ebright Flow's internal bridge
(`/api/internal/*`) — server-to-server with a shared secret, matched by the
logged-in user's **email**. No iframe, no client-side secrets, no new npm
dependencies (charts are plain SVG).

Live demo of both surfaces (inside this repo): `/osc-demo`.

## What each role sees (from the mockup sites)

| Role | Card | Task Manager page — overview donuts |
|---|---|---|
| Staff (MEMBER) | Own daily/monthly donut + "HOD assigned tasks" meter | My Status Daily · My Status Monthly · HOD Assigned Tasks, + My Tasks list |
| HOD | + "CEO assigned tasks" | HOD Daily · HOD Monthly · CEO Assigned · Department Daily · Department Monthly, + department roster (expandable per-member task lists) |
| BRANCH (branch manager) | own branch meters | Branch Status Daily · Monthly · Ad hoc Tasks (OPS/Admin-started runs), + branch roster |
| CEO | + "Assigned by me" meter | CEO Tasks (assigned by them) · all-departments Daily + Monthly donut grids |
| OPS (Operation site) | same as CEO | own Daily + Monthly + assigner streams · assign form (no org grids) |
| Superadmin (ADMIN) | same as CEO | Department\|Branch toggle → dropdown → selected entity's full Daily + Monthly detail inline (`EntityOverviewSection`) · "+ Task" in the page header — the org grids (all-departments · Branch by Region · Ad hoc by Region) render on the OSC **Home page** instead (`home-overview.tsx` via `overview-grids.tsx`, wired in `src/app/home/scoped-overview-section.tsx` — the one Home overview every role gets, scoped per role) |
| Elevated dept sites (DEPT_SITE Operation/Optimisation — `isElevatedDeptSite`) | — | department dropdown (all 6, never branches) → full Daily + Monthly detail · "+ Task" in the page header |
| Other DEPT_SITE / HOD | — | own department's full Daily + Monthly detail inline (the folded-in Department Overview page; its old route redirects to /task-manager) |

The page needs BOTH periods: call `getFlowDetail(email, "daily")` and
`getFlowDetail(email, "monthly")` and pass them as `daily`/`monthly` props.

## Install into OSC

1. **Location** — this package lives at `src/task-manager/ui/` in this repo (already copied in; no action needed).
2. **Env** (OSC `.env`):
   ```
   FLOW_INTERNAL_URL="https://flow.ebright.my"      # or http://localhost:3000 locally
   FLOW_INTERNAL_SECRET="<same value as the Flow deployment>"
   ```
   On the Flow side, set the matching `FLOW_INTERNAL_SECRET` (already in
   `.env.example` there). Unset secret = bridge returns 503.
3. **Dashboard card** — in the OSC home page (server component), alongside the
   To-Do List card:
   ```tsx
   import { getFlowOverview } from "@/task-manager/data"; // in-process data layer, lands in a later task
   import { TaskProgressCard } from "@/task-manager/ui/task-progress-card";

   const email = session.user.email; // OSC's own auth
   const [daily, monthly] = await Promise.all([
     getFlowOverview(email, "daily"),
     getFlowOverview(email, "monthly"),
   ]);
   // in the grid next to <TodoListCard />:
   <TaskProgressCard daily={daily} monthly={monthly} detailHref="/task-manager" />
   ```
4. **Task Manager page** — `app/task-manager/page.tsx` (the existing sidebar
   item's route):
   ```tsx
   import { getFlowDetail } from "@/task-manager/data"; // in-process data layer, lands in a later task
   import { TaskManagerView } from "@/task-manager/ui/task-manager-view";

   export default async function Page({ searchParams }) {
     const { period = "daily" } = await searchParams;
     const detail = await getFlowDetail(session.user.email, period);
     return (
       <TaskManagerView
         detail={detail}
         dailyHref="/task-manager?period=daily"
         monthlyHref="/task-manager?period=monthly"
       />
     );
   }
   ```
5. Wrap bridge calls in a try/catch (`FlowBridgeError`) and render a quiet
   fallback ("Task data unavailable") — the dashboard must not break if Flow is
   down. A 404 means the OSC user's email has no Flow account yet.

## Identity mapping

Users match by email (`User.email` is unique in Flow). Flow roles
(ADMIN/CEO/OPS/HOD/MEMBER) + department/branch live in Flow's user table and
decide the scoping — keep them in sync when onboarding staff. This bridge is
the interim wiring until the shared-auth work (OSC `feat/security-hardening`)
lands; swapping to shared sessions later only replaces `flow-client.ts`.

## Terminology mapping (mockups → data)

- "CEO Assigned task" / "HOD Assigned task" → streams: my tasks grouped by the
  **role of whoever started the run**.
- "Ad hoc tasks" → tasks from runs started by OPS/Admin (the `+ Assigned task`
  quick-form flows), shown as their own streams.
- Status buckets: Completed = DONE · Pending = everything open (incl. overdue/
  escalated) · N/A = skipped.
