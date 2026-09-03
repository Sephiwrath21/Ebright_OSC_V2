# Home — Personal Cards as Full Task Lists (My Week / My Month)

## Goal

Replace Home's personal Daily/Monthly/third-card stat cards (percentage +
dot-counts) with the same real task-list view `/task-manager`'s `myOverview`
already uses (`EntityCardOverview`), for every personal account: staff
(DEPT_MEMBER/BRANCH_MEMBER/COACH), HOD, and Branch Manager. CEO is
unaffected — its combined "My Tasks" card is a separate, deliberate design.

## Scope

- **Daily** — every role that has it gets the full "My Week" weekday-tab
  view, unchanged mechanism from `/task-manager`, just a new consumer.
- **Monthly** — every role that has it (HOD, Branch Manager, staff except
  BRANCH_MEMBER/COACH which are Daily-only) gets a NEW "My Month" tab view:
  Year + Month dropdowns (already exist as `MonthDropdown`) plus 4 tabs —
  **1-7 · 8-14 · 15-21 · 22-{month's last day}** — no combined "Full month"
  tab, mirroring My Week's own precedent (no combined "whole week" tab
  either). Home-only; `/task-manager`'s own Monthly section is untouched.
- **Third card, per role** — becomes a plain (no tabs) `EntityCardOverview`
  list instead of a stat card:
  - Staff (DEPT_MEMBER/BRANCH_MEMBER/COACH... but BRANCH_MEMBER/COACH have
    no third card at all, Daily-only): **HOD Assigned Task**, day-windowed
    by the existing `?hdate=`.
  - HOD: **CEO Assigned Task**, day-windowed by the existing `?cdate=`.
  - Branch Manager: **Ad hoc** — gains a day filter it never had before (a
    real behavior change, confirmed) via a **new `?padate=`** param.

## Architecture

### Daily — My Week, reused as-is

Identical mechanism to `/task-manager`'s `myOverview.daily.myWeek`:
`thisWeekDatesForRange(weekdayRangeOf(view), anchorDate)` (`role-views.ts`)
gives that role's own week of dates; `Promise.all` fetches each day via
`getFlowOverview(email, "daily", date, { strictWindow: true })` (the same
lightweight personal-only query, with the same `strictWindow` fix that
already solved a DB-timeout on this exact fan-out); results feed
`EntityCardOverview`'s existing `myWeek: MyWeekConfig` prop, unchanged.
`scoped-overview-section.tsx` builds this fresh per personal role branch,
keyed to that role's own `dailyDate` anchor (`daily.date`) — no new types,
no new component code for Daily itself.

### Monthly — new "My Month"

New, generalized sibling of `myWeek`:

- **Types** (`entity-card-overview.tsx`, alongside `MyWeekDay`/`MyWeekConfig`):
  ```ts
  export interface MyMonthChunk {
    label: string; // "1–7" / "22–31" etc — reuses entity-picker.tsx's chunkLabel shape
    range: string; // "1-7" — the ?mrange= value this chunk represents
    tasks: FlowTaskRow[];
  }
  export interface MyMonthConfig {
    chunks: MyMonthChunk[];
    selectedRange: string; // current ?mrange=, defaulting to the first chunk when unset
    nav: { basePath: string; extraParams?: Record<string, string> };
  }
  ```
- **New `myMonth?: MyMonthConfig` prop** on `EntityCardOverview`, rendered
  with the exact same layout `myWeek` uses (a `role="tablist"` sidebar of
  buttons — chunk label + pending count — next to a `ResizableTaskList` for
  the selected chunk), under the same `isOwnCard && personCards.length === 1`
  gate `myWeek` already uses. Only ever set by Home's Monthly SectionData;
  every `/task-manager` caller leaves it `undefined`, so nothing there
  changes.
- **Chunk boundaries**: `monthDayChunks(year, month)` in `entity-picker.tsx`
  already computes exactly these 4 ranges for `MonthRangeDropdown` — it's
  currently unexported; export it so Home can reuse the identical boundary
  logic instead of recomputing it.
- **Data layer**: `getFlowOverview` currently only accepts `{ strictWindow }`;
  `getMePayload` (which it wraps) already accepts `monthDays: { from, to }`
  internally (same option `getFlowDetail` exposes) — it's just not threaded
  through `getFlowOverview` yet. Add `monthDays?: { from: number; to: number }`
  to `getFlowOverview`'s `opts` and pass it straight through. Home then
  fetches all 4 chunks concurrently:
  ```ts
  const chunks = monthDayChunks(year, month);
  const results = await Promise.all(
    chunks.map((c) => getFlowOverview(email, "monthly", monthlyDate, { monthDays: c })),
  );
  ```
  Same lightweight personal-only query path as My Week — no risk of
  reintroducing the earlier `getFlowDetail` fan-out timeout.

