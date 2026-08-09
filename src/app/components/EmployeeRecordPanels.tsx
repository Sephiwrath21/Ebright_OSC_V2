"use client";

import { useState, useMemo, useRef, type ReactNode } from "react";
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
  CurrencyField,
  EditableSelectField,
  SelectWithOtherField,
  EditableTextArea,
  RecordTable,
  RealAttachmentLink,
  FilePickerControl,
  PhoneField,
  EmailField,
  PayslipHistoryPanel,
  type SalaryRevisionHandle,
} from "@/app/components/ActiveProfilePanels";
import { EditableSection, useEditMode, type SaveResult } from "@/app/components/EditMode";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  addGuardianInfo,
  updateGuardianInfo,
  deleteGuardianInfo,
  addPerformanceReview,
  updatePerformanceReview,
  deletePerformanceReview,
  updatePayslip,
} from "@/lib/employeeRecordActions";
import type {
  SalaryRevisionEntry,
  GuardianInfoEntry,
  PerformanceReviewEntry,
  PayslipInfo,
  PayslipHistoryEntry,
  EmployeeTaskRow,
} from "@/lib/employeeQueries";
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
  /** Free text draft, only meaningful while relationship === "OTHER". */
  relationshipOther: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
}

function blankGuardianDraft(): GuardianDraft {
  return { id: null, name: "", relationship: "", relationshipOther: "", gender: "", email: "", phone: "", address: "" };
}

function toDrafts(data: GuardianInfoEntry[]): GuardianDraft[] {
  if (data.length === 0) return [blankGuardianDraft()];
  return data.map((r) => {
    // Older rows may hold a relationship string that isn't one of the fixed
    // options — treat those the same as a fresh "OTHER" pick so the existing
    // free text still shows up (same convention as Training's Status
    // dropdown/ActiveProfilePanels' EmergencyContactPanel).
    const isKnownRelationship = GUARDIAN_RELATIONSHIP_OPTIONS.some((o) => o.value === r.relationship);
    return {
      id: r.id,
      name: r.name ?? "",
      relationship: r.relationship ? (isKnownRelationship ? r.relationship : "OTHER") : "",
      relationshipOther: r.relationship && !isKnownRelationship ? r.relationship : "",
      gender: r.gender ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
    };
  });
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

// Values match the existing real data's own casing (e.g. the one real
// guardian_info row currently stores gender "MALE", relationship "FATHER" —
// plain uppercase of the label), so converting from free text to a dropdown
// doesn't blank out what's already saved.
const GUARDIAN_GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "NON-BINARY", label: "Non-binary" },
  { value: "PREFER NOT TO SAY", label: "Prefer not to say" },
];

