"use client";

// Stacked-sections redesign (2026-08-12) — renders up to four
// EntityCardOverview instances top to bottom: Daily, Monthly, HOD Assigned
// Task, CEO Assigned Task. Each section is entirely optional — omit a
// prop to omit that section (BRANCH_MEMBER/COACH have no Monthly; OPS/the
// CEO's own page have no HOD/CEO Assigned Task; see role-views.ts's
// taskManager arrays and the design doc's per-role table for exactly which
// roles get which sections).
import * as React from "react";
import type { FlowCategoryOption, FlowEntityDetail } from "./types";
import { EntityCardOverview, type MyMonthConfig, type MyWeekConfig } from "./entity-card-overview";
import type { ReassignControl } from "./bits";

interface SectionData {
  entity: FlowEntityDetail;
  dateControl?: React.ReactNode;
  showViewToggle: boolean;
  /** Initial View-toggle state when showViewToggle is true (2026-08-15) —
   *  see EntityCardOverview's own doc comment. */
  defaultOnlyMe?: boolean;
  /** Weekday-tab view for the own card (2026-08-15) — see
   *  EntityCardOverview's own `myWeek` prop doc comment. Only ever set on
   *  the "daily" SectionData; Monthly/HOD/CEO Assigned have no per-weekday
   *  concept, so callers never build this for those. */
  myWeek?: MyWeekConfig;
  /** Month-range-chunk tab view for the own card (2026-08-15, Home only) —
   *  see EntityCardOverview's own `myMonth` prop doc comment. Only ever
   *  set on the "monthly" SectionData. */
  myMonth?: MyMonthConfig;
}

export function TaskOverviewStack({
  entityName,
  categories,
  myUserId,
  daily,
  monthly,
  hodAssigned,
  ceoAssigned,
  adhocAssigned,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  reassign,
  canReassignOthers,
  dailyLabel,
}: {
  entityName: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  daily?: SectionData;
  /** Override the Daily section's own heading, "Daily" by default
   *  (2026-08-26, CEO's Home page — its single section reads "My Tasks"
   *  instead, matching the old ceoCombinedList card's title it replaced;
   *  every other caller omits this and keeps the plain "Daily" label). */
  dailyLabel?: string;
  monthly?: SectionData;
  hodAssigned?: SectionData;
  ceoAssigned?: SectionData;
  /** "Ad hoc" section (2026-08-18, Branch Manager's own Task Manager page
   *  only) — same roster-first card grid as HOD/CEO Assigned, just backed
   *  by getBranchAdhocAssigned instead. Callers that want Ad hoc instead of
   *  HOD/CEO Assigned simply omit those two props and pass this one. */
  adhocAssigned?: SectionData;
  onComplete?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onSkip?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onReopen?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onUploadProof?: import("./types").ProofUploadHandler;
  onRemoveProof?: import("./types").ProofRemoveHandler;
  /** "Assign to Others" self-service handoff (2026-08-13) — passed through
   *  identically to every section's EntityCardOverview. */
  reassign?: ReassignControl;
  /** Manager mode for Person-sort's View All grid (2026-08-15) — see
   *  EntityCardOverview's own `canReassignOthers` doc comment; passed
   *  through identically to every section. */
  canReassignOthers?: boolean;
}) {
  const sections: { key: string; label: string; data?: SectionData }[] = [
    { key: "daily", label: dailyLabel ?? "Daily", data: daily },
    { key: "monthly", label: "Monthly", data: monthly },
    { key: "hodAssigned", label: "HOD Assigned Task", data: hodAssigned },
    { key: "ceoAssigned", label: "CEO Assigned Task", data: ceoAssigned },
    { key: "adhocAssigned", label: "Ad hoc", data: adhocAssigned },
  ];

  return (
    <div className="flex flex-col gap-6">
      {sections.map(
        ({ key, label, data }) =>
          data && (
            <EntityCardOverview
              key={key}
              sectionLabel={label}
              entityName={entityName}
              entity={data.entity}
              categories={categories}
              myUserId={myUserId}
              dateControl={data.dateControl}
              showViewToggle={data.showViewToggle}
              defaultOnlyMe={data.defaultOnlyMe}
              myWeek={data.myWeek}
              myMonth={data.myMonth}
              onComplete={onComplete}
              onSkip={onSkip}
              onReopen={onReopen}
              onUploadProof={onUploadProof}
              onRemoveProof={onRemoveProof}
              // No "Assign to Others" on HOD/CEO Assigned Task (2026-08-21,
              // user feedback) — withheld here rather than in
              // EntityCardOverview so Daily/Monthly/Ad hoc keep it
              // unaffected.
              reassign={key === "hodAssigned" || key === "ceoAssigned" ? undefined : reassign}
              canReassignOthers={canReassignOthers}
              // Standardized Pending-first/collapsible pattern (2026-08-19)
              // — HOD/CEO Assigned Task ONLY, never Daily/Monthly/Ad hoc —
              // see EntityCardOverview's own groupByStatus doc comment.
              groupByStatus={key === "hodAssigned" || key === "ceoAssigned"}
            />
          ),
      )}
    </div>
  );
}
