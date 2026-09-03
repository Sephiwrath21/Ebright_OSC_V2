# Home — Org-Wide Collapsible Person-List Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Home's empty org-wide Task Manager section with collapsible department/branch sections that expand into the same per-person task list (`EntityCardOverview`) `/task-manager`'s own dropdown view already uses.

**Architecture:** A new `?expand=` URL param (comma-separated, kind-prefixed entries like `dept:Operations,branch:Klang`) drives which sections are expanded — same URL-navigation pattern as every other control on this page (date pickers, entity dropdown). Expanded entities get a real `getDepartmentDetail`/`getBranchDetail` fetch and render through `EntityCardOverview`; everything else stays a lightweight rollup card (name, %, dot+count row) fed by the existing org rollup query.

**Tech Stack:** Next.js App Router (Server Components + `useRouter().push` client navigation), TypeScript, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-15-home-org-wide-person-list-design.md`

---

## File Structure

- **Create** `src/task-manager/ui/expand-param.ts` — pure `parseExpandParam`/`toggleExpandEntry` functions (no React, no I/O — fully unit-testable).
- **Create** `src/task-manager/ui/expand-param.test.ts` — unit tests for the above.
- **Create** `src/task-manager/ui/overview-grids.tsx` — presentational grid components: `EntityRollupCard` (collapsed card + expand/collapse toggle), `EntityRollupGrid` (flat entity list, e.g. departments), `RegionRollupGrid` (region-grouped entity list, e.g. branches), `AdhocRollupGrid` (region-grouped, non-expandable rollup-only — Ad hoc stays out of scope for the per-person list per the spec).
- **Create** `src/task-manager/ui/home-overview.tsx` — orchestrators: `HomeDepartmentOverview` (All Departments Daily+Monthly), `HomeRegionOverview` (Branch Status by Region Daily+Monthly+Ad hoc — reused directly by CEO), `HomeTaskOverview` (composes both, for ADMIN/OPS/elevated `DEPT_SITE`).
- **Modify** `src/app/home/scoped-overview-section.tsx` — restore the `orgGrids` early-return branch and the CEO `branchRegionOverview` block, both now fetching per-expanded-entity detail and rendering the new components.
- **Modify** `src/app/home/page.tsx` — thread a new `?expand=` search param through.
- **Modify** `src/task-manager/role-views.ts` — revert the 2026-08-15 "renders nothing" doc comments on `orgGrids`/`branchRegionOverview`; restore `branchRegionOverview` to CEO's `home` array.

Both new UI files are pure composition over already-tested building blocks (`EntityCardOverview`, `getDepartmentDetail`, `getBranchDetail`, `EntityDrillModal`) — matching this codebase's existing convention (`entity-picker.tsx`, `task-overview-stack.tsx`, the original `overview-grids.tsx` never had dedicated component tests; only pure-logic modules like `types.ts`/`entity-card-grouping.ts` do). Their tasks below verify via typecheck + manual check instead of unit tests. `expand-param.ts` is pure logic, so it gets full TDD.

---

### Task 1: `expand-param.ts` — parse/toggle helpers

**Files:**
- Create: `src/task-manager/ui/expand-param.ts`
- Test: `src/task-manager/ui/expand-param.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/task-manager/ui/expand-param.test.ts
import { describe, expect, it } from "vitest";
import { parseExpandParam, toggleExpandEntry } from "./expand-param";

describe("parseExpandParam", () => {
  it("returns empty lists for undefined", () => {
    expect(parseExpandParam(undefined)).toEqual({ departments: [], branches: [] });
  });

  it("returns empty lists for an empty string", () => {
    expect(parseExpandParam("")).toEqual({ departments: [], branches: [] });
  });

  it("splits department and branch entries by prefix", () => {
    expect(parseExpandParam("dept:Operations,branch:Klang")).toEqual({
      departments: ["Operations"],
      branches: ["Klang"],
    });
  });

  it("ignores entries with no recognized prefix", () => {
    expect(parseExpandParam("Operations,dept:Academy")).toEqual({
      departments: ["Academy"],
      branches: [],
    });
  });

  it("ignores a prefix with no name", () => {
    expect(parseExpandParam("dept:,branch:Klang")).toEqual({
      departments: [],
      branches: ["Klang"],
    });
  });

  it("trims whitespace around entries", () => {
    expect(parseExpandParam(" dept:Operations , branch:Klang ")).toEqual({
      departments: ["Operations"],
      branches: ["Klang"],
    });
  });
});

