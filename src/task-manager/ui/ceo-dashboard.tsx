"use client";

// OSC integration package — the CEO's customizable department dashboard:
// pick departments from a dropdown to pin their status donut to the CEO's
// own overview, drag-and-drop to reorder, remove when no longer wanted.
// Personal to that CEO (persisted server-side), doesn't affect Superadmin's
// or anyone else's view. Reuses StatusOverviewCard as-is for the donut —
// this is just a customizable arrangement of the same department data
// already used elsewhere (Department Overview, HOD's own card).
//
// Drag-and-drop uses @dnd-kit (core/sortable/utilities) — already a
// dependency of the host app (the sidebar's flow/workspace reordering and
// the canvas item editor use the exact same library), reused here for
// consistency rather than hand-rolling drag logic. This is the first time
// src/osc/* has needed a real npm dependency; a host app copying this
// package in will need @dnd-kit/core, @dnd-kit/sortable, and
// @dnd-kit/utilities installed for THIS file only.

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ActionResult, FlowEntityDetail } from "./types";
import { StatusOverviewCard } from "./bits";

export interface CeoDashboardActions {
  add: (department: string) => Promise<ActionResult>;
  remove: (department: string) => Promise<ActionResult>;
  /** Full new order, sent as one write — computed client-side on drag end. */
  reorder: (orderedNames: string[]) => Promise<ActionResult>;
}

function CardControls({
  onRemove,
  dragHandleProps,
}: {
  onRemove: () => void;
  /** Spread onto the grip handle ONLY — not the whole card, so the donut's
   *  existing click-to-drill segments/legend stay clickable. */
  dragHandleProps: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [pending, startTransition] = React.useTransition();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Drag to reorder"
        aria-label="Drag to reorder"
        {...dragHandleProps}
        className="flex size-6 cursor-grab touch-none items-center justify-center rounded-full text-gray-300 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
      >
        ⠿
      </button>
      <button
        type="button"
        title="Remove from my dashboard"
        disabled={pending}
        onClick={() => startTransition(onRemove)}
        className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ×
      </button>
    </div>
  );
}

function SortableDepartmentCard({
  dept,
  periodLabel,
  onRemove,
}: {
  dept: FlowEntityDetail;
  periodLabel: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dept.name,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "z-10 opacity-70" : undefined}
    >
      <StatusOverviewCard
        title={dept.name}
        subtitle={periodLabel}
        totals={dept.totals}
        tasks={dept.tasks}
        action={
          <CardControls
            onRemove={onRemove}
            dragHandleProps={{ ...attributes, ...listeners }}
          />
        }
      />
    </div>
  );
}

export function CeoDashboardSection({
  periodLabel,
  departments,
  availableToAdd,
  actions,
}: {
  /** "Daily" | "Monthly" — shown as each pinned card's subtitle. */
  periodLabel: string;
  /** Already fetched, in the CEO's saved order. */
  departments: FlowEntityDetail[];
  /** Official departments not yet pinned. */
  availableToAdd: string[];
  actions: CeoDashboardActions;
}) {
  const [selected, setSelected] = React.useState("");
  const [pendingAdd, startAddTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Local order, optimistically updated on drag — reconciled from the
  // server-fetched `departments` prop whenever it changes (add/remove/revalidate).
  const [order, setOrder] = React.useState(() => departments.map((d) => d.name));
  React.useEffect(() => {
    setOrder(departments.map((d) => d.name));
  }, [departments]);

  const byName = new Map(departments.map((d) => [d.name, d]));
  const ordered = order
    .map((name) => byName.get(name))
    .filter((d): d is FlowEntityDetail => Boolean(d));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((d) => d.name);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrder(next);
    setError(null);
    void actions.reorder(next).then((result) => {
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-56 appearance-none rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Add a department…</option>
          {availableToAdd.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected || pendingAdd}
          onClick={() => {
            const department = selected;
            setError(null);
            startAddTransition(async () => {
              const result = await actions.add(department);
              if (result.ok) {
                setSelected("");
              } else {
                setError(result.message);
              }
            });
          }}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Add
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-gray-400">
          No departments pinned yet — add one above to track it here.
        </p>
      ) : (
        <DndContext
          // Stable per-instance id (this section renders twice — Daily and
          // Monthly boards): dnd-kit otherwise numbers its aria-describedby
          // ids with a module counter, and the server's count can differ
          // from the client's → React hydration-mismatch error.
          id={`ceo-dashboard-${periodLabel}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ordered.map((d) => d.name)} strategy={rectSortingStrategy}>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {ordered.map((dept) => (
                <SortableDepartmentCard
                  key={dept.name}
                  dept={dept}
                  periodLabel={periodLabel}
                  onRemove={() => {
                    setError(null);
                    void actions.remove(dept.name).then((result) => {
                      if (!result.ok) setError(result.message);
                    });
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
