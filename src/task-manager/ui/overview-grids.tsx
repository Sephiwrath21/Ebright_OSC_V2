"use client";

// Org-wide overview grids for Home's Task Manager section — Branch Status
// by Region (RegionRollupGrid) and Ad hoc by Region (AdhocRollupGrid).
// "All Departments" used this same collapsible-rollup-card pattern from
// 2026-08-15 to 2026-08-15 (rebuild #2); it since moved to a single-
// department-dropdown + TaskOverviewStack view (HomeDepartmentPicker, in
// home-overview.tsx) matching /task-manager's own Department view, so this
// file is branches-only now. Every branch starts as a lightweight rollup
// card (name, %, dot+count row — cheap, fed by the existing org rollup
// query); clicking it adds/removes the branch from the page's ?expand=
// param, which the SERVER caller (scoped-overview-section.tsx) reads to
// decide which branches to fetch full per-person detail for. Ad hoc stays
// rollup-only (see AdhocRollupGrid) — no per-person data source exists
// for it yet.

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

/** Shared stats body for a rollup card: the % line, the bucket dot/count
 *  row (drillable when the entity carries per-bucket task lists, plain
 *  otherwise), and the drill modal it opens. Used by both EntityRollupCard
 *  (dept/branch, with expand/collapse) and AdhocEntityCard (ad hoc, no
 *  expand/collapse) — identical stats presentation, different name row. */
function RollupStats({ entity }: { entity: FlowEntityRollup }) {
  const [drill, setDrill] = React.useState<"completed" | "pending" | "na" | null>(null);
  const drillable = Boolean(entity.tasks);

  return (
    <>
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
    </>
  );
}

/** One collapsed-or-expanded rollup card. The name row is itself the
 *  expand/collapse toggle (a chevron + click anywhere on the name), navigating
 *  with an updated ?expand= — same client-push navigation pattern as
 *  DailyDatePicker/EntityPicker. Bucket-count buttons still open the drill
 *  modal, unrelated to expand/collapse. Branches only (2026-08-15 rebuild
 *  #2) — "All Departments" moved to the single-department-dropdown pattern
 *  (HomeDepartmentPicker), so this is only ever used for Branch Status by
 *  Region now. */
function EntityRollupCard({
  entity,
  expanded,
  expandParam,
  basePath,
  extraParams,
}: {
  entity: FlowEntityRollup;
  expanded: boolean;
  expandParam?: string;
  basePath: string;
  extraParams: Record<string, string>;
}) {
  const router = useRouter();

  const toggle = () => {
    const nextExpand = toggleExpandEntry(expandParam, "branch", entity.name);
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
        <span aria-hidden="true" className={`text-[10px] transition-transform ${expanded ? "rotate-90" : ""}`}>
          ▶
        </span>
        {entity.name}
      </button>
      <RollupStats entity={entity} />
    </div>
  );
}

/** Collapsed entities render in a shared grid (unchanged look from before);
 *  expanded entities render below as full-width blocks — the rollup card
 *  stays visible above each one's per-person list as the collapse
 *  affordance. Called once per region by RegionRollupGrid. */
function EntityRollupList({
  entities,
  expandedNames,
  expandedContent,
  expandParam,
  basePath,
  extraParams,
}: {
  entities: FlowEntityRollup[];
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
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 shadow-sm dark:border-slate-800">
      <p className="w-full truncate text-center text-sm font-semibold text-gray-900 dark:text-slate-100">
        {entity.name}
      </p>
      <RollupStats entity={entity} />
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
