"use client";

import { useRef, type ReactNode } from "react";
import {
  PanelHeading,
  Subsection,
  FieldGrid,
  PlaceholderField,
  PlaceholderSelectField,
  PlaceholderTextArea,
  PlaceholderUploadField,
  SalaryRevisionFields,
  type SalaryRevisionHandle,
} from "@/app/components/ActiveProfilePanels";
import { EditableSection } from "@/app/components/EditMode";
import type { SalaryRevisionEntry } from "@/lib/employeeQueries";

// category_shared.css's field-grid/field-control/upload-field/record-table
// are byte-identical in color/spacing to active_*.css's — confirmed by
// direct comparison — so every primitive from ActiveProfilePanels is reused
// verbatim here, laid out label-above/value-below per the app's standard
// inner-card style. None of these sub-tabs have real schema backing except
// Finance > Payroll's Current/New Salary (used only to compute Salary
// Adjustment live, never persisted) — every other field here would need a
// new table/column to stop being a placeholder; see each panel's own comment.

// ─── Personal Info > Guardian Info — no guardian table exists; would need one ───

export function GuardianInfoPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Guardian Info</PanelHeading>
      <SubsectionLabel>Guardian 1</SubsectionLabel>
      <FieldGrid>
        <PlaceholderField label="Full Name" />
        <PlaceholderField label="Relationship" />
        <PlaceholderField label="Gender" />
        <PlaceholderField label="Email" type="email" />
        <PlaceholderField label="Phone Number" type="tel" />
        <PlaceholderField label="Address" />
      </FieldGrid>
      <button
        type="button"
        disabled
        className="mt-5 px-5 py-2.5 rounded-full border-2 border-[#49a2c6] bg-[#97ecf5] text-sm font-medium text-[#0b43a3] cursor-not-allowed"
      >
        Add Another
      </button>
    </EditableSection>
  );
}

function SubsectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-lg font-semibold text-[#4b4949d6] mb-4">{children}</p>;
}

// ─── HR Info (7 sub-tabs) — no schema backing; would need candidate-intake
// tables (offer-letter/hiring-notes/nda). Resume/CV, Reference, Medical
// Check, and Handbook are real now — see ActiveProfilePanels.ResumePanel/
// ReferenceCheckPanel/MedicalCheckPanel/DocumentsPanel (Handbook shares
// DocumentsPanel with the stage-flow's Onboarding "Documents" tab — same
// single "Employee Handbook Acknowledge" field in both mocks), special-cased
// in EmployeeRecordView's resolvePanel instead of living in the static-panel
// lookup below since they need real userId/data props the others don't take. ───

export function OfferLetterPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Offer Letter</PanelHeading>
      <FieldGrid>
        <PlaceholderUploadField label="Offer Letter" />
      </FieldGrid>
    </EditableSection>
  );
}

export function HiringNotesPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Hiring Notes</PanelHeading>
      <FieldGrid>
        <PlaceholderField label="Interview Date" type="date" />
        <PlaceholderSelectField label="Overall Rating" options={["Excellent", "Good", "Average", "Below Average"]} />
        <PlaceholderSelectField label="Recommendation" options={["Hire", "Hold", "Reject"]} full />
        <PlaceholderTextArea label="Strengths" />
        <PlaceholderTextArea label="Weaknesses" />
        <PlaceholderTextArea label="Hiring Notes" />
      </FieldGrid>
    </EditableSection>
  );
}

// NDA/NC is real now — see ActiveProfilePanels.NdaNcPanel (combines nda +
// non_compete in one Edit/Save cycle), special-cased in EmployeeRecordView's
// resolvePanel.

// ─── Finance (1 remaining sub-tab; Tax Info is real now — see
// ActiveProfilePanels.OnboardingPayrollPanel, shared with the stage-flow's
// Onboarding "Payroll" tab, special-cased in EmployeeRecordView's
// resolvePanel) ───

