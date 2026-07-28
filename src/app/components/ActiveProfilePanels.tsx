"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EditableSection, useEditMode, type SaveResult } from "@/app/components/EditMode";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  updatePersonalInfo,
  updateResume,
  updateInterviewAssessment,
  updateReferenceCheck,
  updateMedicalCheck,
  updateProbationInfo,
  updateDocuments,
  updatePayroll,
  updateBankDetails,
  addAchievement,
  deleteAchievement,
  addSalaryRevision,
  deleteSalaryRevision,
  addPromotion,
  deletePromotion,
  addTransfer,
  deleteTransfer,
  addTraining,
  deleteTraining,
  updateNda,
  updateNonCompete,
  addDomesticInquiry,
  deleteDomesticInquiry,
  addSuspensionLetter,
  deleteSuspensionLetter,
  addShowcauseWarningLetter,
  deleteShowcauseWarningLetter,
  addPip,
  deletePip,
  updateResignation,
  updateReferenceLetter,
  updateExitInterviewNote,
} from "@/lib/employeeRecordActions";
import type {
  EmployeeDetailFull,
  InterviewAssessmentInfo,
  ReferenceCheckInfo,
  MedicalCheckInfo,
  ProbationInfo,
  DocumentsInfo,
  PayrollInfo,
  AchievementEntry,
  SalaryRevisionEntry,
  PromotionEntry,
  TransferEntry,
  TrainingEntry,
  NdaInfo,
  NonCompeteInfo,
  DomesticInquiryEntry,
  SuspensionLetterEntry,
  ShowcauseWarningLetterEntry,
  PipEntry,
  DisciplinarySummaryRow,
  ResignationInfo,
  ReferenceLetterInfo,
  ExitInterviewNoteInfo,
} from "@/lib/employeeQueries";

// Shared "inner white form card" primitives used by every tab across both the
// stage-flow profile (Pre/Probation/Onboarding/Active/Exit) and the
// cross-cutting Employee Record page: bold section title (rendered by
// EditableSection's own Edit/Save button, top-right), optional bold
// subsection headers, and fields laid out label-above/value-below — italic
// gray "Not provided" when empty, plain dark text when filled, swapping to an
// underlined input only while editing. Record-table/checklist content (MC/
// Leave, Achievement's own history, Exit's clearance checklists, etc.) is
// left alone — those are genuinely lists, not single-value fields, so this
// label/value pattern doesn't apply to them.

function PanelHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold text-[#4b4949d6] mb-6">{children}</h2>;
}

function SubsectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-semibold text-[#4b4949d6] mb-4">{children}</h3>;
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-6">{children}</div>;
}

// Groups a set of fields under a bold subsection header (e.g. "Bank Details",
// "Statutory Information") — stacked vertically, each subsection's own fields
// still laid out in the standard two-column FieldGrid.
function Subsection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="mb-7 last:mb-0">
      <SubsectionHeading>{heading}</SubsectionHeading>
      <FieldGrid>{children}</FieldGrid>
    </div>
  );
}

const valueClass = "text-sm text-[#4b4949] truncate";
const emptyClass = "text-sm italic text-slate-400";
const labelClass = "text-xs font-medium text-slate-500";
const inputClass =
  "text-sm text-[#4b4949] bg-transparent border-0 border-b border-slate-300 p-0 pb-0.5 focus:outline-none focus:border-blue-500";

// Read-only, non-editable field (e.g. Full Name/Email — real data the user
// isn't allowed to change here for a business reason, not a missing column).
function FieldDisplay({ label, value, full = false }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {value ? <span className={valueClass}>{value}</span> : <span className={emptyClass}>Not provided</span>}
    </div>
  );
}

