"use client";

// Org-wide overview donut grids (all-departments / branch-by-region), shared
// between the OSC Home page's superadmin Overview section (home-overview.tsx)
// and any Task Manager surface that needs the same read-only rollups. Moved
// out of task-manager-view.tsx when the superadmin grids relocated to Home.

import * as React from "react";
import type { FlowDrillTask, FlowEntityRollup } from "./types";
import { flowCompletionPct } from "./types";
import {
  BUCKET_META,
  EntityDrillModal,
  SectionCard,
  StatusDonut,
  type BucketKey,
} from "./bits";

/** Fallback for entities with no `tasks` data (undrillable — see `drillable`
 *  below), so EntityDrillModal always gets a valid (empty) shape. */
const EMPTY_DRILL_TASKS: Record<BucketKey, FlowDrillTask[]> = {
  completed: [],
  pending: [],
  na: [],
};

/** Mini donut block for the all-departments / all-branches overview grids.
 *  Clicking a segment (or a legend count) pops out that bucket's tasks. */
function MiniDonutBlock({
  entity,
  nameHref,
}: {
  entity: FlowEntityRollup;
  /** When given, the entity's name links out (e.g. to its full Department
   *  Overview page) instead of being plain text. */
  nameHref?: string;
}) {
  const [drill, setDrill] = React.useState<"completed" | "pending" | "na" | null>(null);
  const drillable = Boolean(entity.tasks);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 shadow-sm">
      {nameHref ? (
        <a
          href={nameHref}
          className="w-full truncate text-center text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
        >
          {entity.name}
        </a>
      ) : (
        <p className="w-full truncate text-center text-sm font-semibold text-gray-900">
          {entity.name}
        </p>
      )}
      <StatusDonut
        totals={entity}
        size={88}
        strokeWidth={12}
        onSegmentClick={drillable ? setDrill : undefined}
      >
        <span className="text-sm font-bold text-gray-900">
          {flowCompletionPct(entity)}%
        </span>
      </StatusDonut>
      <div className="flex gap-3 text-xs text-gray-500">
        {BUCKET_META.map((b) =>
          drillable ? (
            <button
              key={b.key}
              type="button"
              onClick={() => setDrill(b.key)}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-100"
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

export function EntityDonutGrid({
  title,
  entities,
  nameHref,
}: {
  title: string;
  entities: FlowEntityRollup[];
  /** Builds each entity's link-out URL (e.g. Department Overview), by name. */
  nameHref?: (name: string) => string;
}) {
  return (
    <SectionCard title={title}>
      {entities.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">No activity.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {entities.map((e) => (
            <MiniDonutBlock key={e.name} entity={e} nameHref={nameHref?.(e.name)} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Superadmin's branch view: donut grids grouped under Region A / B / C. When
 * `roleVariants` is given, pills (All / Manager / Branch Exec / Coach) filter
 * the grids to that staff role's tasks — "daily separate to manager,
 * exec, coach".
 */
export function RegionDonutGrids({
  title,
  regions,
  roleVariants,
}: {
  title: string;
  regions: { name: string; branches: FlowEntityRollup[] }[];
  roleVariants?: {
    role: string;
    regions: { name: string; branches: FlowEntityRollup[] }[];
  }[];
}) {
  const [selectedRole, setSelectedRole] = React.useState("All");
  const shown =
    selectedRole === "All"
      ? regions
      : (roleVariants?.find((v) => v.role === selectedRole)?.regions ?? []);

  return (
    <SectionCard
      title={title}
      action={
        roleVariants && (
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
            {["All", ...roleVariants.map((v) => v.role)].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setSelectedRole(r)}
                className={`rounded-md px-2.5 py-1 ${
                  selectedRole === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )
      }
    >
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No {selectedRole === "All" ? "" : `${selectedRole.toLowerCase()} `}activity.
        </p>
      ) : (
        shown.map((region) => (
          <div key={region.name} className="mb-5 last:mb-0">
            <p className="mb-2 text-sm font-semibold text-gray-700">{region.name}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {region.branches.map((b) => (
                <MiniDonutBlock key={b.name} entity={b} />
              ))}
            </div>
          </div>
        ))
      )}
    </SectionCard>
  );
}
