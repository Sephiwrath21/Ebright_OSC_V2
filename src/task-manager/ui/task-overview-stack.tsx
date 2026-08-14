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
import { EntityCardOverview, type MyWeekDay } from "./entity-card-overview";
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
  myWeek?: { days: MyWeekDay[]; todayDate: string };
}

export function TaskOverviewStack({
  entityName,
  categories,
  myUserId,
  daily,
  monthly,
  hodAssigned,
  ceoAssigned,
  onComplete,
  onSkip,
  onReopen,
  onUploadProof,
  onRemoveProof,
  reassign,
}: {
  entityName: string;
  categories: FlowCategoryOption[];
  myUserId: string;
  daily?: SectionData;
  monthly?: SectionData;
  hodAssigned?: SectionData;
  ceoAssigned?: SectionData;
  onComplete?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onSkip?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onReopen?: (runBlockId: string) => Promise<import("./types").ActionResult>;
  onUploadProof?: import("./types").ProofUploadHandler;
  onRemoveProof?: import("./types").ProofRemoveHandler;
  /** "Assign to Others" self-service handoff (2026-08-13) — passed through
   *  identically to every section's EntityCardOverview. */
  reassign?: ReassignControl;
}) {
  const sections: { key: string; label: string; data?: SectionData }[] = [
    { key: "daily", label: "Daily", data: daily },
    { key: "monthly", label: "Monthly", data: monthly },
    { key: "hodAssigned", label: "HOD Assigned Task", data: hodAssigned },
    { key: "ceoAssigned", label: "CEO Assigned Task", data: ceoAssigned },
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
              onComplete={onComplete}
              onSkip={onSkip}
              onReopen={onReopen}
              onUploadProof={onUploadProof}
              onRemoveProof={onRemoveProof}
              reassign={reassign}
            />
          ),
      )}
    </div>
  );
}