// Parent-controlled field — real DB value, lifted to a useState the caller
// owns (either to persist on Save, or, for Payroll's Salary Adjustment, to
// feed a live calculation). Used for every field with real schema backing.
function EditableField({
  label,
  value,
  onChange,
  type = "text",
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  full?: boolean;
}) {
  const editing = useEditMode();
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      ) : value ? (
        <span className={valueClass}>{value}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

function EditableSelectField({
  label,
  value,
  onChange,
  options,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  full?: boolean;
}) {
  const editing = useEditMode();
  const displayLabel = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value=""></option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : value ? (
        <span className={valueClass}>{displayLabel}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

// Real, parent-controlled multi-line field — same view/edit split as
// EditableField, just a <textarea>. Used wherever a real column backs a
// long-text field (e.g. interview_assessment's strength/weakness/hiring_note).
function EditableTextArea({
  label,
  value,
  onChange,
  full = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  const editing = useEditMode();
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="text-sm text-[#4b4949] bg-transparent border border-slate-300 rounded-lg p-2 resize-y focus:outline-none focus:border-blue-500"
        />
      ) : value ? (
        <span className="text-sm text-[#4b4949] whitespace-pre-wrap">{value}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

// Self-contained field for sections with NO real schema backing anywhere —
// manages its own local (never-persisted) state so callers don't need to
// thread value/onChange through a dozen useStates just to let Edit mode show
// an input. Every one of these is a placeholder: nothing typed into it
// survives a page reload. See each panel's own comment for exactly which
// columns would need to exist for it to become real.
function PlaceholderField({ label, type = "text", full = false }: { label: string; type?: string; full?: boolean }) {
  const editing = useEditMode();
  const [value, setValue] = useState("");
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <input type={type} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
      ) : value ? (
        <span className={valueClass}>{value}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

function PlaceholderSelectField({ label, options, full = false }: { label: string; options: string[]; full?: boolean }) {
  const editing = useEditMode();
  const [value, setValue] = useState("");
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <select value={value} onChange={(e) => setValue(e.target.value)} className={inputClass}>
          <option value=""></option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : value ? (
        <span className={valueClass}>{value}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

function PlaceholderTextArea({ label, full = true }: { label: string; full?: boolean }) {
  const editing = useEditMode();
  const [value, setValue] = useState("");
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          className="text-sm text-[#4b4949] bg-transparent border border-slate-300 rounded-lg p-2 resize-y focus:outline-none focus:border-blue-500"
        />
      ) : value ? (
        <span className="text-sm text-[#4b4949] whitespace-pre-wrap">{value}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

// Shared by every upload/attachment field in the app (this component below,
// plus EmployeeRecordPanels.tsx's DisciplinaryModal) — nothing here is
// persisted anywhere yet (no real storage/upload pipeline exists for any of
// these fields), so a picked file is kept only as an in-memory File for this
// browser session. It's still fully "reopenable" via a blob object URL
// (revoked and regenerated whenever the file changes, and revoked on
// unmount) so clicking the filename previews the actual picked file in a new
// tab, and an "x" (shown only while editing) clears it back to empty. This
// intentionally does NOT apply to Leave's real Attachment column (see
// StageProfileView/EmployeeRecordView's LeavePanel) — that one already has a
// real Drive file ID and links straight to the existing /api/attachment
// route instead of a session-only blob.
export function FilePickerControl({
  file,
  onChange,
  editing,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  editing: boolean;
}) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  if (file && url) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <a href={url} target="_blank" rel="noopener noreferrer" className={`${valueClass} hover:underline`}>
          {file.name}
        </a>
        {editing && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${file.name}`}
            className="shrink-0 text-slate-400 hover:text-red-600 text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  if (!editing) return <span className={emptyClass}>Not provided</span>;

  return (
    <label className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-dashed border-[#b9c4d6] bg-[#f7f9fc] px-3 py-1.5 text-xs text-[#6b7280] cursor-pointer hover:border-[#4a90e2] hover:bg-[#eef4fd]">
      <input type="file" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      Click to upload
    </label>
  );
}

// Small standalone reopen link for a File already saved into a parent's own
// state (e.g. a Disciplinary record's attachment, kept after its modal
// closes) — same session-only object URL pattern as FilePickerControl, just
// without the picker/remove affordance (removal happens by deleting the
// whole record it belongs to, not the file in isolation).
export function FileLink({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#4a90e2] hover:underline">
      {file.name}
    </a>
  );
}

// Genuinely real attachment — leave_request.attachment is a real Google
// Drive file ID column (unlike every session-only FilePickerControl/FileLink
// use above), served by the existing /api/attachment/[id] route (already
// used by the Claim feature). NOTE: that route currently only authorizes the
// leave's own owner (`leave.user_id === me.user_id`) — HR/staff viewing a
// DIFFERENT employee's Leave tab (the normal way this page is reached) will
// get a 404 until that route's permission check is extended to allow HR/
// staff read access. Flagging rather than changing that route unasked, since
// it's a shared, security-relevant access-control file.
export function RealAttachmentLink({ fileId }: { fileId: string | null }) {
  if (!fileId) return <span className="text-slate-400">—</span>;
  return (
    <a href={`/api/attachment/${encodeURIComponent(fileId)}`} target="_blank" rel="noopener noreferrer" className="text-[#4a90e2] hover:underline">
      View
    </a>
  );
}

// Real, server-persisted attachment field — unlike FilePickerControl (pure
// session-blob preview, used everywhere nothing is actually saved yet), this
// one already has a genuine saved Drive file (fileId) from a prior Save,
// shown via a real /api/attachment/[id] link. Picking a replacement queues
// it (shown as a session blob preview, matching FilePickerControl, until
// Save actually uploads it); the "x" clears whichever is currently shown —
// existing real file or a not-yet-saved pick — back to empty. The caller
// (e.g. ResumePanel below) is responsible for turning that cleared state
// into an actual removal on Save.
export function RealFileField({
  label,
  existingFileId,
  pendingFile,
  onPick,
  onClear,
  full = false,
}: {
  label: string;
  existingFileId: string | null;
  pendingFile: File | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
  full?: boolean;
}) {
  const editing = useEditMode();
  const blobUrl = useMemo(() => (pendingFile ? URL.createObjectURL(pendingFile) : null), [pendingFile]);
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {pendingFile && blobUrl ? (
        <div className="flex items-center gap-2 min-w-0">
          <a href={blobUrl} target="_blank" rel="noopener noreferrer" className={`${valueClass} hover:underline`}>
            {pendingFile.name}
          </a>
          {editing && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${pendingFile.name}`}
              className="shrink-0 text-slate-400 hover:text-red-600 text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      ) : existingFileId ? (
        <div className="flex items-center gap-2 min-w-0">
          <a
            href={`/api/attachment/${encodeURIComponent(existingFileId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${valueClass} hover:underline`}
          >
            View file
          </a>
          {editing && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Remove file"
              className="shrink-0 text-slate-400 hover:text-red-600 text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      ) : editing ? (
        <label className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-dashed border-[#b9c4d6] bg-[#f7f9fc] px-3 py-1.5 text-xs text-[#6b7280] cursor-pointer hover:border-[#4a90e2] hover:bg-[#eef4fd]">
          <input type="file" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          Click to upload
        </label>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

// Real resume table (resume_file_id/cv_file_id) — shared between HR Info's
// "Resume/CV" tab and the stage-flow's Pre "Resume" section (+ its history
// tab from every later stage), same as PersonalInfoPanel/EmergencyContactPanel.
export function ResumePanel({
  userId,
  resumeFileId: initialResumeFileId,
  cvFileId: initialCvFileId,
}: {
  userId: number;
  resumeFileId: string | null;
  cvFileId: string | null;
}) {
  const [resumeFileId, setResumeFileId] = useState(initialResumeFileId);
  const [resumePending, setResumePending] = useState<File | null>(null);
  const [cvFileId, setCvFileId] = useState(initialCvFileId);
  const [cvPending, setCvPending] = useState<File | null>(null);

  function clearResume() {
    if (resumePending) setResumePending(null);
    else setResumeFileId(null);
  }
  function clearCv() {
    if (cvPending) setCvPending(null);
    else setCvFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updateResume(userId, { resumeFileId, resumeFile: resumePending, cvFileId, cvFile: cvPending })
      }
    >
      <PanelHeading>Resume/CV</PanelHeading>
      <FieldGrid>
        <RealFileField label="Resume" existingFileId={resumeFileId} pendingFile={resumePending} onPick={setResumePending} onClear={clearResume} full />
        <RealFileField label="CV" existingFileId={cvFileId} pendingFile={cvPending} onPick={setCvPending} onClear={clearCv} full />
      </FieldGrid>
    </EditableSection>
  );
}

const OVERALL_RATE_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];
const RECOMMENDATION_OPTIONS = [
  { value: "proceed", label: "Proceed" },
  { value: "hire", label: "Hire" },
  { value: "hold", label: "Hold" },
  { value: "reject", label: "Reject" },
];

// Real interview_assessment table — Pre stage's own Interview Assessment tab
// only. Deliberately NOT shared with Employee Record's HR Info > Hiring
// Notes tab — same field labels, but that page uses different dropdown
// vocabularies in the mock (Excellent/Good/Average/Below Average and Hire/
// Hold/Reject vs. this table's 1-5 rating and Proceed/Hire/Hold/Reject) —
// confirmed by reading both mock pages directly rather than assuming they're
// the same form.
export function InterviewAssessmentPanel({
  userId,
  data,
}: {
  userId: number;
  data: InterviewAssessmentInfo | null;
}) {
  const [intDate, setIntDate] = useState(data?.intDate ?? "");
  const [overallRate, setOverallRate] = useState(data?.overallRate != null ? String(data.overallRate) : "");
  const [recommendation, setRecommendation] = useState(data?.recommendation ?? "");
  const [strength, setStrength] = useState(data?.strength ?? "");
  const [weakness, setWeakness] = useState(data?.weakness ?? "");
  const [hiringNote, setHiringNote] = useState(data?.hiringNote ?? "");

  return (
    <EditableSection
      onSave={() =>
        updateInterviewAssessment(userId, { intDate, overallRate, recommendation, strength, weakness, hiringNote })
      }
    >
      <PanelHeading>Interview Assessment</PanelHeading>
      <FieldGrid>
        <EditableField label="Interview Date" value={intDate} onChange={setIntDate} type="date" full />
        <EditableSelectField label="Overall Rating" value={overallRate} onChange={setOverallRate} options={OVERALL_RATE_OPTIONS} />
        <EditableSelectField label="Recommendation" value={recommendation} onChange={setRecommendation} options={RECOMMENDATION_OPTIONS} />
        <EditableTextArea label="Strengths" value={strength} onChange={setStrength} />
        <EditableTextArea label="Weaknesses" value={weakness} onChange={setWeakness} />
        <EditableTextArea label="Hiring Notes" value={hiringNote} onChange={setHiringNote} />
      </FieldGrid>
    </EditableSection>
  );
}

// Real reference_check table — shared between Pre stage's own "Reference
// Check" tab and Employee Record's HR Info > "Reference" tab, same as
// Resume/CV (confirmed identical field set in both mocks).
export function ReferenceCheckPanel({
  userId,
  data,
}: {
  userId: number;
  data: ReferenceCheckInfo | null;
}) {
  const [refName, setRefName] = useState(data?.refName ?? "");
  const [company, setCompany] = useState(data?.company ?? "");
  const [relationship, setRelationship] = useState(data?.relationship ?? "");
  const [position, setPosition] = useState(data?.position ?? "");
  const [contactNumber, setContactNumber] = useState(data?.contactNumber ?? "");
  const [email, setEmail] = useState(data?.email ?? "");

  return (
    <EditableSection
      onSave={() => updateReferenceCheck(userId, { refName, company, relationship, position, contactNumber, email })}
    >
      <PanelHeading>Reference Check</PanelHeading>
      <FieldGrid>
        <EditableField label="Reference Name" value={refName} onChange={setRefName} full />
        <EditableField label="Company" value={company} onChange={setCompany} full />
        <EditableField label="Relationship" value={relationship} onChange={setRelationship} />
        <EditableField label="Position" value={position} onChange={setPosition} />
        <EditableField label="Contact Number" value={contactNumber} onChange={setContactNumber} type="tel" full />
        <EditableField label="Email" value={email} onChange={setEmail} type="email" full />
      </FieldGrid>
    </EditableSection>
  );
}

const MEDICAL_RESULT_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Fit to Work", label: "Fit to Work" },
  { value: "Fit with Restriction", label: "Fit with Restriction" },
  { value: "Not Fit to Work", label: "Not Fit to Work" },
];

// Real medical_check table — shared between Pre stage's own "Medical Check"
// tab and Employee Record's HR Info > "Medical Check" tab, same as Resume/CV
// (confirmed identical field set/options in both mocks).
// medicalReportFileId is a Google Drive file ID, same pattern as
// resume.resume_file_id.
export function MedicalCheckPanel({
  userId,
  data,
}: {
  userId: number;
  data: MedicalCheckInfo | null;
}) {
  const [fileId, setFileId] = useState(data?.medicalReportFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [result, setResult] = useState(data?.result ?? "");

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  return (
    <EditableSection
      onSave={() => updateMedicalCheck(userId, { medicalReportFileId: fileId, medicalReportFile: pendingFile, result })}
    >
      <PanelHeading>Medical Check</PanelHeading>
      <FieldGrid>
        <RealFileField
          label="Medical Report"
          existingFileId={fileId}
          pendingFile={pendingFile}
          onPick={setPendingFile}
          onClear={clearFile}
          full
        />
        <EditableSelectField label="Result" value={result} onChange={setResult} options={MEDICAL_RESULT_OPTIONS} />
      </FieldGrid>
    </EditableSection>
  );
}

const PROBATION_STATUS_OPTIONS = [
  { value: "In Progress", label: "In Progress" },
  { value: "Confirmed", label: "Confirmed" },
  { value: "Extended", label: "Extended" },
  { value: "Stopped", label: "Stopped" },
];

// Real probation table — Probation stage's own tab only (no Employee Record
// equivalent in the mock). confirmationLetter*/extensionLetter* are
// independent Google Drive file fields, same pattern as resume.resume_file_id.
export function ProbationPanel({
  userId,
  data,
}: {
  userId: number;
  data: ProbationInfo | null;
}) {
  const [status, setStatus] = useState(data?.probationStatus ?? "");
  const [startDate, setStartDate] = useState(data?.startDate ?? "");
  const [endDate, setEndDate] = useState(data?.endDate ?? "");
  const [confirmDate, setConfirmDate] = useState(data?.confirmDate ?? "");
  const [extEndDate, setExtEndDate] = useState(data?.extEndDate ?? "");
  const [confirmationLetterFileId, setConfirmationLetterFileId] = useState(data?.confirmationLetterFileId ?? null);
  const [confirmationLetterPending, setConfirmationLetterPending] = useState<File | null>(null);
  const [extensionLetterFileId, setExtensionLetterFileId] = useState(data?.extensionLetterFileId ?? null);
  const [extensionLetterPending, setExtensionLetterPending] = useState<File | null>(null);

  function clearConfirmationLetter() {
    if (confirmationLetterPending) setConfirmationLetterPending(null);
    else setConfirmationLetterFileId(null);
  }
  function clearExtensionLetter() {
    if (extensionLetterPending) setExtensionLetterPending(null);
    else setExtensionLetterFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updateProbationInfo(userId, {
          probationStatus: status,
          startDate,
          endDate,
          confirmDate,
          extEndDate,
          confirmationLetterFileId,
          confirmationLetterFile: confirmationLetterPending,
          extensionLetterFileId,
          extensionLetterFile: extensionLetterPending,
        })
      }
    >
      <PanelHeading>Probation</PanelHeading>
      <FieldGrid>
        <EditableSelectField label="Probation Status" value={status} onChange={setStatus} options={PROBATION_STATUS_OPTIONS} full />
        <EditableField label="Start Date" value={startDate} onChange={setStartDate} type="date" />
        <EditableField label="End Date" value={endDate} onChange={setEndDate} type="date" />
        <EditableField label="Confirmation Date" value={confirmDate} onChange={setConfirmDate} type="date" />
        <EditableField label="Extension End Date" value={extEndDate} onChange={setExtEndDate} type="date" />
        <RealFileField
          label="Confirmation Letter"
          existingFileId={confirmationLetterFileId}
          pendingFile={confirmationLetterPending}
          onPick={setConfirmationLetterPending}
          onClear={clearConfirmationLetter}
          full
        />
        <RealFileField
          label="Extension Letter"
          existingFileId={extensionLetterFileId}
          pendingFile={extensionLetterPending}
          onPick={setExtensionLetterPending}
          onClear={clearExtensionLetter}
          full
        />
      </FieldGrid>
    </EditableSection>
  );
}

// Real documents table — shared between Onboarding stage's own "Documents"
// tab and Employee Record's HR Info > "Handbook" tab (confirmed identical
// "Employee Handbook Acknowledge" field in both mocks). Employment Contract
// has no Employee Record equivalent, so it only ever renders here.
// showEmploymentContract defaults true for the stage-flow's Onboarding
// "Documents" tab (both fields, per onboarding_document.html). Employee
// Record's HR Info > "Handbook" tab passes showEmploymentContract={false} —
// hr_handbook.html only has the single "Employee Handbook Acknowledge"
// field, Employment Contract has no Employee Record equivalent at all. Both
// views share the same underlying documents row/onSave — hiding the
// Employment Contract field here just means its already-loaded state is
// carried through unchanged on Save, never cleared.
export function DocumentsPanel({
  userId,
  data,
  showEmploymentContract = true,
}: {
  userId: number;
  data: DocumentsInfo | null;
  showEmploymentContract?: boolean;
}) {
  const [contractFileId, setContractFileId] = useState(data?.employmentContractFileId ?? null);
  const [contractPending, setContractPending] = useState<File | null>(null);
  const [handbookFileId, setHandbookFileId] = useState(data?.employeeHandbookFileId ?? null);
  const [handbookPending, setHandbookPending] = useState<File | null>(null);

  function clearContract() {
    if (contractPending) setContractPending(null);
    else setContractFileId(null);
  }
  function clearHandbook() {
    if (handbookPending) setHandbookPending(null);
    else setHandbookFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updateDocuments(userId, {
          employmentContractFileId: contractFileId,
          employmentContractFile: contractPending,
          employeeHandbookFileId: handbookFileId,
          employeeHandbookFile: handbookPending,
        })
      }
    >
      <PanelHeading>{showEmploymentContract ? "Documents" : "Employee Handbook"}</PanelHeading>
      <FieldGrid>
        {showEmploymentContract && (
          <RealFileField
            label="Employment Contract"
            existingFileId={contractFileId}
            pendingFile={contractPending}
            onPick={setContractPending}
            onClear={clearContract}
            full
          />
        )}
        <RealFileField
          label="Employee Handbook Acknowledge"
          existingFileId={handbookFileId}
          pendingFile={handbookPending}
          onPick={setHandbookPending}
          onClear={clearHandbook}
          full
        />
      </FieldGrid>
    </EditableSection>
  );
}

const PCB_FORM_OPTIONS = [
  { value: "TP1", label: "TP1" },
  { value: "TP2", label: "TP2" },
  { value: "TP3", label: "TP3" },
];

// Real payroll table (Statutory Information + PCB) — shared between
// Onboarding stage's own "Payroll" tab and Employee Record's Finance >
// "Tax Info" tab (confirmed identical EPF/SOCSO/EIS/Tax Number fields and
// PCB Form/PCB upload concept in both mocks). Bank Details reuses the
// existing bank_details table (already on employeeDetail) via
// updateBankDetails — same data Employee Record's own "Payment & Bank Info"
// tab already reads/writes, saved together with payroll in one Edit/Save
// cycle since this panel shows both subsections at once.
export function OnboardingPayrollPanel({
  userId,
  data,
  employeeDetail,
}: {
  userId: number;
  data: PayrollInfo | null;
  employeeDetail: EmployeeDetailFull;
}) {
  const [epfNumber, setEpfNumber] = useState(data?.epfNumber ?? "");
  const [socsoNumber, setSocsoNumber] = useState(data?.socsoNumber ?? "");
  const [eisNumber, setEisNumber] = useState(data?.eisNumber ?? "");
  const [taxNumber, setTaxNumber] = useState(data?.taxNumber ?? "");
  const [pcbForm, setPcbForm] = useState(data?.pcbForm ?? "");
  const [pcbFileId, setPcbFileId] = useState(data?.pcbAttachmentFileId ?? null);
  const [pcbPending, setPcbPending] = useState<File | null>(null);

  const [bankName, setBankName] = useState(employeeDetail.bankName ?? "");
  const [accountName, setAccountName] = useState(employeeDetail.accountName ?? "");
  const [bankAccount, setBankAccount] = useState(employeeDetail.bankAccount ?? "");

  function clearPcb() {
    if (pcbPending) setPcbPending(null);
    else setPcbFileId(null);
  }

  return (
    <EditableSection
      onSave={async () => {
        const [payrollResult, bankResult] = await Promise.all([
          updatePayroll(userId, {
            epfNumber,
            socsoNumber,
            eisNumber,
            taxNumber,
            pcbForm,
            pcbAttachmentFileId: pcbFileId,
            pcbAttachmentFile: pcbPending,
          }),
          updateBankDetails(userId, { bankName, accountName, bankAccount }),
        ]);
        if (!payrollResult.ok) return payrollResult;
        if (!bankResult.ok) return bankResult;
        return { ok: true };
      }}
    >
      <PanelHeading>Payroll</PanelHeading>
      <Subsection heading="Statutory Information">
        <EditableField label="EPF Number" value={epfNumber} onChange={setEpfNumber} />
        <EditableField label="SOCSO Number" value={socsoNumber} onChange={setSocsoNumber} />
        <EditableField label="EIS Number" value={eisNumber} onChange={setEisNumber} />
        <EditableField label="Tax Number" value={taxNumber} onChange={setTaxNumber} />
      </Subsection>
      <Subsection heading="PCB">
        <EditableSelectField label="PCB Form" value={pcbForm} onChange={setPcbForm} options={PCB_FORM_OPTIONS} />
        <RealFileField
          label="PCB Attachment"
          existingFileId={pcbFileId}
          pendingFile={pcbPending}
          onPick={setPcbPending}
          onClear={clearPcb}
          full
        />
      </Subsection>
      <Subsection heading="Bank Details">
        <EditableField label="Bank Name" value={bankName} onChange={setBankName} />
        <EditableField label="Account Holder" value={accountName} onChange={setAccountName} />
        <EditableField label="Account Number" value={bankAccount} onChange={setBankAccount} full />
      </Subsection>
    </EditableSection>
  );
}

function PlaceholderUploadField({ label, full = false }: { label: string; full?: boolean }) {
  const editing = useEditMode();
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      <FilePickerControl file={file} onChange={setFile} editing={editing} />
    </div>
  );
}

// Checkbox checklist (Exit's Clearance sub-tabs) — a genuinely different
// content shape from a single-value field, so it keeps its own look rather
// than forcing a label/value pattern onto it.
function Checklist({ items }: { items: string[] }) {
  const editing = useEditMode();
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <input
            type="checkbox"
            disabled={!editing}
            className="mt-1 w-4 h-4 shrink-0 rounded border-slate-300 disabled:cursor-not-allowed"
          />
          <span className="text-sm text-[#4b4949]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface RecordColumn {
  key: string;
  label: string;
}

function RecordTable({
  columns,
  rows,
  rowIds,
  addLabel,
  onDeleteRow,
}: {
  columns: RecordColumn[];
  rows: Array<Record<string, ReactNode>>;
  /** Parallel to `rows` — required only when onDeleteRow is provided. */
  rowIds?: number[];
  addLabel?: string;
  onDeleteRow?: (id: number) => void;
}) {
  const editing = useEditMode();
  const showDeleteColumn = !!onDeleteRow && editing;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`text-left px-3.5 py-2.5 bg-[#f0f0f0a6] text-sm font-medium text-[#4b4949] whitespace-nowrap ${
                    i === 0 ? "rounded-l-[10px]" : ""
                  } ${i === columns.length - 1 && !showDeleteColumn ? "rounded-r-[10px]" : ""}`}
                >
                  {c.label}
                </th>
              ))}
              {showDeleteColumn && (
                <th scope="col" className="px-3.5 py-2.5 bg-[#f0f0f0a6] rounded-r-[10px] w-10">
                  <span className="sr-only">Delete</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showDeleteColumn ? 1 : 0)}
                  className="px-3.5 py-6 text-sm text-slate-400 text-center border-b border-black/5"
                >
                  No records yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={rowIds?.[i] ?? i}>
                  {columns.map((c) => (
                    <td key={c.key} className="align-top px-3.5 py-3.5 text-sm text-[#4b4949] border-b border-black/5">
                      {row[c.key] ?? "—"}
                    </td>
                  ))}
                  {showDeleteColumn && (
                    <td className="align-top px-3.5 py-3.5 text-center border-b border-black/5">
                      {rowIds?.[i] !== undefined && (
                        <button
                          type="button"
                          onClick={() => onDeleteRow(rowIds[i])}
                          aria-label="Delete record"
                          className="text-slate-400 hover:text-red-600 text-lg leading-none font-semibold"
                        >
                          −
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {addLabel && editing && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 mt-4 px-[18px] py-2 rounded-[10px] border-0 bg-[#d9fd63a8] text-sm font-medium text-[#5c6b0a] hover:bg-[#d9fd63]"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

// ─── Active stage's 7 repeatable/singleton tabs — all real now (achievement/
// salary_revision/promotion/transfer/training/nda/non_compete/disciplinary's
// 4 sub-tables). Repeatable ones (all but nda/non_compete) share
// RepeatableRecordSection below — a generalized version of what was
// previously EmployeeRecordPanels' local-state-only DisciplinaryModal/
// DisciplinarySection, now calling real server actions and refreshing via
// router.refresh() instead of appending to component state. No edit UI
// exists for these records anywhere in the mock — still "add new" plus
// display only for editing existing values — but delete ("−" per row, with
// a ConfirmDialog) was added as an explicit exception across all 8
// repeatable tables per product decision (originally only asked for Salary
// Revision, widened to all of them for UX consistency). ───

export interface RecordField {
  key: string;
  label: string;
  type: "text" | "date" | "textarea" | "file";
  full?: boolean;
}

const recordModalInputClass =
  "h-11 rounded-[10px] bg-[#f0f0f0a6] border-0 px-3.5 text-sm text-[#4b4949] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

function RecordAddModal({
  title,
  fields,
  saving,
  error,
  onClose,
  onSave,
}: {
  title: string;
  fields: RecordField[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: Record<string, string>, files: Record<string, File>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }
  function setFileField(key: string, file: File | null) {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[key] = file;
      else delete next[key];
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-[min(560px,calc(100vw-48px))] max-h-[calc(100vh-64px)] overflow-y-auto box-border bg-white rounded-2xl p-7 shadow-[0_12px_32px_0_#00000026]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-6 text-lg text-[#4b4949a3] hover:text-[#4b4949]"
        >
          ×
        </button>
        <h3 className="mb-5 text-lg font-semibold text-[#4b4949d6]">{title}</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {fields.map((f) => (
            <div key={f.key} className={`flex flex-col gap-2 min-w-0 ${f.full ? "col-span-2" : ""}`}>
              <label className="text-sm font-medium text-[#4b4949]">{f.label}</label>
              {f.type === "textarea" ? (
                <textarea
                  value={values[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  rows={3}
                  className={`${recordModalInputClass} h-auto py-2.5 resize-y`}
                />
              ) : f.type === "file" ? (
                <FilePickerControl file={files[f.key] ?? null} onChange={(file) => setFileField(f.key, file)} editing />
              ) : (
                <input
                  type={f.type}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className={recordModalInputClass}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(values, files)}
            className="rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] disabled:opacity-60 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RepeatableRecordSection({
  heading,
  addLabel,
  fields,
  columns,
  rows,
  rowIds,
  onAdd,
  onDelete,
}: {
  heading: string;
  addLabel: string;
  fields: RecordField[];
  columns: { key: string; label: string }[];
  rows: Array<Record<string, ReactNode>>;
  /** Real row ids, parallel to `rows` — required for onDelete to work. */
  rowIds?: number[];
  onAdd: (values: Record<string, string>, files: Record<string, File>) => Promise<SaveResult>;
  /** Explicit exception to the append-only convention, added for every
   *  repeatable table (Achievement/Salary Revision/Promotion/Transfer/
   *  Training/Domestic Inquiry/Suspension/Showcause/PIP) per product
   *  decision — omit to keep a given table add-only. */
  onDelete?: (id: number) => Promise<SaveResult>;
}) {
  const editing = useEditMode();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSave(values: Record<string, string>, files: Record<string, File>) {
    setSaving(true);
    setError(null);
    try {
      const result = await onAdd(values, files);
      if (result && result.ok === false) {
        setError(result.error ?? "Save failed.");
        setSaving(false);
        return;
      }
      setModalOpen(false);
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (pendingDeleteId === null || !onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await onDelete(pendingDeleteId);
      if (result && result.ok === false) {
        setDeleteError(result.error ?? "Delete failed.");
        setDeleting(false);
        return;
      }
      setDeleting(false);
      setPendingDeleteId(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <div>
      <PanelHeading>{heading}</PanelHeading>
      <RecordTable
        columns={columns}
        rows={rows}
        rowIds={rowIds}
        onDeleteRow={onDelete ? (id) => setPendingDeleteId(id) : undefined}
      />
      {editing && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 mt-4 px-[18px] py-2 rounded-[10px] border-0 bg-[#d9fd63a8] text-sm font-medium text-[#5c6b0a] hover:bg-[#d9fd63]"
        >
          {addLabel}
        </button>
      )}
      {modalOpen && (
        <RecordAddModal
          title={addLabel.replace(/^\+\s*/, "")}
          fields={fields}
          saving={saving}
          error={error}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
      {pendingDeleteId !== null && (
        <ConfirmDialog
          message={deleteError ?? "Delete this record? This cannot be undone."}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onCancel={() => {
            setPendingDeleteId(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

export function AchievementPanel({ userId, data }: { userId: number; data: AchievementEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Achievement"
        addLabel="+ Add certificate or achievement"
        fields={[
          { key: "name", label: "Name", type: "text", full: true },
          { key: "date", label: "Date", type: "date", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "name", label: "Certificate" },
          { key: "date", label: "Date" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({ name: r.name ?? "—", date: r.date ?? "—", attachment: <RealAttachmentLink fileId={r.attachmentFileId} /> }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values, files) =>
          addAchievement(userId, { name: values.name ?? "", date: values.date ?? "", attachmentFile: files.attachment ?? null })
        }
        onDelete={(id) => deleteAchievement(userId, id)}
      />
    </EditableSection>
  );
}

function parseAmount(val: string): number | null {
  const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}
function formatAmount(n: number): string {
  return (n < 0 ? "-RM " : "RM ") + Math.abs(n).toFixed(2);
}

const APPROVED_BY_OPTIONS = [
  { value: "ceo", label: "CEO" },
  { value: "head-of-department", label: "Head of Department" },
  { value: "hr", label: "HR" },
];

// Scoped like EditableField/RealFileField above — a child of the panel's own
// <EditableSection>, so its useEditMode() call reads that section's actual
// edit state (a plain boolean read in SalaryRevisionPanel's own body would
// read the ambient context from OUTSIDE that provider instead, always false).
// Unlike RealFileField there's no "existing value being edited" here: picking
// a file stages the attachment for the NEW revision row Save is about to
// create, it never edits the latest row's own attachment in place.
function SalaryRevisionAttachmentField({
  existingFileId,
  pendingFile,
  onPick,
}: {
  existingFileId: string | null;
  pendingFile: File | null;
  onPick: (file: File | null) => void;
}) {
  const editing = useEditMode();
  return (
    <div className="flex flex-col gap-1 min-w-0 col-span-2">
      <span className={labelClass}>Attachment</span>
      {editing ? (
        <FilePickerControl file={pendingFile} onChange={onPick} editing />
      ) : existingFileId ? (
        <RealAttachmentLink fileId={existingFileId} />
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

export interface SalaryRevisionHandle {
  save: () => Promise<SaveResult>;
}

// The form + history table content, minus its own Edit/Save button — a
// forwardRef so a single OUTER EditableSection (Employee Record's Finance >
// Payroll/Payslip tab, which needs one button for the whole tab, not one per
// sub-section) can drive this section's edit state and trigger its save
// logic via the exposed `save()`. The Active stage's own standalone "Salary
// Revision" tab has no such outer section, so SalaryRevisionPanel below
// wraps this in its own EditableSection instead. Either way, useEditMode()
// calls inside here read whichever EditableSection is actually the nearest
// ancestor provider — the fields render identically regardless of which one
// owns the button.
//
// Two views onto the same salary_revision rows (listSalaryRevisions orders
// by effective_date desc, so data[0] is always "latest"): a form defaulting
// to the latest record, and a read-only history table underneath — same
// split as the mock's Finance > Payroll/Payslip collapsible Salary Revision
// body + Salary Revision History table. Saving the form appends a NEW row
// (never overwrites the latest one); the history table is view + delete
// only, no inline editing. The form and the table's delete column share
// whichever single Edit/Save toggle wraps them (no separate button per the
// app's one-button convention), so save() guards against turning a "click
// Edit just to delete a row, then Save to close" pass into a spurious
// duplicate append — same guard as the mock's own
// js/salary-revision-history.js: unchanged Effective Date + New Salary vs.
// the current latest record means nothing new was actually entered.
export const SalaryRevisionFields = forwardRef<SalaryRevisionHandle, { userId: number; data: SalaryRevisionEntry[] }>(
  function SalaryRevisionFields({ userId, data }, ref) {
  const router = useRouter();
  const latest = data[0] ?? null;

  const [issuedDate, setIssuedDate] = useState(latest?.issuedDate ?? "");
  const [effectiveDate, setEffectiveDate] = useState(latest?.effectiveDate ?? "");
  const [currentSalary, setCurrentSalary] = useState(latest?.currentSalary ?? "");
  const [newSalary, setNewSalary] = useState(latest?.newSalary ?? "");
  const [reason, setReason] = useState(latest?.reason ?? "");
  const [approvedBy, setApprovedBy] = useState(latest?.approvedBy ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Re-sync the form whenever the *identity* of the latest record changes —
  // a save created a new one, or a delete promoted the next-newest record.
  // Adjusted during render (React's documented pattern for this) rather than
  // in a useEffect, so it doesn't cost an extra post-commit render pass.
  const [syncedLatestId, setSyncedLatestId] = useState(latest?.id ?? null);
  if (syncedLatestId !== (latest?.id ?? null)) {
    setSyncedLatestId(latest?.id ?? null);
    setIssuedDate(latest?.issuedDate ?? "");
    setEffectiveDate(latest?.effectiveDate ?? "");
    setCurrentSalary(latest?.currentSalary ?? "");
    setNewSalary(latest?.newSalary ?? "");
    setReason(latest?.reason ?? "");
    setApprovedBy(latest?.approvedBy ?? "");
    setPendingFile(null);
  }

  const currentAmount = parseAmount(currentSalary);
  const newAmount = parseAmount(newSalary);
  const adjustment = currentAmount !== null && newAmount !== null ? newAmount - currentAmount : null;

  async function handleSave(): Promise<SaveResult> {
    if (!effectiveDate || !newSalary) return { ok: true };
    if (latest && latest.effectiveDate === effectiveDate && latest.newSalary === newSalary) {
      return { ok: true };
    }
    const result = await addSalaryRevision(userId, {
      issuedDate,
      effectiveDate,
      currentSalary,
      newSalary,
      reason,
      salaryAdjustment: adjustment !== null ? String(adjustment) : "",
      approvedBy,
      attachmentFile: pendingFile,
    });
    if (!result || result.ok !== false) router.refresh();
    return result;
  }

  useImperativeHandle(ref, () => ({ save: handleSave }));

  async function handleConfirmDelete() {
    if (pendingDeleteId === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteSalaryRevision(userId, pendingDeleteId);
      if (result && result.ok === false) {
        setDeleteError(result.error ?? "Delete failed.");
        setDeleting(false);
        return;
      }
      setDeleting(false);
      setPendingDeleteId(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <>
      <PanelHeading>Salary Revision</PanelHeading>
      <FieldGrid>
        <EditableField label="Issue Date" value={issuedDate} onChange={setIssuedDate} type="date" />
        <EditableField label="Effective Date" value={effectiveDate} onChange={setEffectiveDate} type="date" />
        <EditableField label="Current Salary" value={currentSalary} onChange={setCurrentSalary} />
        <EditableField label="New Salary" value={newSalary} onChange={setNewSalary} />
        <FieldDisplay label="Salary Adjustment" value={adjustment !== null ? formatAmount(adjustment) : null} full />
        <EditableTextArea label="Reason" value={reason} onChange={setReason} full />
        <EditableSelectField label="Approved By" value={approvedBy} onChange={setApprovedBy} options={APPROVED_BY_OPTIONS} full />
        <SalaryRevisionAttachmentField
          existingFileId={latest?.attachmentFileId ?? null}
          pendingFile={pendingFile}
          onPick={setPendingFile}
        />
      </FieldGrid>

      <div className="mt-7">
        <PanelHeading>Salary Revision History</PanelHeading>
        <RecordTable
          columns={[
            { key: "effective", label: "Effective Date" },
            { key: "prev", label: "Previous Salary" },
            { key: "new", label: "New Salary" },
            { key: "adjustment", label: "Adjustment" },
            { key: "reason", label: "Reason" },
            { key: "approver", label: "Approved By" },
            { key: "attachment", label: "Attachment" },
          ]}
          rows={data.map((r) => ({
            effective: r.effectiveDate ?? "—",
            prev: r.currentSalary ? formatAmount(Number.parseFloat(r.currentSalary)) : "—",
            new: r.newSalary ? formatAmount(Number.parseFloat(r.newSalary)) : "—",
            adjustment: r.salaryAdjustment ? formatAmount(Number.parseFloat(r.salaryAdjustment)) : "—",
            reason: r.reason ?? "—",
            approver: APPROVED_BY_OPTIONS.find((o) => o.value === r.approvedBy)?.label ?? r.approvedBy ?? "—",
            attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
          }))}
          rowIds={data.map((r) => r.id)}
          onDeleteRow={(id) => setPendingDeleteId(id)}
        />
      </div>

      {pendingDeleteId !== null && (
        <ConfirmDialog
          message={deleteError ?? "Delete this salary revision record? This cannot be undone."}
          confirmLabel={deleting ? "Deleting…" : "Delete"}
          onCancel={() => {
            setPendingDeleteId(null);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
  },
);

// Standalone wrapper for the Active stage's own "Salary Revision" tab, where
// this is the only content on the page and needs its own Edit/Save button —
// unlike Employee Record's Finance > Payroll/Payslip tab, which nests
// SalaryRevisionFields under its own single outer EditableSection instead
// (see EmployeeRecordPanels.tsx's PayrollPanel) so the whole tab shares one
// button rather than having two.
export function SalaryRevisionPanel({ userId, data }: { userId: number; data: SalaryRevisionEntry[] }) {
  const ref = useRef<SalaryRevisionHandle>(null);
  return (
    <EditableSection onSave={() => ref.current?.save()}>
      <SalaryRevisionFields ref={ref} userId={userId} data={data} />
    </EditableSection>
  );
}

export function PromotionPanel({ userId, data }: { userId: number; data: PromotionEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Promotion"
        addLabel="+ Add promotion record"
        fields={[
          { key: "promotionDate", label: "Promotion Date", type: "date" },
          { key: "effectiveDate", label: "Effective Date", type: "date" },
          { key: "currentPosition", label: "Current Position", type: "text" },
          { key: "newPosition", label: "New Position", type: "text" },
          { key: "reason", label: "Reason", type: "textarea", full: true },
          { key: "approvedBy", label: "Approved By", type: "text", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "effective", label: "Effective Date" },
          { key: "prev", label: "Previous Position" },
          { key: "new", label: "New Position" },
          { key: "reason", label: "Reason" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({
          effective: r.effectiveDate ?? "—",
          prev: r.currentPosition ?? "—",
          new: r.newPosition ?? "—",
          reason: r.reason ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values, files) =>
          addPromotion(userId, {
            promotionDate: values.promotionDate ?? "",
            effectiveDate: values.effectiveDate ?? "",
            currentPosition: values.currentPosition ?? "",
            newPosition: values.newPosition ?? "",
            reason: values.reason ?? "",
            approvedBy: values.approvedBy ?? "",
            attachmentFile: files.attachment ?? null,
          })
        }
        onDelete={(id) => deletePromotion(userId, id)}
      />
    </EditableSection>
  );
}

export function TransferPanel({ userId, data }: { userId: number; data: TransferEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Transfer"
        addLabel="+ Add transfer record"
        fields={[
          { key: "type", label: "Type", type: "text" },
          { key: "effectiveDate", label: "Effective Date", type: "date" },
          { key: "fromLocation", label: "From", type: "text" },
          { key: "toLocation", label: "To", type: "text" },
          { key: "reason", label: "Reason", type: "textarea", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "effective", label: "Effective Date" },
          { key: "type", label: "Type" },
          { key: "from", label: "From" },
          { key: "to", label: "To" },
          { key: "reason", label: "Reason" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({
          effective: r.effectiveDate ?? "—",
          type: r.type ?? "—",
          from: r.fromLocation ?? "—",
          to: r.toLocation ?? "—",
          reason: r.reason ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values, files) =>
          addTransfer(userId, {
            type: values.type ?? "",
            effectiveDate: values.effectiveDate ?? "",
            fromLocation: values.fromLocation ?? "",
            toLocation: values.toLocation ?? "",
            reason: values.reason ?? "",
            attachmentFile: files.attachment ?? null,
          })
        }
        onDelete={(id) => deleteTransfer(userId, id)}
      />
    </EditableSection>
  );
}

export function TrainingPanel({ userId, data }: { userId: number; data: TrainingEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Training"
        addLabel="+ Add training record"
        fields={[
          { key: "name", label: "Training Name", type: "text", full: true },
          { key: "date", label: "Date", type: "date" },
          { key: "status", label: "Status", type: "text" },
        ]}
        columns={[
          { key: "name", label: "Training Name" },
          { key: "date", label: "Date" },
          { key: "status", label: "Status" },
        ]}
        rows={data.map((r) => ({ name: r.name ?? "—", date: r.date ?? "—", status: r.status ?? "—" }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values) => addTraining(userId, { name: values.name ?? "", date: values.date ?? "", status: values.status ?? "" })}
        onDelete={(id) => deleteTraining(userId, id)}
      />
    </EditableSection>
  );
}

const NDA_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Expired", label: "Expired" },
  { value: "Pending", label: "Pending" },
];

// Stage-flow's Active > NDA tab shows NDA fields only (active_nda.html) —
// unlike Employee Record's combined "NDA/ NC" tab (NdaNcPanel below).
export function NdaPanel({ userId, data }: { userId: number; data: NdaInfo | null }) {
  const [signDate, setSignDate] = useState(data?.signDate ?? "");
  const [effectiveDate, setEffectiveDate] = useState(data?.effectiveDate ?? "");
  const [status, setStatus] = useState(data?.status ?? "");
  const [fileId, setFileId] = useState(data?.attachmentFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  return (
    <EditableSection
      onSave={() => updateNda(userId, { signDate, effectiveDate, status, attachmentFileId: fileId, attachmentFile: pendingFile })}
    >
      <PanelHeading>NDA</PanelHeading>
      <FieldGrid>
        <EditableField label="Signed Date" value={signDate} onChange={setSignDate} type="date" />
        <EditableField label="Effective Date" value={effectiveDate} onChange={setEffectiveDate} type="date" />
        <EditableSelectField label="Status" value={status} onChange={setStatus} options={NDA_STATUS_OPTIONS} full />
        <RealFileField label="Attachment" existingFileId={fileId} pendingFile={pendingFile} onPick={setPendingFile} onClear={clearFile} full />
      </FieldGrid>
    </EditableSection>
  );
}

// Stage-flow's Active > Non-Compete tab shows NC fields only
// (active_nonCompete.html) — unlike Employee Record's combined tab below.
export function NonCompetePanel({ userId, data }: { userId: number; data: NonCompeteInfo | null }) {
  const [signDate, setSignDate] = useState(data?.signDate ?? "");
  const [expiryDate, setExpiryDate] = useState(data?.expiryDate ?? "");
  const [duration, setDuration] = useState(data?.duration ?? "");
  const [fileId, setFileId] = useState(data?.attachmentFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  return (
    <EditableSection
      onSave={() => updateNonCompete(userId, { signDate, expiryDate, duration, attachmentFileId: fileId, attachmentFile: pendingFile })}
    >
      <PanelHeading>Non-Compete</PanelHeading>
      <FieldGrid>
        <EditableField label="Signed Date" value={signDate} onChange={setSignDate} type="date" />
        <EditableField label="Expiry Date" value={expiryDate} onChange={setExpiryDate} type="date" />
        <EditableField label="Duration" value={duration} onChange={setDuration} full />
        <RealFileField label="Attachment" existingFileId={fileId} pendingFile={pendingFile} onPick={setPendingFile} onClear={clearFile} full />
      </FieldGrid>
    </EditableSection>
  );
}

// Employee Record's HR Info > "NDA/ NC" tab — combines nda + non_compete
// into one Edit/Save cycle (hr_ndaNc.html shows both subsections on one
// page), same pattern as OnboardingPayrollPanel combining payroll +
// bank_details.
export function NdaNcPanel({
  userId,
  ndaData,
  nonCompeteData,
}: {
  userId: number;
  ndaData: NdaInfo | null;
  nonCompeteData: NonCompeteInfo | null;
}) {
  const [ndaSignDate, setNdaSignDate] = useState(ndaData?.signDate ?? "");
  const [ndaEffectiveDate, setNdaEffectiveDate] = useState(ndaData?.effectiveDate ?? "");
  const [ndaStatus, setNdaStatus] = useState(ndaData?.status ?? "");
  const [ndaFileId, setNdaFileId] = useState(ndaData?.attachmentFileId ?? null);
  const [ndaPending, setNdaPending] = useState<File | null>(null);

  const [ncSignDate, setNcSignDate] = useState(nonCompeteData?.signDate ?? "");
  const [ncExpiryDate, setNcExpiryDate] = useState(nonCompeteData?.expiryDate ?? "");
  const [ncDuration, setNcDuration] = useState(nonCompeteData?.duration ?? "");
  const [ncFileId, setNcFileId] = useState(nonCompeteData?.attachmentFileId ?? null);
  const [ncPending, setNcPending] = useState<File | null>(null);

  function clearNdaFile() {
    if (ndaPending) setNdaPending(null);
    else setNdaFileId(null);
  }
  function clearNcFile() {
    if (ncPending) setNcPending(null);
    else setNcFileId(null);
  }

  return (
    <EditableSection
      onSave={async () => {
        const [ndaResult, ncResult] = await Promise.all([
          updateNda(userId, {
            signDate: ndaSignDate,
            effectiveDate: ndaEffectiveDate,
            status: ndaStatus,
            attachmentFileId: ndaFileId,
            attachmentFile: ndaPending,
          }),
          updateNonCompete(userId, {
            signDate: ncSignDate,
            expiryDate: ncExpiryDate,
            duration: ncDuration,
            attachmentFileId: ncFileId,
            attachmentFile: ncPending,
          }),
        ]);
        if (!ndaResult.ok) return ndaResult;
        if (!ncResult.ok) return ncResult;
        return { ok: true };
      }}
    >
      <PanelHeading>NDA/ NC</PanelHeading>
      <Subsection heading="NDA">
        <EditableField label="Signed Date" value={ndaSignDate} onChange={setNdaSignDate} type="date" />
        <EditableField label="Effective Date (Optional)" value={ndaEffectiveDate} onChange={setNdaEffectiveDate} type="date" />
        <EditableSelectField label="Status" value={ndaStatus} onChange={setNdaStatus} options={NDA_STATUS_OPTIONS} full />
        <RealFileField label="Attachment" existingFileId={ndaFileId} pendingFile={ndaPending} onPick={setNdaPending} onClear={clearNdaFile} full />
      </Subsection>
      <Subsection heading="Non-Compete (NC)">
        <EditableField label="Signed Date" value={ncSignDate} onChange={setNcSignDate} type="date" />
        <EditableField label="Expiry Date" value={ncExpiryDate} onChange={setNcExpiryDate} type="date" />
        <EditableField label="Duration" value={ncDuration} onChange={setNcDuration} full />
        <RealFileField label="Attachment" existingFileId={ncFileId} pendingFile={ncPending} onPick={setNcPending} onClear={clearNcFile} full />
      </Subsection>
    </EditableSection>
  );
}

// Stage-flow's Active > Disciplinary tab is a single read-only combined
// summary (Date/Type/Description) per active_disciplinary.html — no add
// form here; the 4 specific record types (Domestic Inquiry/Suspension/
// Showcause/PIP) each get their own real add-form under Employee Record's
// Disciplinary category instead (see EmployeeRecordPanels.tsx).
export function DisciplinarySummaryPanel({ data }: { data: DisciplinarySummaryRow[] }) {
  return (
    <div>
      <PanelHeading>Disciplinary</PanelHeading>
      <RecordTable
        columns={[
          { key: "date", label: "Date" },
          { key: "type", label: "Type" },
          { key: "description", label: "Description" },
        ]}
        rows={data.map((r) => ({ date: r.date ?? "—", type: r.type, description: r.description ?? "—" }))}
      />
      <p className="mt-3 text-xs text-slate-500">
        Full disciplinary records (Domestic Inquiry, Suspension, Showcause/Warning, PIP) are added from this
        employee&apos;s Employee Record &gt; Disciplinary section.
      </p>
    </div>
  );
}

// ─── Disciplinary's 4 sub-tables — Employee Record's Disciplinary category
// only (no per-type add form in the stage-flow, see DisciplinarySummaryPanel
// above). Field configs match js/disciplinary-record.js's CONFIGS map. ───

export function DomesticInquiryPanel({ userId, data }: { userId: number; data: DomesticInquiryEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Domestic Inquiry"
        addLabel="+ Add a domestic inquiry record"
        fields={[
          { key: "date", label: "Inquiry Date", type: "date", full: true },
          { key: "panel", label: "Panel", type: "text", full: true },
          { key: "caseSummary", label: "Case Summary", type: "textarea", full: true },
          { key: "decision", label: "Decision", type: "text", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "date", label: "Date" },
          { key: "panel", label: "Panel" },
          { key: "decision", label: "Decision" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({
          date: r.date ?? "—",
          panel: r.panel ?? "—",
          decision: r.decision ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values, files) =>
          addDomesticInquiry(userId, {
            date: values.date ?? "",
            panel: values.panel ?? "",
            caseSummary: values.caseSummary ?? "",
            decision: values.decision ?? "",
            attachmentFile: files.attachment ?? null,
          })
        }
        onDelete={(id) => deleteDomesticInquiry(userId, id)}
      />
    </EditableSection>
  );
}

export function SuspensionPanel({ userId, data }: { userId: number; data: SuspensionLetterEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Suspension Letter"
        addLabel="+ Add a suspension letter record"
        fields={[
          { key: "startDate", label: "Suspension Start", type: "date" },
          { key: "endDate", label: "Suspension End", type: "date" },
          { key: "type", label: "Suspension Type", type: "text", full: true },
          { key: "reason", label: "Reason", type: "textarea", full: true },
          { key: "issuedBy", label: "Issued by", type: "text", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "start", label: "Suspension Start" },
          { key: "end", label: "Suspension End" },
          { key: "type", label: "Type" },
          { key: "issuedBy", label: "Issued By" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({
          start: r.startDate ?? "—",
          end: r.endDate ?? "—",
          type: r.type ?? "—",
          issuedBy: r.issuedBy ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values, files) =>
          addSuspensionLetter(userId, {
            startDate: values.startDate ?? "",
            endDate: values.endDate ?? "",
            type: values.type ?? "",
            reason: values.reason ?? "",
            issuedBy: values.issuedBy ?? "",
            attachmentFile: files.attachment ?? null,
          })
        }
        onDelete={(id) => deleteSuspensionLetter(userId, id)}
      />
    </EditableSection>
  );
}

export function ShowcausePanel({ userId, data }: { userId: number; data: ShowcauseWarningLetterEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Showcause/ Warning Letter"
        addLabel="+ Add a showcause/warning letter record"
        fields={[
          { key: "type", label: "Case Type", type: "text" },
          { key: "date", label: "Issued Date", type: "date" },
          { key: "issuedBy", label: "Issued by", type: "text" },
          { key: "status", label: "Status", type: "text" },
          { key: "reason", label: "Reason", type: "textarea", full: true },
          { key: "empResponse", label: "Employee Responses", type: "textarea", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "date", label: "Issued Date" },
          { key: "type", label: "Case Type" },
          { key: "status", label: "Status" },
          { key: "issuedBy", label: "Issued By" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({
          date: r.date ?? "—",
          type: r.type ?? "—",
          status: r.status ?? "—",
          issuedBy: r.issuedBy ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values, files) =>
          addShowcauseWarningLetter(userId, {
            type: values.type ?? "",
            date: values.date ?? "",
            issuedBy: values.issuedBy ?? "",
            status: values.status ?? "",
            reason: values.reason ?? "",
            empResponse: values.empResponse ?? "",
            attachmentFile: files.attachment ?? null,
          })
        }
        onDelete={(id) => deleteShowcauseWarningLetter(userId, id)}
      />
    </EditableSection>
  );
}

export function PipPanel({ userId, data }: { userId: number; data: PipEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Performance Improvement Plan"
        addLabel="+ Add a PIP record"
        fields={[
          { key: "startDate", label: "Start Date", type: "date" },
          { key: "endDate", label: "End Date", type: "date" },
          { key: "supervisor", label: "Supervisor", type: "text" },
          { key: "reviewResult", label: "Review Result", type: "text" },
          { key: "improvementGoal", label: "Improvement Goals", type: "textarea", full: true },
          { key: "remark", label: "Remarks", type: "text", full: true },
        ]}
        columns={[
          { key: "start", label: "Start Date" },
          { key: "end", label: "End Date" },
          { key: "supervisor", label: "Supervisor" },
          { key: "result", label: "Review Result" },
        ]}
        rows={data.map((r) => ({
          start: r.startDate ?? "—",
          end: r.endDate ?? "—",
          supervisor: r.supervisor ?? "—",
          result: r.reviewResult ?? "—",
        }))}
        rowIds={data.map((r) => r.id)}
        onAdd={(values) =>
          addPip(userId, {
            startDate: values.startDate ?? "",
            endDate: values.endDate ?? "",
            supervisor: values.supervisor ?? "",
            reviewResult: values.reviewResult ?? "",
            improvementGoal: values.improvementGoal ?? "",
            remark: values.remark ?? "",
          })
        }
        onDelete={(id) => deletePip(userId, id)}
      />
    </EditableSection>
  );
}

// ─── Exit's 3 singleton tabs (resignation/reference_letter/
// exit_interview_note) — Exit stage-flow only, no Employee Record equivalent
// (mirrors probation's own placement). Resignation Letter/Acceptance Letter/
// Issued Letter route to GOOGLE_DRIVE_LETTER_FOLDER_ID, same shared "letters"
// folder as probation's confirmation/extension letters and (per this task)
// suspension/showcause letters. ───

export function ResignationPanel({ userId, data }: { userId: number; data: ResignationInfo | null }) {
  const [submissionDate, setSubmissionDate] = useState(data?.submissionDate ?? "");
  const [lastWorkingDate, setLastWorkingDate] = useState(data?.lastWorkingDate ?? "");
  const [reason, setReason] = useState(data?.reason ?? "");
  const [resignLetterFileId, setResignLetterFileId] = useState(data?.resignLetterFileId ?? null);
  const [pendingResignLetter, setPendingResignLetter] = useState<File | null>(null);
  const [acceptLetterFileId, setAcceptLetterFileId] = useState(data?.acceptLetterFileId ?? null);
  const [pendingAcceptLetter, setPendingAcceptLetter] = useState<File | null>(null);

  function clearResignLetter() {
    if (pendingResignLetter) setPendingResignLetter(null);
    else setResignLetterFileId(null);
  }
  function clearAcceptLetter() {
    if (pendingAcceptLetter) setPendingAcceptLetter(null);
    else setAcceptLetterFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updateResignation(userId, {
          submissionDate,
          lastWorkingDate,
          reason,
          resignLetterFileId,
          resignLetterFile: pendingResignLetter,
          acceptLetterFileId,
          acceptLetterFile: pendingAcceptLetter,
        })
      }
    >
      <PanelHeading>Resignation</PanelHeading>
      <FieldGrid>
        <EditableField label="Submission Date" value={submissionDate} onChange={setSubmissionDate} type="date" />
        <EditableField label="Last Working Date" value={lastWorkingDate} onChange={setLastWorkingDate} type="date" />
        <EditableTextArea label="Reason" value={reason} onChange={setReason} full />
        <RealFileField
          label="Resignation Letter"
          existingFileId={resignLetterFileId}
          pendingFile={pendingResignLetter}
          onPick={setPendingResignLetter}
          onClear={clearResignLetter}
        />
        <RealFileField
          label="Acceptance Letter"
          existingFileId={acceptLetterFileId}
          pendingFile={pendingAcceptLetter}
          onPick={setPendingAcceptLetter}
          onClear={clearAcceptLetter}
        />
      </FieldGrid>
    </EditableSection>
  );
}

const REFERENCE_LETTER_TYPE_OPTIONS = [
  { value: "employment", label: "Employment Confirmation" },
  { value: "reference", label: "Character Reference" },
  { value: "service", label: "Service / Experience Letter" },
];

export function ReferenceLetterPanel({ userId, data }: { userId: number; data: ReferenceLetterInfo | null }) {
  const [requestDate, setRequestDate] = useState(data?.requestDate ?? "");
  const [type, setType] = useState(data?.type ?? "");
  const [issuedDate, setIssuedDate] = useState(data?.issuedDate ?? "");
  const [issuedBy, setIssuedBy] = useState(data?.issuedBy ?? "");
  const [remark, setRemark] = useState(data?.remark ?? "");
  const [fileId, setFileId] = useState(data?.issuedLetterFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updateReferenceLetter(userId, {
          requestDate,
          type,
          issuedDate,
          issuedBy,
          remark,
          issuedLetterFileId: fileId,
          issuedLetterFile: pendingFile,
        })
      }
    >
      <PanelHeading>Reference Letter</PanelHeading>
      <FieldGrid>
        <EditableField label="Request Date" value={requestDate} onChange={setRequestDate} type="date" />
        <EditableSelectField label="Letter Type" value={type} onChange={setType} options={REFERENCE_LETTER_TYPE_OPTIONS} />
        <EditableField label="Issued Date" value={issuedDate} onChange={setIssuedDate} type="date" />
        <EditableField label="Issued By" value={issuedBy} onChange={setIssuedBy} />
        <EditableTextArea label="Remarks" value={remark} onChange={setRemark} full />
        <RealFileField label="Issued Letter" existingFileId={fileId} pendingFile={pendingFile} onPick={setPendingFile} onClear={clearFile} />
      </FieldGrid>
    </EditableSection>
  );
}

const EXIT_REASON_OPTIONS = [
  { value: "career", label: "Career Advancement" },
  { value: "compensation", label: "Compensation" },
  { value: "relocation", label: "Relocation" },
  { value: "personal", label: "Personal Reasons" },
  { value: "other", label: "Other" },
];

export function ExitInterviewNotesPanel({ userId, data }: { userId: number; data: ExitInterviewNoteInfo | null }) {
  const [date, setDate] = useState(data?.date ?? "");
  const [interviewer, setInterviewer] = useState(data?.interviewer ?? "");
  const [reason, setReason] = useState(data?.reason ?? "");
  const [note, setNote] = useState(data?.note ?? "");

  return (
    <EditableSection onSave={() => updateExitInterviewNote(userId, { date, interviewer, reason, note })}>
      <PanelHeading>Exit Interview Notes</PanelHeading>
      <FieldGrid>
        <EditableField label="Interview Date" value={date} onChange={setDate} type="date" />
        <EditableField label="Interviewer" value={interviewer} onChange={setInterviewer} />
        <EditableSelectField label="Primary Reason for Leaving" value={reason} onChange={setReason} options={EXIT_REASON_OPTIONS} full />
        <EditableTextArea label="Feedback / Notes" value={note} onChange={setNote} full />
      </FieldGrid>
    </EditableSection>
  );
}

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

// Matches pinfo_personalInfo.html's/pre_PersonalInfo.html's exact field set:
// Full Name, Date of Birth, Gender, IC/Passport No., Email, Phone Number,
// Home Address, +Signed Offer Letter (Pre-stage's own intake form only —
// Employee Record's Personal Info tab doesn't show it, so it's opt-in via
// showOfferLetter). Same user_profile-backed component, same updatePersonalInfo
// action, used both by Employee Record's Personal Info tab AND the stage-flow's
// Pre "Personal Info" section (+ every later stage's "P. Info" history tab) —
// one real data source for both places an employee's personal info shows up,
// per the confirmed pinfo_personalInfo.html field list (no Nickname/
// Nationality field exists there — real user_profile columns, just not shown
// here). Full Name/Email are real but deliberately non-editable (name changes
// and email affect login) — FieldDisplay, not a PlaceholderField, since the
// data itself is real. Signed Offer Letter has no matching column anywhere —
// stays a PlaceholderUploadField.
export function PersonalInfoPanel({
  employee,
  employeeId,
  showOfferLetter = false,
}: {
  employee: EmployeeDetailFull;
  employeeId: number;
  showOfferLetter?: boolean;
}) {
  const [dob, setDob] = useState(employee.dob ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [gender, setGender] = useState(employee.gender ?? "");
  const [nric, setNric] = useState(employee.nric ?? "");
  const [homeAddress, setHomeAddress] = useState(employee.homeAddress ?? "");

  return (
    <EditableSection onSave={() => updatePersonalInfo(employeeId, { dob, phone, gender, nric, homeAddress })}>
      <PanelHeading>Personal Info</PanelHeading>
      <FieldGrid>
        <FieldDisplay label="Full Name" value={employee.fullName} />
        <EditableField label="Date of Birth" value={dob} onChange={setDob} type="date" />
        <EditableSelectField label="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} />
        <EditableField label="IC/ Passport No." value={nric} onChange={setNric} />
        <FieldDisplay label="Email" value={employee.email} />
        <EditableField label="Phone Number" value={phone} onChange={setPhone} />
        <EditableField label="Home Address" value={homeAddress} onChange={setHomeAddress} full />
        {showOfferLetter && <PlaceholderUploadField label="Signed Offer Letter" full />}
      </FieldGrid>
    </EditableSection>
  );
}

// Shared across Onboarding's "Emergency Contact" section and Employee
// Record's Personal Info > Emergency Contact — same emergency_contact table.
// Name/Phone/Relationship are real columns (lifted state, persisted on
// Save); Email and Address are UI-only placeholders — emergency_contact has
// no email/address column today, so nothing typed into them is saved. Adding
// them would need two new nullable varchar columns on emergency_contact.
export function EmergencyContactPanel({
  employee,
  onSave,
}: {
  employee: EmployeeDetailFull;
  onSave: (data: {
    name: string;
    phone: string;
    relation: string;
    email: string;
    address: string;
  }) => Promise<{ ok: boolean; error?: string } | void>;
}) {
  const [name, setName] = useState(employee.emergencyName ?? "");
  const [phone, setPhone] = useState(employee.emergencyPhone ?? "");
  const [relation, setRelation] = useState(employee.emergencyRelation ?? "");
  const [email, setEmail] = useState(employee.emergencyEmail ?? "");
  const [address, setAddress] = useState(employee.emergencyAddress ?? "");

  return (
    <EditableSection onSave={() => onSave({ name, phone, relation, email, address })}>
      <PanelHeading>Emergency Contact</PanelHeading>
      <FieldGrid>
        <EditableField label="Contact Name" value={name} onChange={setName} />
        <EditableField label="Relationship" value={relation} onChange={setRelation} />
        <EditableField label="Phone Number" value={phone} onChange={setPhone} />
        <EditableField label="Email" value={email} onChange={setEmail} type="email" />
        <EditableField label="Address" value={address} onChange={setAddress} full />
      </FieldGrid>
    </EditableSection>
  );
}

export {
  PanelHeading,
  SubsectionHeading,
  FieldGrid,
  Subsection,
  RecordTable,
  Checklist,
  FieldDisplay,
  EditableField,
  EditableSelectField,
  EditableTextArea,
  PlaceholderField,
  PlaceholderSelectField,
  PlaceholderTextArea,
  PlaceholderUploadField,
};