describe("toggleExpandEntry", () => {
  it("adds an entry when absent, from an undefined starting value", () => {
    expect(toggleExpandEntry(undefined, "dept", "Operations")).toBe("dept:Operations");
  });

  it("removes an entry when present, leaving an empty string", () => {
    expect(toggleExpandEntry("dept:Operations", "dept", "Operations")).toBe("");
  });

  it("preserves other entries when adding", () => {
    expect(toggleExpandEntry("dept:Operations", "branch", "Klang")).toBe(
      "dept:Operations,branch:Klang",
    );
  });

  it("preserves other entries when removing", () => {
    expect(toggleExpandEntry("dept:Operations,branch:Klang", "branch", "Klang")).toBe(
      "dept:Operations",
    );
  });

  it("does not confuse a department and branch sharing a name", () => {
    const withDept = toggleExpandEntry(undefined, "dept", "Klang");
    expect(toggleExpandEntry(withDept, "branch", "Klang")).toBe("dept:Klang,branch:Klang");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/task-manager/ui/expand-param.test.ts`
Expected: FAIL — `Cannot find module './expand-param'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `expand-param.ts`**

```ts
// src/task-manager/ui/expand-param.ts
//
// Pure helpers for the ?expand= search param that drives Home's org-wide
// department/branch sections (2026-08-15) — which sections show their full
// per-person list vs. just a rollup card. Comma-separated, kind-prefixed
// entries (e.g. "dept:Operations,branch:Klang") so a department and a
// branch that happen to share a name never collide. No React, no I/O —
// safe to unit test directly and reuse from both server and client code.

export interface ParsedExpand {
  departments: string[];
  branches: string[];
}

function splitEntries(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseExpandParam(raw: string | undefined): ParsedExpand {
  const departments: string[] = [];
  const branches: string[] = [];
  for (const entry of splitEntries(raw)) {
    const sep = entry.indexOf(":");
    if (sep === -1) continue;
    const kind = entry.slice(0, sep);
    const name = entry.slice(sep + 1);
    if (!name) continue;
    if (kind === "dept") departments.push(name);
    else if (kind === "branch") branches.push(name);
  }
  return { departments, branches };
}

/** Toggles one entity in the raw ?expand= value — adds it if absent,
 *  removes it if present. Returns "" (never "undefined" or a lone comma)
 *  when nothing is left expanded, so the caller can omit the param
 *  entirely from the URL. */
export function toggleExpandEntry(
  raw: string | undefined,
  kind: "dept" | "branch",
  name: string,
): string {
  const entry = `${kind}:${name}`;
  const current = splitEntries(raw);
  const next = current.includes(entry)
    ? current.filter((e) => e !== entry)
    : [...current, entry];
  return next.join(",");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/task-manager/ui/expand-param.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/ui/expand-param.ts src/task-manager/ui/expand-param.test.ts
git commit -m "feat(task-manager): add ?expand= parse/toggle helpers for Home org sections"
```

---

### Task 2: `overview-grids.tsx` — rollup card + expand/collapse grids

**Files:**
- Create: `src/task-manager/ui/overview-grids.tsx`

- [ ] **Step 1: Implement the file**

```tsx
"use client";

// Org-wide overview grids for Home's Task Manager section (2026-08-15
// rebuild — see docs/superpowers/specs/2026-08-15-home-org-wide-person-
// list-design.md). Every department/branch starts as a lightweight rollup
// card (name, %, dot+count row — cheap, fed by the existing org rollup
// query); clicking it adds/removes the entity from the page's ?expand=
// param, which the SERVER caller (scoped-overview-section.tsx) reads to
// decide which entities to fetch full per-person detail for. Ad hoc stays
// rollup-only (see AdhocRollupGrid) — no per-person data source exists
// for it yet (spec's explicit scope decision).

import * as React from "react";
import { useRouter } from "next/navigation";
import type { FlowDrillTask, FlowEntityRollup } from "./types";
import { flowCompletionPct } from "./types";
import { BUCKET_META, EntityDrillModal, SectionCard, type BucketKey } from "./bits";
import { toggleExpandEntry } from "./expand-param";

const EMPTY_DRILL_TASKS: Record<BucketKey, FlowDrillTask[]> = {
  completed: [],
  pending: [],
  na: [],
};

/** One collapsed-or-expanded rollup card. The name row is itself the
 *  expand/collapse toggle (a chevron + click anywhere on the name), navigating
 *  with an updated ?expand= — same client-push navigation pattern as
 *  DailyDatePicker/EntityPicker. Bucket-count buttons still open the drill
 *  modal, unrelated to expand/collapse. */
function EntityRollupCard({
  entity,
  kind,
  expanded,
  expandParam,
  basePath,
  extraParams,
}: {
  entity: FlowEntityRollup;
  kind: "dept" | "branch";
  expanded: boolean;
  expandParam?: string;
  basePath: string;
  extraParams: Record<string, string>;
}) {
  const router = useRouter();
  const [drill, setDrill] = React.useState<"completed" | "pending" | "na" | null>(null);
  const drillable = Boolean(entity.tasks);

  const toggle = () => {
    const nextExpand = toggleExpandEntry(expandParam, kind, entity.name);
    const qs = new URLSearchParams({ ...extraParams, ...(nextExpand ? { expand: nextExpand } : {}) });
    router.push(`${basePath}?${qs.toString()}`);
  };

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 shadow-sm dark:border-slate-800">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-center gap-1.5 truncate text-center text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400"
      >
        <span className={`text-[10px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        {entity.name}
      </button>
      <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{flowCompletionPct(entity)}%</span>
      <div className="flex gap-3 text-xs text-gray-500 dark:text-slate-400">
        {BUCKET_META.map((b) =>
          drillable ? (
            <button
              key={b.key}
              type="button"
              onClick={() => setDrill(b.key)}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <span className={`size-2 rounded-full ${b.dot}`} />
              {entity[b.key]}
            </button>
          ) : (
            <span key={b.key} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${b.dot}`} />
              {entity[b.key]}
            </span>
          ),
        )}
      </div>
      {drill && (
        <EntityDrillModal
          name={entity.name}
          tasks={entity.tasks ?? EMPTY_DRILL_TASKS}
          bucketKey={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

/** Collapsed entities render in a shared grid (unchanged look from before);
 *  expanded entities render below as full-width blocks — the rollup card
 *  stays visible above each one's per-person list as the collapse
 *  affordance. Shared by EntityRollupGrid (flat) and RegionRollupGrid
 *  (called once per region). */
function EntityRollupList({
  entities,
  kind,
  expandedNames,
  expandedContent,
  expandParam,
  basePath,
  extraParams,
}: {
  entities: FlowEntityRollup[];
  kind: "dept" | "branch";
  expandedNames: Set<string>;
  expandedContent: Record<string, React.ReactNode>;
  expandParam?: string;
  basePath: string;
  extraParams: Record<string, string>;
}) {
  const collapsed = entities.filter((e) => !expandedNames.has(e.name));
  const expanded = entities.filter((e) => expandedNames.has(e.name));
  return (
    <div className="flex flex-col gap-5">
      {collapsed.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {collapsed.map((e) => (
            <EntityRollupCard
              key={e.name}
              entity={e}
              kind={kind}
              expanded={false}
              expandParam={expandParam}
              basePath={basePath}
              extraParams={extraParams}
            />
          ))}
        </div>
      )}
      {expanded.map((e) => (
        <div key={e.name} className="rounded-xl border border-gray-100 p-4 shadow-sm dark:border-slate-800">
          <EntityRollupCard
            entity={e}
            kind={kind}
            expanded
            expandParam={expandParam}
            basePath={basePath}
            extraParams={extraParams}
          />
          <div className="mt-4">{expandedContent[e.name]}</div>
        </div>
      ))}
    </div>
  );
}

export function EntityRollupGrid({
  title,
  entities,
  kind,
  expandedNames,
  expandedContent,
  expandParam,
  basePath,
  extraParams,
  action,
}: {
  title: string;
  entities: FlowEntityRollup[];
  kind: "dept" | "branch";
  expandedNames: Set<string>;
  /** Pre-rendered detail content for each EXPANDED entity, keyed by name —
   *  built server-side by the caller (already has that entity's fetched
   *  detail); a Client Component can't receive a render-prop function from
   *  its Server Component parent, only serializable ReactNode. */
  expandedContent: Record<string, React.ReactNode>;
  expandParam?: string;
  basePath: string;
  extraParams: Record<string, string>;
  action?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} action={action}>
      {entities.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity.</p>
      ) : (
        <EntityRollupList
          entities={entities}
          kind={kind}
          expandedNames={expandedNames}
          expandedContent={expandedContent}
          expandParam={expandParam}
          basePath={basePath}
          extraParams={extraParams}
        />
      )}
    </SectionCard>
  );
}

export function RegionRollupGrid({
  title,
  regions,
  expandedNames,
  expandedContent,
  expandParam,
  basePath,
  extraParams,
  action,
}: {
  title: string;
  regions: { name: string; branches: FlowEntityRollup[] }[];
  expandedNames: Set<string>;
  expandedContent: Record<string, React.ReactNode>;
  expandParam?: string;
  basePath: string;
  extraParams: Record<string, string>;
  action?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} action={action}>
      {regions.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity.</p>
      ) : (
        regions.map((region) => (
          <div key={region.name} className="mb-5 last:mb-0">
            <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-300">{region.name}</p>
            <EntityRollupList
              entities={region.branches}
              kind="branch"
              expandedNames={expandedNames}
              expandedContent={expandedContent}
              expandParam={expandParam}
              basePath={basePath}
              extraParams={extraParams}
            />
          </div>
        ))
      )}
    </SectionCard>
  );
}

/** Ad hoc's rollup card, unchanged from before the 2026-08-15 removal
 *  (just the donut swapped for text stats already) — no expand/collapse,
 *  since no per-person ad hoc data source exists yet (spec's explicit
 *  scope decision). Plain name, not a button. */
function AdhocEntityCard({ entity }: { entity: FlowEntityRollup }) {
  const [drill, setDrill] = React.useState<"completed" | "pending" | "na" | null>(null);
  const drillable = Boolean(entity.tasks);
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 shadow-sm dark:border-slate-800">
      <p className="w-full truncate text-center text-sm font-semibold text-gray-900 dark:text-slate-100">
        {entity.name}
      </p>
      <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{flowCompletionPct(entity)}%</span>
      <div className="flex gap-3 text-xs text-gray-500 dark:text-slate-400">
        {BUCKET_META.map((b) =>
          drillable ? (
            <button
              key={b.key}
              type="button"
              onClick={() => setDrill(b.key)}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <span className={`size-2 rounded-full ${b.dot}`} />
              {entity[b.key]}
            </button>
          ) : (
            <span key={b.key} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${b.dot}`} />
              {entity[b.key]}
            </span>
          ),
        )}
      </div>
      {drill && (
        <EntityDrillModal
          name={entity.name}
          tasks={entity.tasks ?? EMPTY_DRILL_TASKS}
          bucketKey={drill}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

export function AdhocRollupGrid({
  title,
  regions,
  action,
}: {
  title: string;
  regions: { name: string; branches: FlowEntityRollup[] }[];
  action?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} action={action}>
      {regions.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity.</p>
      ) : (
        regions.map((region) => (
          <div key={region.name} className="mb-5 last:mb-0">
            <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-slate-300">{region.name}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {region.branches.map((b) => (
                <AdhocEntityCard key={b.name} entity={b} />
              ))}
            </div>
          </div>
        ))
      )}
    </SectionCard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors (`src/app/api/branch/dashboard/route.ts` ×2, `src/app/components/ClickUpPieChart.tsx` ×1) — no new errors from `overview-grids.tsx`. It has no callers yet, so this only checks the file compiles in isolation.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/overview-grids.tsx
git commit -m "feat(task-manager): add expandable rollup grid components for Home"
```

---

### Task 3: `home-overview.tsx` — department + region orchestrators

**Files:**
- Create: `src/task-manager/ui/home-overview.tsx`

- [ ] **Step 1: Implement the file**

```tsx
// Org-wide Task Manager overview, rendered on the OSC HOME page (2026-08-15
// rebuild — see docs/superpowers/specs/2026-08-15-home-org-wide-person-
// list-design.md). Every department/branch is a collapsible section: a
// lightweight rollup card by default, expanding (via ?expand=) into the
// same per-person EntityCardOverview list /task-manager's own dropdown
// view uses. HomeDepartmentOverview and HomeRegionOverview are exported
// separately because ADMIN/OPS/elevated DEPT_SITE (HomeTaskOverview) get
// BOTH, while the CEO's own dashboard (scoped-overview-section.tsx) gets
// ONLY HomeRegionOverview, appended below their draggable department
// dashboards.

import type { ReactNode } from "react";
import type {
  ActionResult,
  FlowCategoryOption,
  FlowDetailResponse,
  FlowEntityDetail,
  ProofRemoveHandler,
  ProofUploadHandler,
} from "./types";
import { PageSectionHeading } from "./bits";
import { DailyDatePicker, MonthDropdown, MonthRangeDropdown } from "./entity-picker";
import { EntityCardOverview } from "./entity-card-overview";
import { AdhocRollupGrid, EntityRollupGrid, RegionRollupGrid } from "./overview-grids";

interface EntityActions {
  complete?: (runBlockId: string) => Promise<ActionResult>;
  skip?: (runBlockId: string) => Promise<ActionResult>;
  reopen?: (runBlockId: string) => Promise<ActionResult>;
  uploadProof?: ProofUploadHandler;
  removeProof?: ProofRemoveHandler;
}

/** One entity's fetched Daily/Monthly detail — only built for entities the
 *  caller has already expanded (parsed from ?expand= by the caller). */
export interface ExpandedEntityDetail {
  daily?: FlowEntityDetail;
  monthly?: FlowEntityDetail;
}

function buildExpandedContent(
  details: Record<string, ExpandedEntityDetail>,
  period: "daily" | "monthly",
  categories: FlowCategoryOption[],
  myUserId: string,
  dateControl: ReactNode,
  actions?: EntityActions,
): Record<string, ReactNode> {
  const out: Record<string, ReactNode> = {};
  for (const [name, detail] of Object.entries(details)) {
    const entity = period === "daily" ? detail.daily : detail.monthly;
    if (!entity) continue;
    out[name] = (
      <EntityCardOverview
        sectionLabel={period === "daily" ? "Daily" : "Monthly"}
        entityName=""
        entity={entity}
        categories={categories}
        myUserId={myUserId}
        dateControl={dateControl}
        showViewToggle
        defaultOnlyMe={false}
        onComplete={actions?.complete}
        onSkip={actions?.skip}
        onReopen={actions?.reopen}
        onUploadProof={actions?.uploadProof}
        onRemoveProof={actions?.removeProof}
      />
    );
  }
  return out;
}

export function HomeDepartmentOverview({
  dailyOrg,
  monthlyOrg,
  expandedDepartmentDetails,
  expandParam,
  categories,
  myUserId,
  dailyPicker,
  monthlyPicker,
  extraParams,
  actions,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  expandedDepartmentDetails: Record<string, ExpandedEntityDetail>;
  expandParam?: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  dailyPicker: ReactNode;
  monthlyPicker: ReactNode;
  extraParams: Record<string, string>;
  actions?: EntityActions;
}) {
  const expandedNames = new Set(Object.keys(expandedDepartmentDetails));
  return (
    <>
      <EntityRollupGrid
        title="All Departments — Daily"
        entities={dailyOrg.departments}
        kind="dept"
        expandedNames={expandedNames}
        expandedContent={buildExpandedContent(
          expandedDepartmentDetails,
          "daily",
          categories,
          myUserId,
          dailyPicker,
          actions,
        )}
        expandParam={expandParam}
        basePath="/home"
        extraParams={extraParams}
      />
      {monthlyOrg && (
        <EntityRollupGrid
          title="All Departments — Monthly"
          entities={monthlyOrg.departments}
          kind="dept"
          expandedNames={expandedNames}
          expandedContent={buildExpandedContent(
            expandedDepartmentDetails,
            "monthly",
            categories,
            myUserId,
            monthlyPicker,
            actions,
          )}
          expandParam={expandParam}
          basePath="/home"
          extraParams={extraParams}
        />
      )}
    </>
  );
}

export function HomeRegionOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  expandedBranchDetails,
  expandParam,
  categories,
  myUserId,
  dailyPicker,
  monthlyPicker,
  adhocPicker,
  extraParams,
  actions,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  adhocByRegion?: FlowDetailResponse["adhocByRegion"];
  expandedBranchDetails: Record<string, ExpandedEntityDetail>;
  expandParam?: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  dailyPicker: ReactNode;
  monthlyPicker: ReactNode;
  adhocPicker?: ReactNode;
  extraParams: Record<string, string>;
  actions?: EntityActions;
}) {
  const expandedNames = new Set(Object.keys(expandedBranchDetails));
  return (
    <>
      <RegionRollupGrid
        title="Branch Status by Region — Daily"
        regions={dailyOrg.regions}
        expandedNames={expandedNames}
        expandedContent={buildExpandedContent(
          expandedBranchDetails,
          "daily",
          categories,
          myUserId,
          dailyPicker,
          actions,
        )}
        expandParam={expandParam}
        basePath="/home"
        extraParams={extraParams}
      />
      {monthlyOrg && (
        <RegionRollupGrid
          title="Branch Status by Region — Monthly (Manager)"
          regions={monthlyOrg.regionsByRole.find((v) => v.role === "Manager")?.regions ?? []}
          expandedNames={expandedNames}
          expandedContent={buildExpandedContent(
            expandedBranchDetails,
            "monthly",
            categories,
            myUserId,
            monthlyPicker,
            actions,
          )}
          expandParam={expandParam}
          basePath="/home"
          extraParams={extraParams}
        />
      )}
      {adhocByRegion && (
        <AdhocRollupGrid
          title="Ad hoc Tasks by Region (Manager)"
          regions={adhocByRegion.regions}
          action={adhocPicker}
        />
      )}
    </>
  );
}

export function HomeTaskOverview({
  dailyOrg,
  monthlyOrg,
  adhocByRegion,
  dailyDate,
  monthlyDate,
  adhocDate,
  dateFilterParams,
  expandedDepartmentDetails,
  expandedBranchDetails,
  expandParam,
  categories,
  myUserId,
  actions,
}: {
  dailyOrg: NonNullable<FlowDetailResponse["org"]>;
  monthlyOrg?: FlowDetailResponse["org"];
  adhocByRegion?: FlowDetailResponse["adhocByRegion"];
  dailyDate?: string;
  monthlyDate?: string;
  adhocDate?: string;
  dateFilterParams?: { date?: string; mdate?: string; mrange?: string; adate?: string };
  expandedDepartmentDetails: Record<string, ExpandedEntityDetail>;
  expandedBranchDetails: Record<string, ExpandedEntityDetail>;
  expandParam?: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  actions?: EntityActions;
}) {
  const raw = dateFilterParams ?? {};
  const carry = (...except: string[]) =>
    Object.fromEntries(
      Object.entries(raw).filter(([k, v]) => v && !except.includes(k)),
    ) as Record<string, string>;

  const dailyPicker = dailyDate && (
    <DailyDatePicker key="org-daily-picker" value={dailyDate} basePath="/home" extraParams={carry("date")} />
  );
  const monthlyPicker = monthlyDate && (
    <div key="org-monthly-controls" className="flex items-center gap-1.5">
      <MonthDropdown value={monthlyDate} basePath="/home" extraParams={carry("mdate", "mrange")} />
      <MonthRangeDropdown
        value={monthlyDate}
        range={raw.mrange}
        basePath="/home"
        extraParams={carry("mdate", "mrange")}
      />
    </div>
  );
  const adhocPicker = adhocDate && (
    <DailyDatePicker key="org-adhoc-picker" value={adhocDate} basePath="/home" param="adate" extraParams={carry("adate")} />
  );
  // Expand-toggle links carry every current date filter unchanged — no
  // exclusions, since "expand" isn't itself one of the date params in `raw`.
  const expandExtraParams = carry();

  return (
    <div className="flex flex-col gap-5">
      <PageSectionHeading>Task Manager — Overview</PageSectionHeading>
      <HomeDepartmentOverview
        dailyOrg={dailyOrg}
        monthlyOrg={monthlyOrg}
        expandedDepartmentDetails={expandedDepartmentDetails}
        expandParam={expandParam}
        categories={categories}
        myUserId={myUserId}
        dailyPicker={dailyPicker}
        monthlyPicker={monthlyPicker}
        extraParams={expandExtraParams}
        actions={actions}
      />
      <HomeRegionOverview
        dailyOrg={dailyOrg}
        monthlyOrg={monthlyOrg}
        adhocByRegion={adhocByRegion}
        expandedBranchDetails={expandedBranchDetails}
        expandParam={expandParam}
        categories={categories}
        myUserId={myUserId}
        dailyPicker={dailyPicker}
        monthlyPicker={monthlyPicker}
        adhocPicker={adhocPicker}
        extraParams={expandExtraParams}
        actions={actions}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors — no new errors. Still no callers, so this only checks the file compiles in isolation.

- [ ] **Step 3: Commit**

```bash
git add src/task-manager/ui/home-overview.tsx
git commit -m "feat(task-manager): add HomeTaskOverview/HomeRegionOverview orchestrators"
```

---

### Task 4: Wire `scoped-overview-section.tsx` — ADMIN/OPS/elevated `DEPT_SITE`

**Files:**
- Modify: `src/app/home/scoped-overview-section.tsx`

- [ ] **Step 1: Add the new imports and the `expand` param**

In the import block, add `getBranchDetail` and `listActiveTaskCategories` to the existing `@/task-manager/data` import, and add the two new UI imports:

```ts
import {
  getBranchDetail,
  getCeoDashboardConfig,
  getDepartmentDetail,
  getFlowDetail,
  listActiveTaskCategories,
  saveCeoDashboardConfig,
  FlowBridgeError,
} from "@/task-manager/data";
```

```ts
import { parseExpandParam } from "@/task-manager/ui/expand-param";
import { HomeRegionOverview, HomeTaskOverview } from "@/task-manager/ui/home-overview";
```

Add `expand` to the function's parameter list and JSDoc (alongside the existing date params):

```ts
export async function HomeScopedOverviewSection({
  email,
  dailyDate,
  monthlyDate,
  monthlyRange,
  adhocDate,
  hodDate,
  ceoDate,
  expand,
  actions,
}: {
  email: string;
  dailyDate?: string;
  monthlyDate?: string;
  monthlyRange?: { from: number; to: number };
  adhocDate?: string;
  hodDate?: string;
  ceoDate?: string;
  /** Raw ?expand= value (2026-08-15) — which org-wide department/branch
   *  sections show their full per-person list instead of a rollup card.
   *  See expand-param.ts. */
  expand?: string;
  actions?: {
```
(the rest of the `actions` block is unchanged)

- [ ] **Step 2: Restore `adhocPicker` at the top of the function**

The CEO branch (Task 5) needs it too. Restore it right after the existing `monthlyPicker` const (before the `// ALL role gates below...` comment):

```tsx
    const adhocPicker = (
      <DailyDatePicker
        key="home-adhoc-picker"
        value={adhocAnchor}
        basePath="/home"
        param="adate"
        extraParams={carry("adate")}
      />
    );

    // ALL role gates below read role-views.ts (the single source of truth,
```

- [ ] **Step 3: Rebuild the `orgGrids` branch**

Replace:

```tsx
    // Org roles (ADMIN/OPS/elevated DEPT_SITE): 2026-08-15 — nothing renders
    // here anymore. Both grids this branch used to show ("All Departments"
    // and "Branch Status by Region") were removed from Home per request;
    // the same data is still viewable in full on the Department Overview /
    // Task Manager pages.
    if (daily.org && shows(view, "home", "orgGrids")) {
      return null;
    }
```

with:

```tsx
    // Org roles (ADMIN/OPS/elevated DEPT_SITE): 2026-08-15 rebuild — every
    // department/branch is a collapsible rollup card; only names present in
    // ?expand= get a real getDepartmentDetail/getBranchDetail fetch (see
    // docs/superpowers/specs/2026-08-15-home-org-wide-person-list-design.md).
    if (daily.org && shows(view, "home", "orgGrids")) {
      const { departments: expandedDepts, branches: expandedBranches } = parseExpandParam(expand);
      const categories = await listActiveTaskCategories(email).catch(() => []);
      const [expandedDepartmentDetails, expandedBranchDetails] = await Promise.all([
        Promise.all(
          expandedDepts.map(async (name) => {
            const [d, m] = await Promise.all([
              getDepartmentDetail(email, name, "daily", dailyDate).catch(() => null),
              getDepartmentDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.department, monthly: m?.department }] as const;
          }),
        ),
        Promise.all(
          expandedBranches.map(async (name) => {
            const [d, m] = await Promise.all([
              getBranchDetail(email, name, "daily", dailyDate).catch(() => null),
              getBranchDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.branch, monthly: m?.branch }] as const;
          }),
        ),
      ]).then(([d, b]) => [Object.fromEntries(d), Object.fromEntries(b)] as const);
      return (
        <HomeTaskOverview
          dailyOrg={daily.org}
          monthlyOrg={monthly.org}
          adhocByRegion={daily.adhocByRegion}
          dailyDate={daily.date}
          monthlyDate={monthly.date}
          adhocDate={adhocAnchor}
          dateFilterParams={raw}
          expandedDepartmentDetails={expandedDepartmentDetails}
          expandedBranchDetails={expandedBranchDetails}
          expandParam={expand}
          categories={categories}
          myUserId={daily.me.me.userId}
          actions={
            actions && {
              complete: actions.complete,
              skip: actions.skip,
              reopen: actions.reopen,
              uploadProof: actions.uploadProof,
              removeProof: actions.removeProof,
            }
          }
        />
      );
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/home/scoped-overview-section.tsx
git commit -m "feat(task-manager): restore Home's org-wide overview as collapsible sections"
```

---

### Task 5: Wire `scoped-overview-section.tsx` — CEO's `branchRegionOverview`

**Files:**
- Modify: `src/app/home/scoped-overview-section.tsx`

- [ ] **Step 1: Restore the `branchRegionOverview` block**

Insert this right before the `// MEMBER — which cards render is decided ENTIRELY by role-views.ts:` comment (i.e. right after the `ceoDashboards` block closes):

```tsx
    // branchRegionOverview (2026-08-01, rebuilt 2026-08-15): Branch Status
    // by Region — Daily/Monthly/Ad hoc, the SAME collapsible sections
    // ADMIN/OPS/elevated sites see via orgGrids, appended below the CEO's
    // draggable department dashboards.
    let branchRegionOverview: ReactNode = null;
    if (shows(view, "home", "branchRegionOverview") && daily.org) {
      const { branches: expandedBranches } = parseExpandParam(expand);
      const categories = await listActiveTaskCategories(email).catch(() => []);
      const expandedBranchDetails = Object.fromEntries(
        await Promise.all(
          expandedBranches.map(async (name) => {
            const [d, m] = await Promise.all([
              getBranchDetail(email, name, "daily", dailyDate).catch(() => null),
              getBranchDetail(email, name, "monthly", monthlyDate).catch(() => null),
            ]);
            return [name, { daily: d?.branch, monthly: m?.branch }] as const;
          }),
        ),
      );
      branchRegionOverview = (
        <HomeRegionOverview
          dailyOrg={daily.org}
          monthlyOrg={monthly.org}
          adhocByRegion={daily.adhocByRegion}
          expandedBranchDetails={expandedBranchDetails}
          expandParam={expand}
          categories={categories}
          myUserId={daily.me.me.userId}
          dailyPicker={dailyPicker}
          monthlyPicker={monthlyPicker}
          adhocPicker={adhocPicker}
          extraParams={carry()}
          actions={
            actions && {
              complete: actions.complete,
              skip: actions.skip,
              reopen: actions.reopen,
              uploadProof: actions.uploadProof,
              removeProof: actions.removeProof,
            }
          }
        />
      );
    }
```

- [ ] **Step 2: Render it in the CEO's return block**

Change:

```tsx
        {ceoDashboards}
      </div>
    );
```

to:

```tsx
        {ceoDashboards}
        {branchRegionOverview}
      </div>
    );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/home/scoped-overview-section.tsx
git commit -m "feat(task-manager): restore CEO's Branch Status by Region on Home"
```

---

### Task 6: Thread `?expand=` through `src/app/home/page.tsx`

**Files:**
- Modify: `src/app/home/page.tsx`

- [ ] **Step 1: Add `expand` to `searchParams`**

Change:

```ts
  searchParams: Promise<{
    date?: string;
    mdate?: string;
    mrange?: string;
    adate?: string;
    hdate?: string;
    cdate?: string;
  }>;
```

to:

```ts
  searchParams: Promise<{
    date?: string;
    mdate?: string;
    mrange?: string;
    adate?: string;
    hdate?: string;
    cdate?: string;
    /** Which org-wide department/branch sections are expanded (2026-08-15) —
     *  see expand-param.ts. Passed through verbatim; validated there, not
     *  here (unlike the date params, it has no fixed format to check). */
    expand?: string;
  }>;
```

- [ ] **Step 2: Pass it through**

Change:

```ts
  const ceoDate = sp.cdate && DATE_PARAM_RE.test(sp.cdate) ? sp.cdate : undefined;
```

Add right after it:

```ts
  const ceoDate = sp.cdate && DATE_PARAM_RE.test(sp.cdate) ? sp.cdate : undefined;
  const expand = sp.expand;
```

Change the `<HomeScopedOverviewSection>` call:

```tsx
      <HomeScopedOverviewSection
        email={userEmail}
        dailyDate={dailyDate}
        monthlyDate={monthlyDate}
        monthlyRange={monthlyRange}
        adhocDate={adhocDate}
        hodDate={hodDate}
        ceoDate={ceoDate}
        actions={{
```

to:

```tsx
      <HomeScopedOverviewSection
        email={userEmail}
        dailyDate={dailyDate}
        monthlyDate={monthlyDate}
        monthlyRange={monthlyRange}
        adhocDate={adhocDate}
        hodDate={hodDate}
        ceoDate={ceoDate}
        expand={expand}
        actions={{
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat(task-manager): thread ?expand= through Home's page component"
```

---

### Task 7: Revert `role-views.ts` doc comments, restore CEO's `branchRegionOverview`

**Files:**
- Modify: `src/task-manager/role-views.ts`

- [ ] **Step 1: Revert `orgGrids`'s doc comment**

Change:

```ts
  | "orgGrids" // 2026-08-15: renders nothing on Home (the all-departments +
  // branch-regions donut grids it used to gate were removed entirely per
  // request); the key is retained purely as an org-role marker so the Home
  // section still exits early for ADMIN/OPS/elevated DEPT_SITE without
  // falling through to the MEMBER-shaped rendering below it
```

to:

```ts
  | "orgGrids" // all-departments + branch-regions (+ ad hoc regions)
  // collapsible sections (rollup card by default, expands into a
  // per-person list — 2026-08-15 rebuild)
```

- [ ] **Step 2: Revert `branchRegionOverview`'s doc comment**

Change:

```ts
  | "branchRegionOverview"; // no longer used in any home/taskManager array as of 2026-08-15 (Branch Status by Region grid removed from Home); retained pending a cleanup task
```

to:

```ts
  | "branchRegionOverview"; // Home-only: Branch Status by Region — Daily/Monthly/Ad hoc
```

- [ ] **Step 3: Restore CEO's `branchRegionOverview` entry and comment**

Change:

```ts
  // 2026-08-15: the Branch Status by Region donut grid (branchRegionOverview,
  // added 2026-08-01) was removed from Home entirely per request, alongside
  // the equivalent ADMIN/OPS orgGrids donut grids.
  CEO: {
    home: ["ceoCombinedList", "ceoKanban"],
```

to:

```ts
  // branchRegionOverview (2026-08-01, rebuilt 2026-08-15): Branch Status by
  // Region — Daily/Monthly/Ad hoc, the same collapsible sections ADMIN/OPS
  // see via orgGrids — appended below the draggable department dashboards.
  // Home only; the CEO's Task Manager page keeps entityDropdowns for branch
  // drill-down instead.
  CEO: {
    home: ["ceoCombinedList", "ceoKanban", "branchRegionOverview"],
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 5: Commit**

```bash
git add src/task-manager/role-views.ts
git commit -m "docs(task-manager): revert stale comments now that orgGrids/branchRegionOverview render again"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: same baseline as before this feature — 328/329 passing, the 1 known pre-existing failure (`src/app/components/Sidebar.test.ts`, Flowghan href) unrelated to this change. Plus the 11 new `expand-param.test.ts` tests passing (339/340 total).

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: only the 3 known pre-existing baseline errors.

- [ ] **Step 3: Restart the dev server and manually verify**

```bash
# find and kill whatever's on :3000, clear the Turbopack cache, restart
netstat -ano | grep ":3000" | grep LISTENING
taskkill //PID <pid> //F
rm -rf .next
npm run dev
```

Then, logged in as an ADMIN/OPS account (e.g. `od@ebright.my`):
- `/home` shows "All Departments — Daily", "All Departments — Monthly", "Branch Status by Region — Daily", "Branch Status by Region — Monthly (Manager)", and "Ad hoc Tasks by Region (Manager)" again, all rollup cards (no donuts).
- Click a department's rollup card (e.g. "Operations") — it expands into a "Operations" per-person Daily list (`EntityCardOverview`, Sort: Person by default), URL gains `?expand=dept:Operations`.
- Click it again — collapses back to the rollup card, `?expand=` param clears.
- Expand a department AND a branch at once — URL shows `?expand=dept:Operations,branch:Klang`, both stay expanded simultaneously.
- Change the Daily date picker while a department is expanded — the expanded list re-fetches for the new date (still expanded).
- Logged in as the CEO — "Branch Status by Region" renders below the draggable department dashboards, same expand behavior.
- Logged in as a regular staff/HOD account — Home is unchanged (still the simple stat cards, no regression).

---

## Self-Review

**Spec coverage:**
- Scope (org-wide accounts only, individual accounts untouched) — Task 4/5 only touch the `orgGrids`/`branchRegionOverview` branches; `personalPair` etc. untouched. ✅
- All Departments + Branch Status by Region as collapsible per-department/per-branch sections — Tasks 2–3. ✅
- Ad hoc stays rollup-only, no per-person list — `AdhocRollupGrid` in Task 2, no expand wiring. ✅
- URL-param-driven expand/collapse, no new client-fetch component — `expand-param.ts` (Task 1) + `EntityRollupCard`'s `router.push` (Task 2), matching `DailyDatePicker`/`EntityPicker`'s existing pattern. ✅
- Reuse `getDepartmentDetail`/`getBranchDetail` — Tasks 4–5. ✅
- CEO gets the same Region sections — Task 5. ✅

**Placeholder scan:** no TBD/TODO; every step has complete code.

**Type consistency:** `ExpandedEntityDetail` (Task 3) is used identically by `HomeDepartmentOverview`/`HomeRegionOverview`/`HomeTaskOverview` and by the `Record<string, ExpandedEntityDetail>` built in Task 4/5's `Promise.all` blocks (`{ daily: d?.department, monthly: m?.department }` matches `{ daily?: FlowEntityDetail; monthly?: FlowEntityDetail }`). `kind: "dept" | "branch"` is consistent across `expand-param.ts`, `EntityRollupCard`, `EntityRollupGrid`, and the `parseExpandParam` call sites. `EntityCardOverview`'s prop names (`sectionLabel`, `entityName`, `entity`, `categories`, `myUserId`, `dateControl`, `showViewToggle`, `defaultOnlyMe`) match its actual definition in `entity-card-overview.tsx:124-215`.
