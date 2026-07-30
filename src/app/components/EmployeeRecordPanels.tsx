"use client";

import { useState, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  PanelHeading,
  SubsectionHeading,
  Subsection,
  FieldGrid,
  PlaceholderField,
  PlaceholderSelectField,
  PlaceholderTextArea,
  PlaceholderUploadField,
  SalaryRevisionFields,
  EditableField,
  EditableSelectField,
  EditableTextArea,
  RealFileField,
  PhoneField,
  EmailField,
  type SalaryRevisionHandle,
} from "@/app/components/ActiveProfilePanels";
import { EditableSection, useEditMode, type SaveResult } from "@/app/components/EditMode";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  addGuardianInfo,
  updateGuardianInfo,
  deleteGuardianInfo,
  updatePerformanceReview,
  updatePayslip,
} from "@/lib/employeeRecordActions";
import type { SalaryRevisionEntry, GuardianInfoEntry, PerformanceReviewInfo, PayslipInfo } from "@/lib/employeeQueries";
import { parsePhoneValue, isValidPhoneDigits, isValidEmail } from "@/lib/phoneEmail";

// category_shared.css's field-grid/field-control/upload-field/record-table
// are byte-identical in color/spacing to active_*.css's — confirmed by
// direct comparison — so every primitive from ActiveProfilePanels is reused
// verbatim here, laid out label-above/value-below per the app's standard
// inner-card style. None of these sub-tabs have real schema backing except
// Finance > Payroll's Current/New Salary (used only to compute Salary
// Adjustment live, never persisted) — every other field here would need a
// new table/column to stop being a placeholder; see each panel's own comment.

interface GuardianDraft {
  id: number | null; // null = not yet saved (added via "Add Another" this session)
  name: string;
  relationship: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
}

function blankGuardianDraft(): GuardianDraft {
  return { id: null, name: "", relationship: "", gender: "", email: "", phone: "", address: "" };
}

function toDrafts(data: GuardianInfoEntry[]): GuardianDraft[] {
  if (data.length === 0) return [blankGuardianDraft()];
  return data.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    relationship: r.relationship ?? "",
    gender: r.gender ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
  }));
}

// "Add Another" — visible/clickable only in edit mode, matching every other
// add-affordance in the app (e.g. RepeatableRecordSection's own addLabel
// button). A plain child of GuardianInfoPanel's <EditableSection> reads that
// section's real edit state via useEditMode(), same scoping as EditableField.
function AddAnotherGuardianButton({ onClick }: { onClick: () => void }) {
  const editing = useEditMode();
  if (!editing) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 px-5 py-2.5 rounded-full border-2 border-[#49a2c6] bg-[#97ecf5] text-sm font-medium text-[#0b43a3] hover:bg-[#7fe3ee]"
    >
      Add Another
    </button>
  );
}

// "−" delete for Guardian 2+ only — Guardian 1 always stays (there should
// always be at least one guardian section present). Same edit-mode gating
// as AddAnotherGuardianButton.
function RemoveGuardianButton({ onClick }: { onClick: () => void }) {
  const editing = useEditMode();
  if (!editing) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove this guardian"
      className="text-slate-400 hover:text-red-600 text-lg leading-none font-semibold"
    >
      −
    </button>
  );
}

