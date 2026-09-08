"use client";

// OSC integration package — the Manpower Schedule grid: rows are time slots,
// columns are role seats (Manager + configurable Coach N / Exec N). Branch
// managers can edit; anyone else on the branch sees a read-only view.
// Assigning a cell syncs a linked task once the schedule is PUBLISHED — see
// src/app/api/internal/manpower-schedule/* for the sync rules.

import * as React from "react";
import {
  flowFormatTime12h,
  flowRoleForColumn,
  type ActionResult,
  type FlowManpowerSchedule,
  type FlowScheduleCell,
  type FlowStaffMember,
} from "./types";
import { personLightColor } from "./palette";

// personLightColor (in ./palette.ts, not owned by this file) returns one of
// ten fixed "bg-X-100 text-X-800" pill treatments keyed by person-id hash.
// palette.ts is out of scope for this dark-mode pass, so the dark companion
// for each of its ten known outputs is mapped here instead — this keeps
// every person's color distinguishable in dark mode instead of collapsing
// them onto one shared shade. Falls back to no dark override if palette.ts's
// hue list ever changes without this map being updated alongside it.
const PERSON_LIGHT_TO_DARK: Record<string, string> = {
  "bg-blue-100 text-blue-800": "dark:bg-blue-900 dark:text-blue-200",
  "bg-emerald-100 text-emerald-800": "dark:bg-emerald-900 dark:text-emerald-200",
  "bg-amber-100 text-amber-800": "dark:bg-amber-900 dark:text-amber-200",
  "bg-rose-100 text-rose-800": "dark:bg-rose-900 dark:text-rose-200",
  "bg-violet-100 text-violet-800": "dark:bg-violet-900 dark:text-violet-200",
  "bg-cyan-100 text-cyan-800": "dark:bg-cyan-900 dark:text-cyan-200",
  "bg-orange-100 text-orange-800": "dark:bg-orange-900 dark:text-orange-200",
  "bg-lime-100 text-lime-800": "dark:bg-lime-900 dark:text-lime-200",
  "bg-pink-100 text-pink-800": "dark:bg-pink-900 dark:text-pink-200",
  "bg-teal-100 text-teal-800": "dark:bg-teal-900 dark:text-teal-200",
};
function personDarkColor(staffId: string): string {
  return PERSON_LIGHT_TO_DARK[personLightColor(staffId)] ?? "";
}

function rowKey(cell: { startTime: string; endTime: string }): string {
  return `${cell.startTime}-${cell.endTime}`;
}

// This grid gets wired to a server page in a later task; its actions are
// typed now so that page writes matching { ok } | { ok:false, message }
// server actions from the start, per the framework's expected-errors
// guidance (Next.js masks thrown server-action error messages in production).
export interface ManpowerScheduleActions {
  createSchedule: () => Promise<ActionResult>;
  addRow: (startTime: string, endTime: string, label?: string) => Promise<ActionResult>;
  renameRow: (
    oldStartTime: string,
    oldEndTime: string,
    newStartTime: string,
    newEndTime: string,
    /** New row label; "" clears (auto-format takes over). */
    newLabel?: string,
  ) => Promise<ActionResult>;
  deleteRow: (startTime: string, endTime: string) => Promise<ActionResult>;
  addColumn: (kind: "Coach" | "Exec") => Promise<ActionResult>;
  deleteColumn: (roleColumn: string) => Promise<ActionResult>;
  assignCell: (slotId: string, assignedStaffId: string | null) => Promise<ActionResult>;
  publish: () => Promise<ActionResult>;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>;
}