const GUARDIAN_RELATIONSHIP_OPTIONS = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "SPOUSE", label: "Spouse" },
  { value: "BROTHER", label: "Brother" },
  { value: "SISTER", label: "Sister" },
  { value: "SON", label: "Son" },
  { value: "DAUGHTER", label: "Daughter" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "RELATIVE", label: "Relative" },
  { value: "FRIEND", label: "Friend" },
  { value: "OTHER", label: "Other" },
];

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
        relationship: g.relationship === "OTHER" ? g.relationshipOther : g.relationship,
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
            <SelectWithOtherField
              label="Relationship"
              value={g.relationship}
              otherText={g.relationshipOther}
              onValueChange={(v) => updateGuardianField(i, "relationship", v)}
              onOtherTextChange={(v) => updateGuardianField(i, "relationshipOther", v)}
              options={GUARDIAN_RELATIONSHIP_OPTIONS}
              otherSentinel="OTHER"
            />
            <EditableSelectField
              label="Gender"
              value={g.gender}
              onChange={(v) => updateGuardianField(i, "gender", v)}
              options={GUARDIAN_GENDER_OPTIONS}
            />
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
  payslipHistory,
}: {
  employeeId: number;
  salaryRevisions: SalaryRevisionEntry[];
  payslip: PayslipInfo | null;
  payslipHistory: PayslipHistoryEntry[];
}) {
  const salaryRevisionRef = useRef<SalaryRevisionHandle>(null);
  const [basicPay, setBasicPay] = useState(payslip?.basicPay ?? "");
  const [type, setType] = useState(payslip?.type ?? "");

  async function handleSave(): Promise<SaveResult> {
    const [payslipResult, salaryRevisionResult] = await Promise.all([
      updatePayslip(employeeId, { basicPay, type }),
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
        <CurrencyField label="Basic Salary" value={basicPay} onChange={setBasicPay} />
        <EditableSelectField label="Salary Type" value={type} onChange={setType} options={SALARY_TYPE_OPTIONS} />
      </Subsection>

      <div className="mt-7">
        <PayslipHistoryPanel userId={employeeId} data={payslipHistory} />
      </div>

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

// Mirrors ActiveProfilePanels' own (private) SalaryRevisionAttachmentField —
// picking a file stages it for the NEW review row Save is about to create,
// it never edits the latest row's own attachment in place, so there's no
// "existing value being edited" the way RealFileField models it.
function PerformanceReviewAttachmentField({
  existingFileId,
  pendingFile,
  onPick,
  editingExistingRecord,
}: {
  existingFileId: string | null;
  pendingFile: File | null;
  onPick: (file: File | null) => void;
  /** True only when the form is loaded with a specific history row (clicked
   *  for in-place editing) rather than defaulting to latest for a new
   *  review — gates showing the row's own existing attachment + Replace. */
  editingExistingRecord: boolean;
}) {
  const editing = useEditMode();
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-xs font-medium text-slate-500">Attachment</span>
      {editing ? (
        editingExistingRecord && existingFileId && !pendingFile ? (
          <div className="flex items-center gap-2 min-w-0">
            <RealAttachmentLink fileId={existingFileId} />
            <label className="shrink-0 text-xs text-[#4a90e2] hover:underline cursor-pointer">
              <input type="file" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
              Replace
            </label>
          </div>
        ) : (
          <FilePickerControl file={pendingFile} onChange={onPick} editing />
        )
      ) : existingFileId ? (
        <RealAttachmentLink fileId={existingFileId} />
      ) : (
        <span className="text-sm italic text-slate-400">-</span>
      )}
    </div>
  );
}

// Small child of the EditableSection below so its useEditMode() reads that
// section's own context — a read in PerformanceReviewPanel's own body would
// read the ambient context from OUTSIDE the section it's about to render
// instead (same caveat SalaryRevisionAttachmentField's comment documents).
function CancelEditLink({ show, onClick }: { show: boolean; onClick: () => void }) {
  const editing = useEditMode();
  if (!editing || !show) return null;
  return (
    <button type="button" onClick={onClick} className="text-xs text-[#4a90e2] hover:underline shrink-0">
      Cancel edit — add new review instead
    </button>
  );
}

// Performance Review is real now — repeatable, same shape/convention as
// Salary Revision (see ActiveProfilePanels.SalaryRevisionFields): the form
// shows data[0] ("latest", listPerformanceReviews orders by review_date
// desc) by default, and a "Performance Review History" table lists every
// entry underneath. Saving the form appends a NEW row — same
// unchanged-vs-latest guard as Salary Revision, so toggling Edit on/off
// without actually changing anything (e.g. just to delete a history row)
// doesn't create a spurious duplicate. Clicking a history row while in edit
// mode instead loads that row into the form and Save corrects it in place
// (updatePerformanceReview) rather than appending.
export function PerformanceReviewPanel({ userId, data }: { userId: number; data: PerformanceReviewEntry[] }) {
  const router = useRouter();
  const latest = data[0] ?? null;

  const [editingId, setEditingId] = useState<number | null>(null);
  const loaded = editingId !== null ? data.find((r) => r.id === editingId) ?? null : latest;

  const [period, setPeriod] = useState(loaded?.period ?? "");
  const [reviewDate, setReviewDate] = useState(loaded?.reviewDate ?? "");
  const [reviewer, setReviewer] = useState(loaded?.reviewer ?? "");
  const [overallRating, setOverallRating] = useState(loaded?.overallRating ?? "");
  const [comment, setComment] = useState(loaded?.comment ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Re-sync the form whenever the *identity* of the loaded record changes —
  // a save created a new latest, a delete promoted the next-newest record,
  // or the user clicked a different history row to edit.
  const [syncedLoadedId, setSyncedLoadedId] = useState(loaded?.id ?? null);
  if (syncedLoadedId !== (loaded?.id ?? null)) {
    setSyncedLoadedId(loaded?.id ?? null);
    setPeriod(loaded?.period ?? "");
    setReviewDate(loaded?.reviewDate ?? "");
    setReviewer(loaded?.reviewer ?? "");
    setOverallRating(loaded?.overallRating ?? "");
    setComment(loaded?.comment ?? "");
    setPendingFile(null);
  }

  async function handleSave(): Promise<SaveResult> {
    if (!reviewDate && !period) return { ok: true };
    if (editingId !== null) {
      const result = await updatePerformanceReview(userId, editingId, {
        period,
        reviewDate,
        reviewer,
        overallRating,
        comment,
        attachmentFile: pendingFile,
      });
      if (!result || result.ok !== false) {
        setEditingId(null);
        router.refresh();
      }
      return result;
    }
    if (latest && latest.reviewDate === reviewDate && latest.period === period && latest.overallRating === overallRating) {
      return { ok: true };
    }
    const result = await addPerformanceReview(userId, { period, reviewDate, reviewer, overallRating, comment, attachmentFile: pendingFile });
    if (!result || result.ok !== false) router.refresh();
    return result;
  }

  async function handleConfirmDelete() {
    if (pendingDeleteId === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deletePerformanceReview(userId, pendingDeleteId);
      if (result && result.ok === false) {
        setDeleteError(result.error ?? "Delete failed.");
        setDeleting(false);
        return;
      }
      setDeleting(false);
      setPendingDeleteId(null);
      if (editingId === pendingDeleteId) setEditingId(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>{editingId !== null ? "Edit Performance Review" : "Performance Review"}</PanelHeading>
      <FieldGrid>
        <EditableField label="Review Period" value={period} onChange={setPeriod} />
        <EditableField label="Review Date" value={reviewDate} onChange={setReviewDate} type="date" />
        <EditableField label="Reviewer" value={reviewer} onChange={setReviewer} />
        <EditableSelectField label="Overall Rating" value={overallRating} onChange={setOverallRating} options={PERFORMANCE_RATING_OPTIONS} />
        <EditableTextArea label="Comment" value={comment} onChange={setComment} full />
        <PerformanceReviewAttachmentField
          existingFileId={loaded?.attachmentFileId ?? null}
          pendingFile={pendingFile}
          onPick={setPendingFile}
          editingExistingRecord={editingId !== null}
        />
      </FieldGrid>

      <div className="mt-7">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <PanelHeading>Performance Review History</PanelHeading>
          <CancelEditLink show={editingId !== null} onClick={() => setEditingId(null)} />
        </div>
        <RecordTable
          columns={[
            { key: "period", label: "Review Period" },
            { key: "date", label: "Review Date" },
            { key: "reviewer", label: "Reviewer" },
            { key: "rating", label: "Overall Rating" },
            { key: "comment", label: "Comment" },
            { key: "attachment", label: "Attachment" },
          ]}
          rows={data.map((r) => ({
            period: r.period ?? "—",
            date: r.reviewDate ?? "—",
            reviewer: r.reviewer ?? "—",
            rating: r.overallRating ?? "—",
            comment: r.comment ?? "—",
            attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
          }))}
          rowIds={data.map((r) => r.id)}
          onDeleteRow={(id) => setPendingDeleteId(id)}
          onRowClick={(i) => setEditingId(data[i].id)}
        />
      </div>

      {pendingDeleteId !== null && (
        <ConfirmDialog
          message={deleteError ?? "Delete this performance review record? This cannot be undone."}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onCancel={() => {
            setPendingDeleteId(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
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


// Real now — backed by Task Manager's own RunBlock rows (a separate database,
// ebright_task_manager; see employeeQueries.listEmployeeTasks for how an
// employee's row here is matched to their Task Manager account and how
// Pending/Overdue are each queried). Read-only: no add/edit/delete affordance
// exists for these (they're managed entirely from within Task Manager
// itself), so this is a plain RecordTable with no EditableSection around it.
// Overdue rows (isOverdue — due date passed, not completed) render in red so
// they stand out from tasks still within their due date; every row on the
// Overdue tab is overdue by definition, so it renders entirely red there too.
function TaskTable({ tasks }: { tasks: EmployeeTaskRow[] }) {
  return (
    <RecordTable
      columns={[
        { key: "name", label: "Task Name" },
        { key: "date", label: "Date" },
        { key: "source", label: "Source" },
      ]}
      rows={tasks.map((t) => ({
        name: <span className={t.isOverdue ? "text-red-600 font-medium" : undefined}>{t.name}</span>,
        date: <span className={t.isOverdue ? "text-red-600 font-medium" : undefined}>{t.dueDate ?? "—"}</span>,
        source: <span className={t.isOverdue ? "text-red-600 font-medium" : undefined}>{t.source}</span>,
      }))}
    />
  );
}

// Same 2-digit zero-padded value convention as every other month <select>
// in this app (e.g. EmployeeOverviewView's own MONTHS) — matches dueDate's
// own ISO "yyyy-mm-dd" month segment directly, no reformatting needed.
const TASK_MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const taskFilterSelectClass =
  "h-8 px-2.5 rounded-lg border border-black/15 bg-white text-sm text-black/70 shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500";

function TaskDateFilters({
  month,
  year,
  years,
  onMonthChange,
  onYearChange,
}: {
  month: string;
  year: string;
  years: string[];
  onMonthChange: (v: string) => void;
  onYearChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <select aria-label="Filter by month" value={month} onChange={(e) => onMonthChange(e.target.value)} className={taskFilterSelectClass}>
        <option value="all">All months</option>
        {TASK_MONTH_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select aria-label="Filter by year" value={year} onChange={(e) => onYearChange(e.target.value)} className={taskFilterSelectClass}>
        <option value="all">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

// Client-side only (no refetch) — the full task list is already loaded, and
// this date filter is purely a display concern (which of the already-
// fetched rows to show), same rationale as every other in-page search/filter
// input elsewhere in this app. Year options are derived from the tasks'
// OWN dueDate values (never hardcoded), same distinct-years-from-data
// pattern EmployeeOverviewView's own year filter already uses — so a new
// year automatically gets an option the moment a task with that due date
// exists, no code change required.
function TaskPanel({ heading, tasks }: { heading: string; tasks: EmployeeTaskRow[] }) {
  const years = useMemo(() => {
    const set = new Set(tasks.map((t) => t.dueDate?.slice(0, 4)).filter(Boolean) as string[]);
    return Array.from(set).sort((a, b) => b.localeCompare(a)); // most recent first
  }, [tasks]);

  const [month, setMonth] = useState("all");
  const [year, setYear] = useState("all");

  const filtered = tasks.filter((t) => {
    if (!t.dueDate) return false;
    if (year !== "all" && t.dueDate.slice(0, 4) !== year) return false;
    if (month !== "all" && t.dueDate.slice(5, 7) !== month) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PanelHeading>{heading}</PanelHeading>
        <TaskDateFilters month={month} year={year} years={years} onMonthChange={setMonth} onYearChange={setYear} />
      </div>
      <TaskTable tasks={filtered} />
    </div>
  );
}

export function TaskPendingPanel({ tasks }: { tasks: EmployeeTaskRow[] }) {
  return <TaskPanel heading="Pending" tasks={tasks} />;
}

export function TaskOverduePanel({ tasks }: { tasks: EmployeeTaskRow[] }) {
  return <TaskPanel heading="Overdue" tasks={tasks} />;
}

// ─── Lookup: "category/section" -> panel component ───
//
// Task/Pending and Task/Overdue are NOT here — they need real userId/tasks
// props the rest of this dictionary doesn't take, so they're special-cased
// in EmployeeRecordView's resolvePanel instead (same convention as Training/
// Promotion/Transfer/Cert.-Achievement/the 4 Disciplinary sub-tabs).
export const EMPLOYEE_RECORD_STATIC_PANELS: Record<string, () => ReactNode> = {
  "hr-info/offer-letter": OfferLetterPanel,
  "hr-info/hiring-notes": HiringNotesPanel,
};
