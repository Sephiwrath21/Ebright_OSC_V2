"use client";

// OSC integration package — the entity (department OR branch) overview
// section: chips + donut + member roster, with a client-side drill into one
// member's own task list. Originally the standalone Department Overview
// page's body; generalized for the 2026-07-24 Task Manager redesign, which
// renders it inline on /task-manager for both departments and branches.
// This is a different visual grouping of the SAME task data already shown
// elsewhere — no new task source, just reused FlowEntityDetail
// (getEntityPayload under the hood).

import * as React from "react";
import type { FlowEntityDetail, FlowMemberRollup, FlowTaskRow } from "./types";
import { flowCompletionPct, formatDueDate } from "./types";
import {
  CalendarIcon,
  InitialAvatar,
  StatusDonut,
  StatusOverviewCard,
  type ReassignControl,
} from "./bits";

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3">
      <path
        d="M3 8.5L6.5 12L13 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "neutral" | "completed" | "pending" | "na";
}) {
  const toneClass = {
    neutral: "border-indigo-100 bg-indigo-50 text-indigo-700",
    completed: "border-emerald-100 bg-emerald-50 text-emerald-700",
    pending: "border-rose-100 bg-rose-50 text-rose-700",
    // Amber — matches N/A's color everywhere else (legend dot, status chip).
    na: "border-amber-100 bg-amber-50 text-amber-700",
  }[tone];
  return (
    <div
      className={`flex min-w-[110px] flex-1 flex-col items-center rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}
    >
      <span className="text-2xl font-bold">{count}</span>
      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
    </div>
  );
}

/** Member has 0 pending -> completed; 1+ pending -> pending; 0 tasks total
 *  (neither done nor pending) -> a neutral "no tasks" state. */
function memberStatus(member: FlowMemberRollup): "completed" | "pending" | "none" {
  if (member.notDone > 0) return "pending";
  if (member.done > 0) return "completed";
  return "none";
}

/** Bare role, for the roster row (e.g. "HOD", "Full Time", "Intern"). */
function memberRowRoleLabel(member: FlowMemberRollup): string {
  return member.employmentType || "—";
}

/** "{role} - {scope}", for the Member Detail header only — every role, not
 *  just HOD (e.g. "Full Time - Finance", or "Coach - Subang Taipan" when the
 *  section shows a branch). */
function memberDetailRoleLabel(
  member: FlowMemberRollup,
  kind: "department" | "branch",
): string {
  const scope = kind === "branch" ? member.branch : member.department;
  return `${member.employmentType || "—"} - ${scope ?? "—"}`;
}

function memberSummaryText(member: FlowMemberRollup): string {
  if (member.notDone === 0 && member.done > 0) return "All tasks are completed";
  if (member.notDone > 0 && member.done === 0) return "All tasks are pending";
  if (member.notDone > 0) return `${member.notDone} task${member.notDone === 1 ? "" : "s"} pending`;
  return "No tasks this period";
}

function MemberListRow({
  member,
  onClick,
}: {
  member: FlowMemberRollup;
  onClick: () => void;
}) {
  const status = memberStatus(member);
  const badgeClass = {
    completed: "bg-emerald-50 text-emerald-700",
    pending: "bg-rose-100 text-rose-800",
    none: "bg-gray-100 text-gray-500",
  }[status];
  const badgeLabel = { completed: "Completed", pending: "Pending", none: "No tasks" }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      <InitialAvatar name={member.name} id={member.userId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{member.name}</p>
        <p className="truncate text-xs text-gray-500">{memberRowRoleLabel(member)}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="text-xs text-gray-500">{memberSummaryText(member)}</span>
        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>
      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium sm:hidden ${badgeClass}`}>
        {badgeLabel}
      </span>
      <span className="shrink-0 text-gray-300">›</span>
    </button>
  );
}

function TaskChecklistRow({ task }: { task: FlowTaskRow }) {
  const done = task.status === "DONE";
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const dueDisplay = formatDueDate(due);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 text-transparent"
        }`}
      >
        <CheckIcon />
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-sm font-semibold ${
          done ? "text-gray-400 line-through" : "text-gray-900"
        }`}
      >
        {task.blockTitle}
      </span>
      {dueDisplay && (
        <span className={`flex shrink-0 items-center gap-1 text-xs ${dueDisplay.className}`}>
          <CalendarIcon className="size-3.5" />
          {dueDisplay.text}
        </span>
      )}
    </div>
  );
}

