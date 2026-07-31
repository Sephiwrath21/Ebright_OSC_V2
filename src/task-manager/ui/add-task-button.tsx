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
import type {
  AssignActionResult,
  FlowAssignInput,
  FlowStaffMember,
  FlowTemplateControl,
} from "./types";
import { AssignTaskForm } from "./assign-task-form";
import {
  TemplateArchivePanel,
  TemplateEditPanel,
  TemplateReassignPanel,
  TemplateRemovePanel,
} from "./template-panels";

/** + Task hub tabs (2026-07-31): Assign stays the default; the others are
 *  template-scoped bulk operations, shown only when templates exist —
 *  except Archive, which also lists/restores already-archived items (so
 *  it must stay reachable even when every template is archived). */
const HUB_TABS = [
  { key: "assign", label: "Assign" },
  { key: "edit", label: "Edit" },
  { key: "remove", label: "Remove" },
  { key: "reassign", label: "Reassign" },
  { key: "archive", label: "Archive" },
] as const;
type HubTab = (typeof HUB_TABS)[number]["key"];

export function AddTaskButton({
  staff,
  action,
  templates,
}: {
  staff: FlowStaffMember[];
  action: (input: FlowAssignInput) => Promise<AssignActionResult>;
  /** Task Templates (2026-07-31) — saved list + load/rename/delete
   *  actions, passed straight through to the form. */
  templates?: FlowTemplateControl;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<HubTab>("assign");
  // Tabs appear once templates are in play. `templates.list` only carries
  // ACTIVE templates, so the Archive tab (which restores archived ones)
  // must not disappear when everything is archived — any templates prop
  // at all keeps the tab bar once the user has used templates.
  const showTabs = Boolean(templates);

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
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 shrink-0 border-b border-gray-100 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Tasks</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex size-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              {showTabs && (
                <div role="tablist" className="mt-3 flex gap-1.5">
                  {HUB_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                        tab === t.key
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(!showTabs || tab === "assign") && (
              <AssignTaskForm staff={staff} action={action} templates={templates} bare />
            )}
            {showTabs && templates && tab !== "assign" && (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {tab === "edit" && <TemplateEditPanel templates={templates} />}
                {tab === "remove" && <TemplateRemovePanel templates={templates} />}
                {tab === "reassign" && <TemplateReassignPanel templates={templates} staff={staff} />}
                {tab === "archive" && <TemplateArchivePanel templates={templates} />}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
