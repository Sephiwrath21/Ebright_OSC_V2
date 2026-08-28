"use client";

import { X } from "lucide-react";
import type { EmployeeTaskRow } from "@/lib/employeeQueries";

interface Props {
  employeeName: string;
  bucket: "pending" | "overdue";
  tasks: EmployeeTaskRow[];
  onClose: () => void;
}

// Click-to-drill content for a single Pending/Overdue cell (2026-08-27, see
// conversation) — name + source per task, same "source" convention
// (taskSourceLabel in employeeQueries.ts, e.g. "HOD Assigned · Daily",
// "Self-assigned") the existing per-employee Task tab already shows. No
// existing modal in this app already does this (the closest analog, No-Claim
// Incentive's own modal, only shows a rolled-up count per person, never a
// per-task list) — this is new UI, not a reuse.
export default function TaskDrilldownModal({ employeeName, bucket, tasks, onClose }: Props) {
  const heading = bucket === "pending" ? "Pending Tasks" : "Overdue Tasks";
  const accentClass = bucket === "pending" ? "text-[#8a6a1a]" : "text-[#a63a3a]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${heading} for ${employeeName}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className={`text-lg font-semibold ${accentClass}`}>{heading}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{employeeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No tasks for the selected month.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-100 dark:border-slate-800 px-4 py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{t.source}</span>
                    {t.dueDate && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Due {t.dueDate}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