function EditableCell({
  cell,
  staff,
  onAssign,
}: {
  cell: FlowScheduleCell;
  staff: FlowStaffMember[];
  onAssign: (slotId: string, assignedStaffId: string | null) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const expectedRole = flowRoleForColumn(cell.roleColumn);
  const options = staff.filter((s) => !expectedRole || s.employmentType === expectedRole);

  return (
    <div>
      <select
        value={cell.assignedStaffId ?? ""}
        disabled={pending}
        onChange={(e) => {
          setError(null);
          startTransition(async () => {
            const result = await onAssign(cell.slotId, e.target.value || null);
            if (!result.ok) setError(result.message);
          });
        }}
        className={`w-full rounded-md border-0 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          cell.assignedStaffId
            ? `${personLightColor(cell.assignedStaffId)} ${personDarkColor(cell.assignedStaffId)}`
            : "bg-gray-50 text-gray-400 dark:bg-slate-800 dark:text-slate-400"
        }`}
      >
        <option value="">–</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <ErrorLine error={error} />
    </div>
  );
}

function StaticCell({ cell }: { cell: FlowScheduleCell }) {
  if (!cell.assignedStaffId) {
    return <span className="text-xs text-gray-300 dark:text-slate-600">–</span>;
  }
  return (
    <span
      className={`inline-flex w-full items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium ${personLightColor(
        cell.assignedStaffId,
      )} ${personDarkColor(cell.assignedStaffId)}`}
    >
      {cell.assignedStaffName}
    </span>
  );
}

function AddRowForm({
  onAdd,
}: {
  onAdd: (startTime: string, endTime: string, label?: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        + Add time row
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="rounded-full border border-gray-300 px-3 py-1 text-xs dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
      />
      <span className="text-xs text-gray-400 dark:text-slate-400">to</span>
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="rounded-full border border-gray-300 px-3 py-1 text-xs dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Opening) — optional"
        maxLength={60}
        className="w-52 rounded-full border border-gray-300 px-3 py-1 text-xs placeholder:text-gray-400 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!start || !end || start >= end) {
              setError("Pick a valid start/end time.");
              return;
            }
            const result = await onAdd(start, end, label.trim() || undefined);
            if (result.ok) {
              setOpen(false);
              setStart("");
              setEnd("");
              setLabel("");
            } else {
              setError(result.message);
            }
          })
        }
        className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-300"
      >
        Cancel
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

function RowTimeLabel({
  row,
  onRename,
  onDelete,
}: {
  row: { startTime: string; endTime: string; rowLabel: string | null };
  onRename: (newStart: string, newEnd: string, newLabel: string) => Promise<ActionResult>;
  onDelete: () => Promise<ActionResult>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [start, setStart] = React.useState(row.startTime);
  const [end, setEnd] = React.useState(row.endTime);
  const [label, setLabel] = React.useState(row.rowLabel ?? "");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const handleDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (!result.ok) setError(result.message);
    });
  };

  if (!editing) {
    return (
      <div>
        {/* Row label (2026-08-01, ClickUp-style slot naming) shown above
            the time range — this is the exact title the synced task gets. */}
        {row.rowLabel && (
          <p className="whitespace-nowrap text-sm font-semibold text-gray-800 dark:text-slate-200">{row.rowLabel}</p>
        )}
        <div
          className={`flex items-center gap-1.5 whitespace-nowrap ${
            row.rowLabel ? "text-xs text-gray-500 dark:text-slate-400" : "text-sm font-medium text-gray-700 dark:text-slate-300"
          }`}
        >
          {flowFormatTime12h(row.startTime)} – {flowFormatTime12h(row.endTime)}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            title="Edit time / label"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="text-xs text-gray-400 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
            title="Remove row"
          >
            ×
          </button>
        </div>
        <ErrorLine error={error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. Opening) — optional"
        maxLength={60}
        className="w-full rounded-full border border-gray-300 px-2 py-0.5 text-xs placeholder:text-gray-400 dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
      />
      <div className="flex items-center gap-1">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-24 rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-24 rounded-full border border-gray-300 px-2 py-0.5 text-xs dark:border-slate-500 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (!start || !end || start >= end) {
                setError("Invalid time range.");
                return;
              }
              const result = await onRename(start, end, label.trim());
              if (result.ok) {
                setEditing(false);
              } else {
                setError(result.message);
              }
            })
          }
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