// One Edit/Save button for the whole tab (not one per sub-section): Salary
// Revision is real (see ActiveProfilePanels.SalaryRevisionFields, same
// component/data as the Active stage's own "Salary Revision" tab), nested
// here under this panel's own EditableSection instead of wrapping its own —
// its save() is invoked via ref from this section's single onSave. Basic
// Pay/Payslip stay placeholders — no matching table for either — so
// hasRealBacking stays false for the notice, even though Salary Revision
// underneath it is genuinely persisted.
export function PayrollPanel({ employeeId, salaryRevisions }: { employeeId: number; salaryRevisions: SalaryRevisionEntry[] }) {
  const salaryRevisionRef = useRef<SalaryRevisionHandle>(null);
  return (
    <EditableSection hasRealBacking={false} onSave={() => salaryRevisionRef.current?.save()}>
      <PanelHeading>Payroll/ Payslip</PanelHeading>
      <Subsection heading="Basic Pay">
        <PlaceholderField label="Basic Salary" />
        <PlaceholderSelectField label="Salary Type" options={["Monthly", "Daily Rate", "Hourly"]} />
      </Subsection>

      <Subsection heading="Payslip">
        <PlaceholderUploadField label="Payslip" full />
      </Subsection>

      <div className="mt-7">
        <SalaryRevisionFields ref={salaryRevisionRef} userId={employeeId} data={salaryRevisions} />
      </div>
    </EditableSection>
  );
}

// ─── Active Employment (5 remaining sub-tabs; Leave already wired to real leave_request) ───

export function PerformanceReviewPanel() {
  return (
    <EditableSection hasRealBacking={false}>
      <PanelHeading>Performance Review</PanelHeading>
      <FieldGrid>
        <PlaceholderField label="Review Period" />
        <PlaceholderField label="Review Date" type="date" />
        <PlaceholderField label="Reviewer" />
        <PlaceholderSelectField label="Overall Rating" options={["Exceeds Expectations", "Meets Expectations", "Below Expectations"]} />
        <PlaceholderTextArea label="Comment" />
        <PlaceholderUploadField label="Attachment" />
      </FieldGrid>
    </EditableSection>
  );
}

// Training/Promotion/Transfer are real now — see ActiveProfilePanels.
// TrainingPanel/PromotionPanel/TransferPanel, shared verbatim with the
// stage-flow's Active tabs of the same name (confirmed identical fields in
// both mocks), special-cased in EmployeeRecordView's resolvePanel instead of
// living in the static-panel lookup below since they need real userId/data
// props the others don't take.

// Cert./Achievement is real now — see ActiveProfilePanels.AchievementPanel,
// shared with the stage-flow's Active "Achievement" tab, special-cased in
// EmployeeRecordView's resolvePanel.

// Disciplinary (4 sub-tabs) is real now — see
// ActiveProfilePanels.DomesticInquiryPanel/SuspensionPanel/ShowcausePanel/
// PipPanel, each special-cased in EmployeeRecordView's resolvePanel.


function TaskList() {
  return (
    <ul className="divide-y divide-black/5">
      <li className="py-6 text-center text-sm text-slate-400">No tasks this month.</li>
    </ul>
  );
}

export function TaskPendingPanel() {
  return (
    <div>
      <PanelHeading>Pending</PanelHeading>
      <TaskList />
    </div>
  );
}

export function TaskOverduePanel() {
  return (
    <div>
      <PanelHeading>Overdue</PanelHeading>
      <TaskList />
    </div>
  );
}

// ─── Lookup: "category/section" -> panel component ───

export const EMPLOYEE_RECORD_STATIC_PANELS: Record<string, () => ReactNode> = {
  "hr-info/offer-letter": OfferLetterPanel,
  "hr-info/hiring-notes": HiringNotesPanel,
  "active-employment/performance-review": PerformanceReviewPanel,
  "task/pending": TaskPendingPanel,
  "task/overdue": TaskOverduePanel,
  "personal-info/guardian-info": GuardianInfoPanel,
};
