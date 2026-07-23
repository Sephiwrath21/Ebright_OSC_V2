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
  type FlowManpowerSchedule,
  type FlowScheduleCell,
  type FlowStaffMember,
} from "./types";
import { personLightColor } from "./palette";

function rowKey(cell: { startTime: string; endTime: string }): string {
  return `${cell.startTime}-${cell.endTime}`;
}

export interface ManpowerScheduleActions {
  createSchedule: () => Promise<void>;
  addRow: (startTime: string, endTime: string) => Promise<void>;
  renameRow: (
    oldStartTime: string,
    oldEndTime: string,
    newStartTime: string,
    newEndTime: string,
  ) => Promise<void>;
  deleteRow: (startTime: string, endTime: string) => Promise<void>;
  addColumn: (kind: "Coach" | "Exec") => Promise<void>;
  deleteColumn: (roleColumn: string) => Promise<void>;
  assignCell: (slotId: string, assignedStaffId: string | null) => Promise<void>;
  publish: () => Promise<void>;
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mt-2 text-xs text-red-600">{error}</p>;
}

function EditableCell({
  cell,
  staff,
  onAssign,
}: {
  cell: FlowScheduleCell;
  staff: FlowStaffMember[];
  onAssign: (slotId: string, assignedStaffId: string | null) => Promise<void>;
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
            try {
              await onAssign(cell.slotId, e.target.value || null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not update the cell.");
            }
          });
        }}
        className={`w-full rounded-md border-0 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          cell.assignedStaffId ? personLightColor(cell.assignedStaffId) : "bg-gray-50 text-gray-400"
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
    return <span className="text-xs text-gray-300">–</span>;
  }
  return (
    <span
      className={`inline-flex w-full items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium ${personLightColor(
        cell.assignedStaffId,
      )}`}
    >
      {cell.assignedStaffName}
    </span>
  );
}

function AddRowForm({ onAdd }: { onAdd: (startTime: string, endTime: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
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
        className="rounded-full border border-gray-300 px-3 py-1 text-xs"
      />
      <span className="text-xs text-gray-400">to</span>
      <input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="rounded-full border border-gray-300 px-3 py-1 text-xs"
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
            try {
              await onAdd(start, end);
              setOpen(false);
              setStart("");
              setEnd("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not add the row.");
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
        className="text-xs font-medium text-gray-400 hover:text-gray-600"
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
  row: { startTime: string; endTime: string };
  onRename: (newStart: string, newEnd: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [start, setStart] = React.useState(row.startTime);
  const [end, setEnd] = React.useState(row.endTime);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-gray-700">
        {flowFormatTime12h(row.startTime)} – {flowFormatTime12h(row.endTime)}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 hover:text-blue-600"
          title="Edit time"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => onDelete())}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-red-600"
          title="Remove row"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-24 rounded-full border border-gray-300 px-2 py-0.5 text-xs"
        />
        <input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-24 rounded-full border border-gray-300 px-2 py-0.5 text-xs"
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
              try {
                await onRename(start, end);
                setEditing(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not update the row.");
              }
            })
          }
          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-gray-400 hover:text-gray-600"
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
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Manpower Schedule
        </h3>
        <p className="mb-3 text-sm text-gray-400">No schedule planned for this day yet.</p>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await actions.createSchedule();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not create the schedule.");
                }
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

  const rows: { startTime: string; endTime: string }[] = [];
  const seenRows = new Set<string>();
  const columns: string[] = [];
  const seenColumns = new Set<string>();
  for (const cell of schedule.cells) {
    const rk = rowKey(cell);
    if (!seenRows.has(rk)) {
      seenRows.add(rk);
      rows.push({ startTime: cell.startTime, endTime: cell.endTime });
    }
    if (!seenColumns.has(cell.roleColumn)) {
      seenColumns.add(cell.roleColumn);
      columns.push(cell.roleColumn);
    }
  }
  const cellAt = new Map(schedule.cells.map((c) => [`${rowKey(c)}::${c.roleColumn}`, c]));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Manpower Schedule
          </h3>
          <p className="mt-1 text-sm text-gray-600">{schedule.date}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              schedule.status === "PUBLISHED"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
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
                  try {
                    await actions.publish();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not publish the schedule.");
                  }
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
              <th className="px-2 text-left text-xs font-semibold text-gray-500">Slot</th>
              {columns.map((col) => (
                <th key={col} className="px-2 text-left text-xs font-semibold text-gray-500">
                  <div className="flex items-center gap-1">
                    {col}
                    {canEdit && col !== "Manager" && (
                      <button
                        type="button"
                        onClick={() => startTransition(() => actions.deleteColumn(col))}
                        className="text-gray-300 hover:text-red-600"
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
                      onRename={(s, e) => actions.renameRow(row.startTime, row.endTime, s, e)}
                      onDelete={() => actions.deleteRow(row.startTime, row.endTime)}
                    />
                  ) : (
                    <span className="whitespace-nowrap text-sm font-medium text-gray-700">
                      {flowFormatTime12h(row.startTime)} – {flowFormatTime12h(row.endTime)}
                    </span>
                  )}
                </td>
                {columns.map((col) => {
                  const cell = cellAt.get(`${rowKey(row)}::${col}`);
                  return (
                    <td key={col} className="min-w-32 px-2 py-1 align-top">
                      {!cell ? (
                        <span className="text-xs text-gray-300">–</span>
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
            onClick={() => startTransition(() => actions.addColumn("Coach"))}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Add Coach seat
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => actions.addColumn("Exec"))}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Add Exec seat
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </div>
  );
}