export function ManpowerScheduleGrid({
  schedule,
  canEdit,
  staff,
  actions,
}: {
  schedule: FlowManpowerSchedule | null;
  canEdit: boolean;
  /** Assignable staff on this branch (Manager/Coach/Branch Exec employment types). */
  staff: FlowStaffMember[];
  actions: ManpowerScheduleActions;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!schedule) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          Manpower Schedule
        </h3>
        <p className="mb-3 text-sm text-gray-400 dark:text-slate-400">No schedule planned for this day yet.</p>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await actions.createSchedule();
                if (!result.ok) setError(result.message);
              })
            }
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            + Create schedule for this day
          </button>
        )}
        <ErrorLine error={error} />
      </div>
    );
  }

  const rows: { startTime: string; endTime: string; rowLabel: string | null }[] = [];
  const seenRows = new Set<string>();
  const columns: string[] = [];
  const seenColumns = new Set<string>();
  for (const cell of schedule.cells) {
    const rk = rowKey(cell);
    if (!seenRows.has(rk)) {
      seenRows.add(rk);
      rows.push({ startTime: cell.startTime, endTime: cell.endTime, rowLabel: cell.rowLabel });
    }
    if (!seenColumns.has(cell.roleColumn)) {
      seenColumns.add(cell.roleColumn);
      columns.push(cell.roleColumn);
    }
  }
  const cellAt = new Map(schedule.cells.map((c) => [`${rowKey(c)}::${c.roleColumn}`, c]));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-slate-400">
            Manpower Schedule
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{schedule.date}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              schedule.status === "PUBLISHED"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
            }`}
          >
            {schedule.status}
          </span>
          {canEdit && schedule.status === "PLANNING" && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await actions.publish();
                  if (!result.ok) setError(result.message);
                })
              }
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5">
          <thead>
            <tr>
              <th className="px-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Slot</th>
              {columns.map((col) => (
                <th key={col} className="px-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    {col}
                    {canEdit && col !== "Manager" && (
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            const result = await actions.deleteColumn(col);
                            if (!result.ok) setError(result.message);
                          })
                        }
                        className="text-gray-300 hover:text-red-600 dark:text-slate-600 dark:hover:text-red-400"
                        title="Remove seat"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                <td className="px-2 py-1 align-top">
                  {canEdit ? (
                    <RowTimeLabel
                      row={row}
                      onRename={(s, e, l) => actions.renameRow(row.startTime, row.endTime, s, e, l)}
                      onDelete={() => actions.deleteRow(row.startTime, row.endTime)}
                    />
                  ) : (
                    <div>
                      {row.rowLabel && (
                        <p className="whitespace-nowrap text-sm font-semibold text-gray-800 dark:text-slate-200">
                          {row.rowLabel}
                        </p>
                      )}
                      <span
                        className={`whitespace-nowrap ${
                          row.rowLabel ? "text-xs text-gray-500 dark:text-slate-400" : "text-sm font-medium text-gray-700 dark:text-slate-300"
                        }`}
                      >
                        {flowFormatTime12h(row.startTime)} – {flowFormatTime12h(row.endTime)}
                      </span>
                    </div>
                  )}
                </td>
                {columns.map((col) => {
                  const cell = cellAt.get(`${rowKey(row)}::${col}`);
                  return (
                    <td key={col} className="min-w-32 px-2 py-1 align-top">
                      {!cell ? (
                        <span className="text-xs text-gray-300 dark:text-slate-600">–</span>
                      ) : canEdit ? (
                        <EditableCell cell={cell} staff={staff} onAssign={actions.assignCell} />
                      ) : (
                        <StaticCell cell={cell} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <AddRowForm onAdd={actions.addRow} />
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await actions.addColumn("Coach");
                if (!result.ok) setError(result.message);
              })
            }
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add Coach seat
          </button>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const result = await actions.addColumn("Exec");
                if (!result.ok) setError(result.message);
              })
            }
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            + Add Exec seat
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </div>
  );
}
