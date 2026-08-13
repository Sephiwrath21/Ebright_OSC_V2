"use client";

// OSC integration package — the shared "+ Task" button used identically by
// all 5 assign-capable roles (Superadmin, CEO, HOD, Ops, Operation dept-
// site): opens a modal wrapping AssignTaskForm. One component, one modal,
// one form — no per-role variant. Every role gets the same fully open
// Person/Group picker now (no recipientGroup restriction for any of them —
// CEO's old "HOD only" scoping and HOD's old "HOD/department-role only"
// server-side restriction were both deliberately dropped, per the user's
// confirmation, when this button was unified from its CEO-only original).
// Submits through the same POST /api/internal/assign route.

import * as React from "react";
import type { AssignActionResult, FlowAssignInput, FlowStaffMember } from "./types";
import { AssignTaskForm } from "./assign-task-form";

export function AddTaskButton({
  staff,
  action,
}: {
  staff: FlowStaffMember[];
  action: (input: FlowAssignInput) => Promise<AssignActionResult>;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        + Task
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Add Task</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <AssignTaskForm staff={staff} action={action} bare />
          </div>
        </div>
      )}
    </>
  );
}
