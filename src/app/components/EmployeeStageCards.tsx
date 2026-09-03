"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EMPLOYEE_STAGES, STAGE_LABELS, STAGE_PILL_CLASSES, type EmployeeStage } from "@/lib/employeeStages";
import OverdueDot from "@/app/components/OverdueDot";
import { formatProbationReminder } from "@/lib/probationReminderText";

interface Props {
  counts: Record<EmployeeStage, number>;
  /** Full-Time employees whose probation end date is within 3 days (or
   *  already passed) with no Confirm/Extend/Stop decision made yet — see
   *  probationDecision.ts's computeProbationReminderCandidates. Drives the
   *  red dot + tooltip on the Probation summary card, same signal as the
   *  NotificationBell's own Probation card. */
  probationReminderNames?: { name: string; endDate: string }[];
}

// Extracted verbatim from EmployeeOverviewView.tsx (2026-08-26, see
// conversation) so the /home dashboard's new "Employee Overview" section can
// render the literal same component/logic as /employee-folder, not a copy —
// any future change to these cards only needs to happen in one place.
export default function EmployeeStageCards({ counts, probationReminderNames }: Props) {
  return (
    <section aria-labelledby="employees-summary-heading" className="mb-8">
      <h2 id="employees-summary-heading" className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
        Employees
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {EMPLOYEE_STAGES.map((stage) => (
          <Link
            key={stage}
            href={`/employee-folder/${stage}`}
            className="relative text-left bg-white dark:bg-slate-900 rounded-[27px] border-2 border-slate-200 dark:border-slate-800 p-5 min-h-[143px] flex flex-col justify-end gap-2.5 transition-all hover:border-slate-400 hover:shadow-md"
          >
            <span className="self-start flex items-center gap-1.5">
              <span className={`inline-block px-3.5 py-1 rounded-full text-[13px] font-medium ${STAGE_PILL_CLASSES[stage]}`}>
                {STAGE_LABELS[stage]}
              </span>
              {stage === "probation" && probationReminderNames && probationReminderNames.length > 0 && (
                <OverdueDot
                  count={probationReminderNames.length}
                  label={probationReminderNames.map((r) => formatProbationReminder(r.name, r.endDate)).join("\n")}
                />
              )}
            </span>
            <span className="text-4xl font-medium text-slate-900/70 dark:text-slate-100/70">{counts[stage]}</span>
            <ChevronRight className="absolute top-3.5 right-4 w-5 h-5 text-slate-400" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