### Third card — reuses already-fetched data, mostly no new queries

Home already fetches `daily` (`getFlowDetail(email, "daily", ...)`) at the
top of `HomeScopedOverviewSection`, which includes `daily.me.streamsAll`
(all-time, grouped by assigner role) and `daily.me.adhocAll` (all-time ad
hoc). The existing `streamCard` helper already day-windows `streamsAll` by
manually filtering `dueAt` against `resolveWindow("daily", anchor)` — this
is the SAME filter logic reused here, just feeding `EntityCardOverview`
(via `toSelfEntityDetail`) instead of `StatusOverviewCard`'s bucket counts.
**No new fetch for HOD Assigned or CEO Assigned** — same data, windowed the
same way, rendered differently.

Ad hoc (`daily.me.adhocAll`) gets the identical day-window-filter treatment,
newly applied (it has no day filter today) — reuses the same
`resolveWindow("daily", anchor)` + `dueAt` filter, anchored to the new
`?padate=` param instead of `?date=`. Also no new fetch — `adhocAll` is
already part of the existing `daily` payload.

### Self-entity synthesis — shared `toSelfEntityDetail`

`task-manager/page.tsx` has a private `toSelfEntityDetail(me, personal)`
that wraps the viewer's own totals/tasks into a synthetic one-member
`FlowEntityDetail` for `EntityCardOverview`. Extract it into
`src/task-manager/ui/types.ts` (alongside `flowBucketize`) as an exported
function, so both `page.tsx` and `scoped-overview-section.tsx` share one
definition instead of two copies that can drift. Behavior unchanged.

### Composing the sections per role

- **HOD / staff** (whose third card is HOD/CEO Assigned): use
  `TaskOverviewStack` directly — its `daily`/`monthly`/`hodAssigned`/
  `ceoAssigned` slots map 1:1 onto what these roles need, same component
  `/task-manager` uses for the identical shape.
- **Branch Manager**: `TaskOverviewStack` for `daily`/`monthly`, plus a
  standalone `EntityCardOverview` call (`sectionLabel="Ad hoc"`) for the
  day-windowed Ad hoc card — it doesn't fit any of `TaskOverviewStack`'s 4
  fixed slots (`hodAssigned`/`ceoAssigned` are specifically those two
  streams, not a generic 5th slot), and only Branch Manager needs it, so
  extending `TaskOverviewStack`'s shape for one caller isn't warranted.

## New URL param

`?padate=` — Branch Manager's Ad hoc day anchor (mirrors `?hdate=`/`?cdate=`
exactly: `YYYY-MM-DD`, defaults to today, independent of every other
filter). Threaded through `page.tsx` → `HomeScopedOverviewSection` the same
way `hdate`/`cdate`/`expand`/`department` already are.

## Error handling & testing

- My Week/My Month fetches use the same defensive shape already proven for
  My Week: `getFlowOverview` never throws for a personal, already-
  authenticated fetch (only auth/validation failures do, which the outer
  `try { } catch { return null }` in `scoped-overview-section.tsx` already
  covers for the whole section).
- `toSelfEntityDetail`'s extraction is a pure refactor (no behavior
  change) — no new tests needed beyond confirming both call sites still
  produce identical output (covered by existing coverage exercising
  `/task-manager`'s `myOverview`, plus manual verification on Home).
- `monthDayChunks`'s export and `getFlowOverview`'s `monthDays` passthrough
  are both small, mechanical additions to already-tested functions — no
  new dedicated tests needed; existing `MonthRangeDropdown`/`getFlowDetail`
  coverage already exercises the underlying chunk-boundary and
  `clampWindowToMonthDays` logic this reuses.
- New manual verification: for each of the 3 roles (staff/HOD/Branch
  Manager), confirm Daily's weekday tabs, Monthly's 4 range tabs, and the
  third card's day filter all render real tasks and their date
  pickers/tabs stay in sync (clicking a tab updates the URL the same way
  the section's own date picker does, and vice versa) — same two-way sync
  `myWeek` already guarantees, extended to `myMonth`.
