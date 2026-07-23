# OSC integration package — Ebright Flow task progress

Drop-in for the OSC website (Next.js App Router + Tailwind): a **Task Progress
card** for the dashboard home (next to the To-Do List) and the **ClickUp Tasks
detail page**. Data comes from Ebright Flow's internal bridge
(`/api/internal/*`) — server-to-server with a shared secret, matched by the
logged-in user's **email**. No iframe, no client-side secrets, no new npm
dependencies (charts are plain SVG).

Live demo of both surfaces (inside this repo): `/osc-demo`.

## What each role sees (from the mockup sites)

| Role | Card | ClickUp Tasks page — overview donuts |
|---|---|---|
| Staff (MEMBER) | Own daily/monthly donut + "HOD assigned tasks" meter | My Status Daily · My Status Monthly · HOD Assigned Tasks, + My Tasks list |
| HOD | + "CEO assigned tasks" | HOD Daily · HOD Monthly · CEO Assigned · Department Daily · Department Monthly, + department roster (expandable per-member task lists) |
| BRANCH (branch manager) | own branch meters | Branch Status Daily · Monthly · Ad hoc Tasks (OPS/Admin-started runs), + branch roster |
| CEO | + "Assigned by me" meter | CEO Tasks (assigned by them) · all-departments Daily + Monthly donut grids |
| OPS (Operation site) | same as CEO | Operation Department Status Daily + Monthly · all-branches Daily + Monthly grids · Ad hoc (NOT all departments) |
| Superadmin (ADMIN) | same as CEO | all-departments Daily + Monthly grids · Branch Status by Region A/B/C Daily + Monthly · Ad hoc |

The page needs BOTH periods: call `getFlowDetail(email, "daily")` and
`getFlowDetail(email, "monthly")` and pass them as `daily`/`monthly` props.

## Install into OSC

1. **Copy this folder** into the OSC repo (e.g. `src/lib/flow/` or keep `src/osc/`).
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
   import { getFlowOverview } from "@/osc/flow-client";
   import { TaskProgressCard } from "@/osc/task-progress-card";

   const email = session.user.email; // OSC's own auth
   const [daily, monthly] = await Promise.all([
     getFlowOverview(email, "daily"),
     getFlowOverview(email, "monthly"),
   ]);
   // in the grid next to <TodoListCard />:
   <TaskProgressCard daily={daily} monthly={monthly} detailHref="/clickup-tasks" />
   ```
4. **ClickUp Tasks page** — `app/clickup-tasks/page.tsx` (the existing sidebar
   item's route):
   ```tsx
   import { getFlowDetail } from "@/osc/flow-client";
   import { ClickUpTasksView } from "@/osc/clickup-tasks-view";

   export default async function Page({ searchParams }) {
     const { period = "daily" } = await searchParams;
     const detail = await getFlowDetail(session.user.email, period);
     return (
       <ClickUpTasksView
         detail={detail}
         dailyHref="/clickup-tasks?period=daily"
         monthlyHref="/clickup-tasks?period=monthly"
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