// Personal Info > Guardian Info is real now — repeatable (confirmed via the
// mock's own real "Add Another" button, pinfo_guardianInfo.html), but shown
// as label/value form sections ("Guardian 1", "Guardian 2", ...) under one
// shared Edit/Save toggle — same visual layout as every other form panel in
// the app — rather than a record table + "add via modal" pattern. Saving
// updates every already-saved guardian in place and creates a new
// guardian_info row for each blank draft added via "Add Another" this
// session (skipping any draft left completely empty, so clicking Save
// without filling in a freshly-added block doesn't create a junk row).
export function GuardianInfoPanel({ userId, data }: { userId: number; data: GuardianInfoEntry[] }) {
  const router = useRouter();
  const [guardians, setGuardians] = useState<GuardianDraft[]>(() => toDrafts(data));
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Re-sync whenever the saved data actually changes identity (a save
  // created new rows, so their ids are now known) — render-time adjustment,
  // same pattern as SalaryRevisionPanel's own latest-record sync.
  const dataKey = data.map((r) => r.id).join(",");
  const [syncedKey, setSyncedKey] = useState(dataKey);
  if (syncedKey !== dataKey) {
    setSyncedKey(dataKey);
    setGuardians(toDrafts(data));
  }

  function updateGuardianField(index: number, key: keyof GuardianDraft, value: string) {
    setGuardians((prev) => prev.map((g, i) => (i === index ? { ...g, [key]: value } : g)));
  }

  function addBlank() {
    setGuardians((prev) => [...prev, blankGuardianDraft()]);
  }

  // A draft never saved this session (id === null) is just dropped locally
  // — nothing real to lose, no confirmation needed. An already-saved
  // guardian needs a real delete + confirmation, same as every other
  // repeatable table's delete.
  function removeGuardian(index: number) {
    const g = guardians[index];
    if (g.id === null) {
      setGuardians((prev) => prev.filter((_, i) => i !== index));
    } else {
      setPendingDeleteIndex(index);
    }
  }

  async function handleConfirmDelete() {
    if (pendingDeleteIndex === null) return;
    const g = guardians[pendingDeleteIndex];
    if (g.id === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteGuardianInfo(userId, g.id);
      if (result && result.ok === false) {
        setDeleteError(result.error ?? "Delete failed.");
        setDeleting(false);
        return;
      }
      setDeleting(false);
      setPendingDeleteIndex(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  async function handleSave(): Promise<SaveResult> {
    for (const g of guardians) {
      const isBlankNewDraft =
        g.id === null && !g.name && !g.relationship && !g.gender && !g.email && !g.phone && !g.address;
      if (isBlankNewDraft) continue;

      if (g.phone && !isValidPhoneDigits(parsePhoneValue(g.phone).digits)) {
        return { ok: false, error: `Guardian ${guardians.indexOf(g) + 1}: enter a valid phone number.` };
      }
      if (g.email && !isValidEmail(g.email)) {
        return { ok: false, error: `Guardian ${guardians.indexOf(g) + 1}: enter a valid email address.` };
      }

      const input = {
        name: g.name,
        relationship: g.relationship,
        gender: g.gender,
        email: g.email,
        phone: g.phone,
        address: g.address,
      };
      const result = g.id === null ? await addGuardianInfo(userId, input) : await updateGuardianInfo(userId, g.id, input);
      if (result && result.ok === false) return result;
    }
    router.refresh();
    return { ok: true };
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>Guardian Info</PanelHeading>
      {guardians.map((g, i) => (
        <div key={g.id ?? `new-${i}`} className="mb-7 last:mb-0">
          <div className="flex items-center justify-between">
            <SubsectionHeading>Guardian {i + 1}</SubsectionHeading>
            {i > 0 && <RemoveGuardianButton onClick={() => removeGuardian(i)} />}
          </div>
          <FieldGrid>
            <EditableField label="Full Name" value={g.name} onChange={(v) => updateGuardianField(i, "name", v)} />
            <EditableField label="Relationship" value={g.relationship} onChange={(v) => updateGuardianField(i, "relationship", v)} />
            <EditableField label="Gender" value={g.gender} onChange={(v) => updateGuardianField(i, "gender", v)} />
            <EmailField label="Email" value={g.email} onChange={(v) => updateGuardianField(i, "email", v)} />
            <PhoneField label="Phone Number" value={g.phone} onChange={(v) => updateGuardianField(i, "phone", v)} />
            <EditableField label="Address" value={g.address} onChange={(v) => updateGuardianField(i, "address", v)} />
          </FieldGrid>
        </div>
      ))}
      <AddAnotherGuardianButton onClick={addBlank} />
      {pendingDeleteIndex !== null && (
        <ConfirmDialog
          message={deleteError ?? "Delete this guardian? This cannot be undone."}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onCancel={() => {
            setPendingDeleteIndex(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </EditableSection>
  );
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

const SALARY_TYPE_OPTIONS = [
  { value: "Monthly", label: "Monthly" },
  { value: "Daily Rate", label: "Daily Rate" },
  { value: "Hourly", label: "Hourly" },
];

// One Edit/Save button for the whole tab (not one per sub-section): Basic
// Pay/Payslip (payslip table) and Salary Revision (see
// ActiveProfilePanels.SalaryRevisionFields, same component/data as the
// Active stage's own "Salary Revision" tab) are both real now, saved
// together — Salary Revision's own save() is invoked via ref, Payslip's
// fields are saved directly since they're plain controlled state (no
// separate "add new" concept of its own, unlike Salary Revision).
export function PayrollPanel({
  employeeId,
  salaryRevisions,
  payslip,
}: {
  employeeId: number;
  salaryRevisions: SalaryRevisionEntry[];
  payslip: PayslipInfo | null;
}) {
  const salaryRevisionRef = useRef<SalaryRevisionHandle>(null);
  const [basicPay, setBasicPay] = useState(payslip?.basicPay ?? "");
  const [type, setType] = useState(payslip?.type ?? "");
  const [fileId, setFileId] = useState(payslip?.attachmentFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  async function handleSave(): Promise<SaveResult> {
    const [payslipResult, salaryRevisionResult] = await Promise.all([
      updatePayslip(employeeId, { basicPay, type, attachmentFileId: fileId, attachmentFile: pendingFile }),
      salaryRevisionRef.current?.save() ?? Promise.resolve(undefined),
    ]);
    if (payslipResult && payslipResult.ok === false) return payslipResult;
    if (salaryRevisionResult && salaryRevisionResult.ok === false) return salaryRevisionResult;
    return { ok: true };
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>Payroll/ Payslip</PanelHeading>
      <Subsection heading="Basic Pay">
        <EditableField label="Basic Salary" value={basicPay} onChange={setBasicPay} />
        <EditableSelectField label="Salary Type" value={type} onChange={setType} options={SALARY_TYPE_OPTIONS} />
      </Subsection>

      <Subsection heading="Payslip">
        <RealFileField label="Payslip" existingFileId={fileId} pendingFile={pendingFile} onPick={setPendingFile} onClear={clearFile} full />
      </Subsection>

      <div className="mt-7">
        <SalaryRevisionFields ref={salaryRevisionRef} userId={employeeId} data={salaryRevisions} />
      </div>
    </EditableSection>
  );
}

// ─── Active Employment (4 remaining sub-tabs; Leave already wired to real leave_request) ───

const PERFORMANCE_RATING_OPTIONS = [
  { value: "Exceeds Expectations", label: "Exceeds Expectations" },
  { value: "Meets Expectations", label: "Meets Expectations" },
  { value: "Below Expectations", label: "Below Expectations" },
];

// Performance Review is real now — singleton, confirmed via the mock's own
// single-form-only rendering (activeEmp_performanceRev.html has no history
// list/"+Add" button, unlike Guardian Info/Achievement), special-cased in
// EmployeeRecordView's resolvePanel instead of living in the static-panel
// lookup below since it needs real userId/data props. Attachment routes to
// its own dedicated GOOGLE_DRIVE_PERFORMANCE_REVIEW_ID folder.
export function PerformanceReviewPanel({ userId, data }: { userId: number; data: PerformanceReviewInfo | null }) {
  const [period, setPeriod] = useState(data?.period ?? "");
  const [reviewDate, setReviewDate] = useState(data?.reviewDate ?? "");
  const [reviewer, setReviewer] = useState(data?.reviewer ?? "");
  const [overallRating, setOverallRating] = useState(data?.overallRating ?? "");
  const [comment, setComment] = useState(data?.comment ?? "");
  const [fileId, setFileId] = useState(data?.attachmentFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updatePerformanceReview(userId, {
          period,
          reviewDate,
          reviewer,
          overallRating,
          comment,
          attachmentFileId: fileId,
          attachmentFile: pendingFile,
        })
      }
    >
      <PanelHeading>Performance Review</PanelHeading>
      <FieldGrid>
        <EditableField label="Review Period" value={period} onChange={setPeriod} />
        <EditableField label="Review Date" value={reviewDate} onChange={setReviewDate} type="date" />
        <EditableField label="Reviewer" value={reviewer} onChange={setReviewer} />
        <EditableSelectField label="Overall Rating" value={overallRating} onChange={setOverallRating} options={PERFORMANCE_RATING_OPTIONS} />
        <EditableTextArea label="Comment" value={comment} onChange={setComment} full />
        <RealFileField label="Attachment" existingFileId={fileId} pendingFile={pendingFile} onPick={setPendingFile} onClear={clearFile} />
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
  "task/pending": TaskPendingPanel,
  "task/overdue": TaskOverduePanel,
};