/** One member's own detail: big donut + done/not-done stats + task checklist. */
function MemberDetailView({
  label,
  member,
  kind,
  tasks,
  onBack,
}: {
  label: string;
  member: FlowMemberRollup;
  kind: "department" | "branch";
  tasks: FlowTaskRow[];
  onBack: () => void;
}) {
  const totals = {
    completed: tasks.filter((t) => t.status === "DONE").length,
    pending: tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIPPED").length,
    na: tasks.filter((t) => t.status === "SKIPPED").length,
  };
  const sorted = [...tasks].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        ← Back
      </button>

      <div className="mb-5 flex items-center gap-3">
        <InitialAvatar name={member.name} id={member.userId} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-900">{member.name}</p>
          <p className="truncate text-sm text-gray-500">{memberDetailRoleLabel(member, kind)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <StatusDonut totals={totals} size={140} strokeWidth={18}>
          <span className="text-xl font-bold text-gray-900">{flowCompletionPct(totals)}%</span>
        </StatusDonut>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-bold text-emerald-600">{totals.completed}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Done</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-rose-600">{totals.pending}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Not Done</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-100 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
          {label}
        </p>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No tasks this period.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {sorted.map((t) => (
              <TaskChecklistRow key={t.runBlockId} task={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One period's (Daily or Monthly) full entity view — a department's or a
 * branch's summary chips, status donut, and a scrollable, click-through
 * member roster. Owns its own drill-into-member state, independent of any
 * sibling period section.
 */
export function EntityOverviewSection({
  label,
  entity,
  kind = "department",
  reassign,
  headerControl,
}: {
  label: string;
  entity: FlowEntityDetail;
  /** Which scope the roster belongs to — drives the member-detail header's
   *  "{role} - {scope}" line. */
  kind?: "department" | "branch";
  /** "Assign to Others" control for the status donut's Pending drill modal. */
  reassign?: ReassignControl;
  /** Rendered right-aligned on the "{name} — {label}" heading row — the
   *  Daily sections put the date filter here. */
  headerControl?: React.ReactNode;
}) {
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const selectedMember = selectedMemberId
    ? entity.members.find((m) => m.userId === selectedMemberId)
    : undefined;

  if (selectedMember) {
    const memberTasks = [
      ...entity.tasks.completed,
      ...entity.tasks.pending,
      ...entity.tasks.na,
    ].filter((t) => t.assigneeId === selectedMember.userId);
    return (
      <MemberDetailView
        label={label}
        member={selectedMember}
        kind={kind}
        tasks={memberTasks}
        onBack={() => setSelectedMemberId(null)}
      />
    );
  }

  const completedCount = entity.members.filter((m) => memberStatus(m) === "completed").length;
  const pendingCount = entity.members.filter((m) => memberStatus(m) === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">{entity.name} — {label}</h2>
        {headerControl}
      </div>

      {/* flex-wrap (2026-07-31): four chips now — the N/A card wraps to a
          second row on narrow screens instead of squeezing. N/A counts
          TASKS from entity.totals — the same source as the status donut's
          N/A legend segment. */}
      <div className="flex flex-wrap gap-3">
        <SummaryChip label="Members" count={entity.members.length} tone="neutral" />
        <SummaryChip label="Completed" count={completedCount} tone="completed" />
        <SummaryChip label="Pending" count={pendingCount} tone="pending" />
        <SummaryChip label="N/A" count={entity.totals.na} tone="na" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <StatusOverviewCard
          title={label}
          totals={entity.totals}
          tasks={entity.tasks}
          reassign={reassign}
        />

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Members
          </p>
          {entity.members.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No members this period.</p>
          ) : (
            <div className="max-h-[480px] divide-y divide-gray-100 overflow-y-auto px-2">
              {entity.members.map((m) => (
                <MemberListRow
                  key={m.userId}
                  member={m}
                  onClick={() => setSelectedMemberId(m.userId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
