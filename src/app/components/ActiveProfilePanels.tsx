"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EditableSection, useEditMode, type SaveResult } from "@/app/components/EditMode";
import { POSITION_OPTIONS } from "@/lib/employeeStages";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  updatePersonalInfo,
  updateResume,
  updateInterviewAssessment,
  updateReferenceCheck,
  updateMedicalCheck,
  updateProbationInfo,
  decideProbationOutcome,
  updateDocuments,
  updatePayroll,
  updateBankDetails,
  addAchievement,
  updateAchievement,
  deleteAchievement,
  addSalaryRevision,
  updateSalaryRevision,
  deleteSalaryRevision,
  addPromotion,
  updatePromotion,
  deletePromotion,
  addTransfer,
  updateTransfer,
  deleteTransfer,
  addTraining,
  updateTraining,
  deleteTraining,
  updateNda,
  updateNonCompete,
  addDomesticInquiry,
  updateDomesticInquiry,
  deleteDomesticInquiry,
  addSuspensionLetter,
  updateSuspensionLetter,
  deleteSuspensionLetter,
  addShowcauseWarningLetter,
  updateShowcauseWarningLetter,
  deleteShowcauseWarningLetter,
  addPip,
  updatePip,
  deletePip,
  updateResignation,
  updateReferenceLetter,
  updateExitInterviewNote,
} from "@/lib/employeeRecordActions";
import type {
  EmployeeDetailFull,
  BranchOpt,
  DepartmentOpt,
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
import type { ProbationDisplayInfo } from "@/lib/probationDecision";
import {
  COUNTRY_CODES,
  parsePhoneValue,
  formatLocalDigits,
  composePhoneValue,
  isValidPhoneDigits,
  isValidEmail,
} from "@/lib/phoneEmail";

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

// pr-24 clears space for EditableSection's Edit/Save button, which is
// absolutely positioned at top-0 right-0 of the same wrapper — without it, a
// heading long enough to reach that corner (easily happens once the content
// column is full-width on mobile, not sharing space with the sidebar/nav
// rail) visually collides with the button text.
function PanelHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold text-[#4b4949d6] mb-6 pr-24 sm:pr-0">{children}</h2>;
}

function SubsectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-semibold text-[#4b4949d6] mb-4">{children}</h3>;
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">{children}</div>;
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {value ? <span className={valueClass}>{value}</span> : <span className={emptyClass}>Not provided</span>}
    </div>
  );
}

// Small label-over-value display for a profile summary block (e.g. the stage
// profile sidebar's Branch/Dept, Position, Phone Number, Email) — shared here
// so Employee Record's own profile header can match that exact style.
function SidebarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full">
      <span className="block text-xs text-[#4b4949]">{label}</span>
      <span className="block text-sm text-[#4b4949] truncate">{children}</span>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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

// Shared Phone Number field — country-code prefix picker (defaulting to
// +60 Malaysia) + auto-formatted local number ("XX-NNNN NNN..."), used by
// every Phone Number/Contact Number field across Personal Info/Guardian
// Info/Emergency Contact/Reference Check. Storage stays the single combined
// string it's always been ("+60 12-4680 797") — parsePhoneValue splits it
// back into a country code + digits for editing, composePhoneValue joins
// them again on every change. Validated on blur (not on every keystroke, so
// a half-typed number doesn't show an error while still being entered).
function PhoneField({
  label,
  value,
  onChange,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  const editing = useEditMode();
  const parsed = parsePhoneValue(value);
  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [digits, setDigits] = useState(parsed.digits);
  const [touched, setTouched] = useState(false);

  function commit(nextCountryCode: string, nextDigits: string) {
    setCountryCode(nextCountryCode);
    setDigits(nextDigits);
    onChange(composePhoneValue(nextCountryCode, nextDigits));
  }

  const invalid = touched && digits.length > 0 && !isValidPhoneDigits(digits);

  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <>
          <div
            className={`flex items-stretch h-11 rounded-[10px] bg-[#f0f0f0a6] overflow-hidden focus-within:outline focus-within:outline-2 ${
              invalid ? "outline outline-2 outline-red-500" : "focus-within:outline-blue-500"
            }`}
          >
            <select
              value={countryCode}
              onChange={(e) => commit(e.target.value, digits)}
              aria-label={`${label} country code`}
              className="basis-1/4 min-w-0 bg-transparent border-0 border-r border-black/10 pl-3 pr-1 text-sm text-[#4b4949] focus:outline-none"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code} title={c.name}>
                  {c.code} {c.abbr}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="numeric"
              value={formatLocalDigits(digits)}
              onChange={(e) => commit(countryCode, e.target.value.replace(/\D/g, "").slice(0, 11))}
              onBlur={() => setTouched(true)}
              className="basis-3/4 min-w-0 px-3 text-sm text-[#4b4949] bg-transparent focus:outline-none"
            />
          </div>
          {invalid && <span className="text-xs text-red-600">Enter a valid phone number.</span>}
        </>
      ) : value ? (
        <span className={valueClass}>{composePhoneValue(parsed.countryCode, parsed.digits)}</span>
      ) : (
        <span className={emptyClass}>Not provided</span>
      )}
    </div>
  );
}

// Shared Email field — same view/edit split as EditableField, plus format
// validation (must look like name@domain.tld) shown on blur.
function EmailField({
  label,
  value,
  onChange,
  full = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  const editing = useEditMode();
  const [touched, setTouched] = useState(false);
  const invalid = touched && value.length > 0 && !isValidEmail(value);

  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <>
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            className={`${inputClass} ${invalid ? "outline outline-2 outline-red-500" : ""}`}
          />
          {invalid && <span className="text-xs text-red-600">Enter a valid email address.</span>}
        </>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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

// Generic "dropdown + free-text fallback" field for persistent (non-modal)
// form panels whose dropdown includes an "Other" sentinel option (Emergency
// Contact's Relationship, Guardian Info's Relationship). Unlike
// RepeatableRecordSection's own modal-based Others handling (edit-only
// context, no separate read view to worry about), these panels have a real
// read-only display too — so callers keep `value` as either a known option's
// own value or the sentinel (never the raw specify text) and `otherText` as
// the specify text; read mode shows otherText itself when value is the
// sentinel, never the generic "Other" label.
function SelectWithOtherField({
  label,
  value,
  otherText,
  onValueChange,
  onOtherTextChange,
  options,
  otherSentinel,
  full = false,
}: {
  label: string;
  value: string;
  otherText: string;
  onValueChange: (v: string) => void;
  onOtherTextChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  otherSentinel: string;
  full?: boolean;
}) {
  const editing = useEditMode();
  const isOther = value === otherSentinel;
  const displayText = isOther ? otherText : options.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
        <span className={labelClass}>{label}</span>
        {editing ? (
          <select value={value} onChange={(e) => onValueChange(e.target.value)} className={inputClass}>
            <option value=""></option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : displayText ? (
          <span className={valueClass}>{displayText}</span>
        ) : (
          <span className={emptyClass}>Not provided</span>
        )}
      </div>
      {editing && isOther && (
        <EditableField label={`Please specify ${label.toLowerCase()}`} value={otherText} onChange={onOtherTextChange} full={full} />
      )}
    </>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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
      <div className="flex items-center gap-1 min-w-0">
        <a href={url} target="_blank" rel="noopener noreferrer" className={`${valueClass} hover:underline`}>
          {file.name}
        </a>
        {editing && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${file.name}`}
            className="shrink-0 p-2 text-slate-400 hover:text-red-600 text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  if (!editing) return <span className={emptyClass}>Not provided</span>;

  return (
    <label className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg border-2 border-dashed border-[#b9c4d6] bg-[#f7f9fc] px-4 py-2 text-sm text-[#6b7280] cursor-pointer hover:border-[#4a90e2] hover:bg-[#eef4fd]">
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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

  function handleSave() {
    if (contactNumber && !isValidPhoneDigits(parsePhoneValue(contactNumber).digits)) {
      return { ok: false, error: "Enter a valid phone number." };
    }
    if (email && !isValidEmail(email)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    return updateReferenceCheck(userId, { refName, company, relationship, position, contactNumber, email });
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>Reference Check</PanelHeading>
      <FieldGrid>
        <EditableField label="Reference Name" value={refName} onChange={setRefName} full />
        <EditableField label="Company" value={company} onChange={setCompany} full />
        <EditableField label="Relationship" value={relationship} onChange={setRelationship} />
        <EditableField label="Position" value={position} onChange={setPosition} />
        <PhoneField label="Contact Number" value={contactNumber} onChange={setContactNumber} full />
        <EmailField label="Email" value={email} onChange={setEmail} full />
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

// Always-read-only field (unlike EditableField, ignores the panel's own
// edit-mode toggle) — for values sourced from ebright_hrfs (BranchStaff/
// career_applications) that must never become editable just because the
// panel's other, still-local fields (Confirmation Date, letters) are being
// edited. Same visual shape as EditableField's own read view.
function StaticField({ label, value, full = false }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {value ? <span className={`${valueClass} whitespace-pre-wrap`}>{value}</span> : <span className={emptyClass}>Not provided</span>}
    </div>
  );
}

const PROBATION_STATUS_PILL_CLASSES: Record<string, string> = {
  Confirm: "bg-emerald-100 text-emerald-700",
  Stop: "bg-red-100 text-red-700",
  Extended: "bg-amber-100 text-amber-700",
  "In Progress": "bg-slate-100 text-slate-600",
};

// Real probation table — Probation stage's own tab only (no Employee Record
// equivalent in the mock). confirmationLetter*/extensionLetter* are
// independent Google Drive file fields, same pattern as resume.resume_file_id.
// Start Date/End Date/Probation Status/Feedback are read-only here now (see
// probationDecision.ts) — sourced from ebright_hrfs, not this panel's own
// editable form; Confirmation Date/Extension End Date and the two letters
// stay locally editable as before. canDecide (HR/Superadmin only, per
// explicit decision — see conversation) gates the Confirm/Extend/Stop
// buttons; the actual restriction is enforced server-side in
// decideProbationOutcome regardless of what this prop says.
export function ProbationPanel({
  userId,
  data,
  display,
  canDecide,
}: {
  userId: number;
  data: ProbationInfo | null;
  display: ProbationDisplayInfo;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [confirmDate, setConfirmDate] = useState(data?.confirmDate ?? "");
  const [extEndDate, setExtEndDate] = useState(data?.extEndDate ?? "");
  const [confirmationLetterFileId, setConfirmationLetterFileId] = useState(data?.confirmationLetterFileId ?? null);
  const [confirmationLetterPending, setConfirmationLetterPending] = useState<File | null>(null);
  const [extensionLetterFileId, setExtensionLetterFileId] = useState(data?.extensionLetterFileId ?? null);
  const [extensionLetterPending, setExtensionLetterPending] = useState<File | null>(null);

  const [pendingOutcome, setPendingOutcome] = useState<"Confirmed" | "Extended" | "Stopped" | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  function clearConfirmationLetter() {
    if (confirmationLetterPending) setConfirmationLetterPending(null);
    else setConfirmationLetterFileId(null);
  }
  function clearExtensionLetter() {
    if (extensionLetterPending) setExtensionLetterPending(null);
    else setExtensionLetterFileId(null);
  }

  async function confirmOutcome() {
    if (!pendingOutcome) return;
    setDeciding(true);
    setDecideError(null);
    const result = await decideProbationOutcome(userId, pendingOutcome);
    setDeciding(false);
    setPendingOutcome(null);
    if (result.ok) router.refresh();
    else setDecideError(result.error ?? "Failed to record probation decision.");
  }

  const OUTCOME_MESSAGE: Record<"Confirmed" | "Extended" | "Stopped", string> = {
    Confirmed: "Confirm this employee's probation? Full-Time employees move straight to Active, out of Probation and Onboarding.",
    Extended: "Extend this employee's probation?",
    Stopped: "Stop this employee's probation? They stay in Probation stage, shown as \"Stop\".",
  };

  return (
    <>
      <EditableSection
        onSave={async () => {
          const result = await updateProbationInfo(userId, {
            confirmDate,
            extEndDate,
            confirmationLetterFileId,
            confirmationLetterFile: confirmationLetterPending,
            extensionLetterFileId,
            extensionLetterFile: extensionLetterPending,
          });
          if (!result || result.ok !== false) router.refresh();
          return result;
        }}
      >
        <PanelHeading>Probation</PanelHeading>
        <FieldGrid>
          <StaticField label="Start Date" value={display.startDate} />
          <StaticField label="End Date" value={display.endDate} />
          <div className="flex flex-col gap-1 min-w-0">
            <span className={labelClass}>Probation Status</span>
            <span
              className={`self-start inline-block px-3 py-1 rounded-full text-xs font-medium ${
                PROBATION_STATUS_PILL_CLASSES[display.displayStatus] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {display.displayStatus}
            </span>
          </div>
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
          <StaticField label="Feedback" value={display.feedback2} full />
        </FieldGrid>
      </EditableSection>

      {canDecide && (
        <div className="mt-6 pt-6 border-t border-black/10">
          <SubsectionHeading>Probation Decision</SubsectionHeading>
          {display.decidedByName && (
            <p className="text-xs text-slate-500 mb-3">
              Last decided by {display.decidedByName}
              {display.decidedAt ? ` on ${new Date(display.decidedAt).toLocaleDateString()}` : ""}.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setPendingOutcome("Confirmed")}
              className="min-h-10 rounded-lg px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setPendingOutcome("Extended")}
              className="min-h-10 rounded-lg px-4 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
            >
              Extend
            </button>
            <button
              type="button"
              onClick={() => setPendingOutcome("Stopped")}
              className="min-h-10 rounded-lg px-4 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              Stop
            </button>
          </div>
          {decideError && <p className="mt-2 text-sm text-red-600">{decideError}</p>}
        </div>
      )}

      {pendingOutcome && !deciding && (
        <ConfirmDialog
          message={OUTCOME_MESSAGE[pendingOutcome]}
          confirmLabel={pendingOutcome === "Confirmed" ? "Confirm" : pendingOutcome === "Extended" ? "Extend" : "Stop"}
          onCancel={() => setPendingOutcome(null)}
          onConfirm={confirmOutcome}
        />
      )}
    </>
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
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
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
  onRowClick,
}: {
  columns: RecordColumn[];
  rows: Array<Record<string, ReactNode>>;
  /** Parallel to `rows` — required only when onDeleteRow is provided. */
  rowIds?: number[];
  addLabel?: string;
  onDeleteRow?: (id: number) => void;
  /** Opens that row for editing (index into `rows`/`rowIds`) — only wired
   *  while in edit mode (see RepeatableRecordSection), so rows aren't
   *  clickable while just viewing. */
  onRowClick?: (index: number) => void;
}) {
  const editing = useEditMode();
  const showDeleteColumn = !!onDeleteRow && editing;
  const rowsClickable = !!onRowClick && editing;
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
                <tr
                  key={rowIds?.[i] ?? i}
                  onClick={rowsClickable ? () => onRowClick(i) : undefined}
                  className={rowsClickable ? "cursor-pointer hover:bg-[#f0f4fa]" : undefined}
                >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRow(rowIds[i]);
                          }}
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
          className="inline-flex min-h-11 items-center gap-1.5 mt-4 px-[18px] py-2 rounded-[10px] border-0 bg-[#d9fd63a8] text-sm font-medium text-[#5c6b0a] hover:bg-[#d9fd63]"
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
  type: "text" | "date" | "textarea" | "file" | "select";
  full?: boolean;
  /** Flat option list — required when type is "select" unless optionGroups is set. */
  options?: { value: string; label: string }[];
  /** Grouped option list (rendered as <optgroup>s) — takes priority over
   *  `options` when both are set (e.g. Transfer's From/To: Branch group +
   *  Department group, instead of one flattened list). */
  optionGroups?: { label: string; options: { value: string; label: string }[] }[];
  /** Pre-fills the field on modal open (e.g. Promotion's "Current Position"
   *  auto-populated from the employee's position on record) — only applies
   *  once, when the modal's own local values state is first initialized. */
  defaultValue?: string;
  /** Field only renders while this returns true for the modal's current
   *  values (e.g. Transfer's End Date, shown only when Type is "Temporary
   *  Transfer"). Omit to always render. */
  visibleWhen?: (values: Record<string, string>) => boolean;
}

// A row's raw field-key -> value map, matching RecordField.key — used to
// pre-fill RecordAddModal when editing an existing record rather than
// adding a new one. Distinct from a table row's own `Record<string,
// ReactNode>` (already display-formatted: dates as shown, position values
// resolved to labels, JSX links for attachments, ...) — editValues carries
// the raw values the form's own fields expect (e.g. the option's `value`,
// not its `label`).
export type RecordEditValues = Record<string, string>;

const recordModalInputClass =
  "h-11 rounded-[10px] bg-[#f0f0f0a6] border-0 px-3.5 text-sm text-[#4b4949] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

function RecordAddModal({
  title,
  fields,
  saving,
  error,
  initialValues,
  initialFileIds,
  onClose,
  onSave,
}: {
  title: string;
  fields: RecordField[];
  saving: boolean;
  error: string | null;
  /** When editing an existing record, its current raw field values — takes
   *  priority over each field's own `defaultValue` (which only makes sense
   *  for a brand-new add). Omit for the "add new" case. */
  initialValues?: RecordEditValues;
  /** When editing, the existing saved attachment id per file-type field key
   *  (e.g. { attachment: "abc123" }) — shown as a "View file" link until
   *  replaced with a new pick. Omit for the "add new" case. */
  initialFileIds?: Record<string, string | null>;
  onClose: () => void;
  onSave: (values: Record<string, string>, files: Record<string, File>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue as string])),
    ...initialValues,
  }));
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
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* flex-col + the header/footer as shrink-0 siblings around a scrolling
          middle section — on a short mobile viewport (or landscape, where
          vertical space is tightest) the field list scrolls internally while
          the title and Save/Cancel stay reachable without hunting through a
          long page-level scroll. max-h matches the overlay's own p-4 so the
          modal never touches the viewport edge on small screens. */}
      <div className="relative flex w-full max-w-[560px] max-h-[calc(100vh-32px)] flex-col box-border bg-white rounded-2xl shadow-[0_12px_32px_0_#00000026] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-[#4b4949d6]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[#4b4949a3] hover:bg-[#f0f4fa] hover:text-[#4b4949]"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-7">
          {/* Single column below the sm breakpoint (phones) so labels/inputs
              never get squeezed into an unreadably narrow half-width column;
              2 columns from sm (640px) up, where a ~560px modal still leaves
              each column comfortably wide (phone landscape and tablet). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
            {fields.filter((f) => (f.visibleWhen ? f.visibleWhen(values) : true)).map((f) => (
              <div key={f.key} className={`flex flex-col gap-2 min-w-0 ${f.full ? "sm:col-span-2" : ""}`}>
                <label className="text-sm font-medium text-[#4b4949]">{f.label}</label>
                {f.type === "textarea" ? (
                  <textarea
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    rows={3}
                    className={`${recordModalInputClass} h-auto py-2.5 resize-y`}
                  />
                ) : f.type === "file" ? (
                  files[f.key] || !initialFileIds?.[f.key] ? (
                    <FilePickerControl file={files[f.key] ?? null} onChange={(file) => setFileField(f.key, file)} editing />
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <RealAttachmentLink fileId={initialFileIds[f.key]} />
                      <label className="shrink-0 text-xs text-[#4a90e2] hover:underline cursor-pointer">
                        <input type="file" className="hidden" onChange={(e) => setFileField(f.key, e.target.files?.[0] ?? null)} />
                        Replace
                      </label>
                    </div>
                  )
                ) : f.type === "select" ? (
                  <select value={values[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} className={recordModalInputClass}>
                    <option value=""></option>
                    {f.optionGroups
                      ? f.optionGroups.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                  </select>
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
        </div>
        <div className="flex shrink-0 justify-end gap-3 px-5 sm:px-7 py-4 mt-2 border-t border-black/5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-[#4b4949] bg-white border-2 border-black/15 hover:bg-[#f0f4fa] disabled:opacity-60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(values, files)}
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] disabled:opacity-60 transition-colors"
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
  editValues,
  editFileIds,
  onAdd,
  onDelete,
  onUpdate,
}: {
  heading: string;
  addLabel: string;
  fields: RecordField[];
  columns: { key: string; label: string }[];
  rows: Array<Record<string, ReactNode>>;
  /** Real row ids, parallel to `rows` — required for onDelete/onUpdate to work. */
  rowIds?: number[];
  /** Raw field values per row, parallel to `rows`/`rowIds` — only needed
   *  (and only used) when `onUpdate` is provided, to pre-fill the modal when
   *  a row is clicked for editing. */
  editValues?: RecordEditValues[];
  /** Existing saved attachment id per file-type field key, parallel to
   *  `rows`/`rowIds` — only needed when a field has type "file" and
   *  `onUpdate` is provided. */
  editFileIds?: Array<Record<string, string | null>>;
  onAdd: (values: Record<string, string>, files: Record<string, File>) => Promise<SaveResult>;
  /** Explicit exception to the append-only convention, added for every
   *  repeatable table (Achievement/Salary Revision/Promotion/Transfer/
   *  Training/Domestic Inquiry/Suspension/Showcause/PIP) per product
   *  decision — omit to keep a given table add-only. */
  onDelete?: (id: number) => Promise<SaveResult>;
  /** Explicit exception to the add-only convention — when provided, clicking
   *  a row while in edit mode reopens the same modal pre-filled with that
   *  row's values (editValues/editFileIds), and Save calls onUpdate(id, ...)
   *  instead of onAdd(...). Omit to keep a given table add-and-delete-only,
   *  no in-place editing of existing rows. */
  onUpdate?: (id: number, values: Record<string, string>, files: Record<string, File>) => Promise<SaveResult>;
}) {
  const editing = useEditMode();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSave(values: Record<string, string>, files: Record<string, File>) {
    setSaving(true);
    setError(null);
    try {
      const result =
        editingRowId !== null && onUpdate ? await onUpdate(editingRowId, values, files) : await onAdd(values, files);
      if (result && result.ok === false) {
        setError(result.error ?? "Save failed.");
        setSaving(false);
        return;
      }
      setModalOpen(false);
      setEditingRowId(null);
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
        onRowClick={
          onUpdate && rowIds
            ? (index) => {
                setError(null);
                setEditingRowId(rowIds[index]);
                setModalOpen(true);
              }
            : undefined
        }
      />
      {editing && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditingRowId(null);
            setModalOpen(true);
          }}
          className="inline-flex min-h-11 items-center gap-1.5 mt-4 px-[18px] py-2 rounded-[10px] border-0 bg-[#d9fd63a8] text-sm font-medium text-[#5c6b0a] hover:bg-[#d9fd63]"
        >
          {addLabel}
        </button>
      )}
      {modalOpen && (
        <RecordAddModal
          title={editingRowId !== null ? `Edit ${addLabel.replace(/^\+\s*Add\s*/i, "")}` : addLabel.replace(/^\+\s*/, "")}
          fields={fields}
          saving={saving}
          error={error}
          initialValues={
            editingRowId !== null && rowIds ? editValues?.[rowIds.indexOf(editingRowId)] : undefined
          }
          initialFileIds={
            editingRowId !== null && rowIds ? editFileIds?.[rowIds.indexOf(editingRowId)] : undefined
          }
          onClose={() => {
            setModalOpen(false);
            setEditingRowId(null);
          }}
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
        editValues={data.map((r) => ({ name: r.name ?? "", date: r.date ?? "" }))}
        editFileIds={data.map((r) => ({ attachment: r.attachmentFileId }))}
        onAdd={(values, files) =>
          addAchievement(userId, { name: values.name ?? "", date: values.date ?? "", attachmentFile: files.attachment ?? null })
        }
        onUpdate={(id, values, files) =>
          updateAchievement(userId, id, { name: values.name ?? "", date: values.date ?? "", attachmentFile: files.attachment ?? null })
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
  editingExistingRecord,
}: {
  existingFileId: string | null;
  pendingFile: File | null;
  onPick: (file: File | null) => void;
  /** True only when the form is loaded with a specific history row (clicked
   *  for in-place editing) rather than defaulting to latest for a new
   *  revision — gates showing the row's own existing attachment + Replace,
   *  vs. always requiring a fresh pick for a brand-new revision. */
  editingExistingRecord: boolean;
}) {
  const editing = useEditMode();
  return (
    <div className="flex flex-col gap-1 min-w-0 sm:col-span-2">
      <span className={labelClass}>Attachment</span>
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
  const editing = useEditMode();
  const latest = data[0] ?? null;

  // When set, the form is loaded with an older history row (clicked while in
  // edit mode) instead of defaulting to latest — Save then corrects that row
  // in place (updateSalaryRevision) instead of appending a new one.
  const [editingId, setEditingId] = useState<number | null>(null);
  const loaded = editingId !== null ? data.find((r) => r.id === editingId) ?? null : latest;

  const [issuedDate, setIssuedDate] = useState(loaded?.issuedDate ?? "");
  const [effectiveDate, setEffectiveDate] = useState(loaded?.effectiveDate ?? "");
  const [currentSalary, setCurrentSalary] = useState(loaded?.currentSalary ?? "");
  const [newSalary, setNewSalary] = useState(loaded?.newSalary ?? "");
  const [reason, setReason] = useState(loaded?.reason ?? "");
  const [approvedBy, setApprovedBy] = useState(loaded?.approvedBy ?? "");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Re-sync the form whenever the *identity* of the loaded record changes —
  // a save created a new latest, a delete promoted the next-newest record,
  // or the user clicked a different history row to edit. Adjusted during
  // render (React's documented pattern for this) rather than in a
  // useEffect, so it doesn't cost an extra post-commit render pass.
  const [syncedLoadedId, setSyncedLoadedId] = useState(loaded?.id ?? null);
  if (syncedLoadedId !== (loaded?.id ?? null)) {
    setSyncedLoadedId(loaded?.id ?? null);
    setIssuedDate(loaded?.issuedDate ?? "");
    setEffectiveDate(loaded?.effectiveDate ?? "");
    setCurrentSalary(loaded?.currentSalary ?? "");
    setNewSalary(loaded?.newSalary ?? "");
    setReason(loaded?.reason ?? "");
    setApprovedBy(loaded?.approvedBy ?? "");
    setPendingFile(null);
  }

  const currentAmount = parseAmount(currentSalary);
  const newAmount = parseAmount(newSalary);
  const adjustment = currentAmount !== null && newAmount !== null ? newAmount - currentAmount : null;

  async function handleSave(): Promise<SaveResult> {
    if (!effectiveDate || !newSalary) return { ok: true };
    if (editingId !== null) {
      const result = await updateSalaryRevision(userId, editingId, {
        issuedDate,
        effectiveDate,
        currentSalary,
        newSalary,
        reason,
        salaryAdjustment: adjustment !== null ? String(adjustment) : "",
        approvedBy,
        attachmentFile: pendingFile,
      });
      if (!result || result.ok !== false) {
        setEditingId(null);
        router.refresh();
      }
      return result;
    }
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
      if (editingId === pendingDeleteId) setEditingId(null);
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PanelHeading>{editingId !== null ? "Edit Salary Revision" : "Salary Revision"}</PanelHeading>
        {editing && editingId !== null && (
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="text-xs text-[#4a90e2] hover:underline shrink-0"
          >
            Cancel edit — add new revision instead
          </button>
        )}
      </div>
      <FieldGrid>
        <EditableField label="Issue Date" value={issuedDate} onChange={setIssuedDate} type="date" />
        <EditableField label="Effective Date" value={effectiveDate} onChange={setEffectiveDate} type="date" />
        <EditableField label="Current Salary" value={currentSalary} onChange={setCurrentSalary} />
        <EditableField label="New Salary" value={newSalary} onChange={setNewSalary} />
        <FieldDisplay label="Salary Adjustment" value={adjustment !== null ? formatAmount(adjustment) : null} full />
        <EditableTextArea label="Reason" value={reason} onChange={setReason} full />
        <EditableSelectField label="Approved By" value={approvedBy} onChange={setApprovedBy} options={APPROVED_BY_OPTIONS} full />
        <SalaryRevisionAttachmentField
          existingFileId={loaded?.attachmentFileId ?? null}
          pendingFile={pendingFile}
          onPick={setPendingFile}
          editingExistingRecord={editingId !== null}
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
          onRowClick={(i) => setEditingId(data[i].id)}
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

export function PromotionPanel({
  userId,
  data,
  currentPosition,
}: {
  userId: number;
  data: PromotionEntry[];
  /** Employee's actual current position (employment.position) — pre-fills
   *  "Current Position" so it doesn't need manual re-entry every time. */
  currentPosition?: string | null;
}) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Promotion"
        addLabel="+ Add promotion record"
        fields={[
          { key: "promotionDate", label: "Promotion Date", type: "date" },
          { key: "effectiveDate", label: "Effective Date", type: "date" },
          {
            key: "currentPosition",
            label: "Current Position",
            type: "select",
            options: POSITION_OPTIONS,
            defaultValue: currentPosition ?? undefined,
          },
          { key: "newPosition", label: "New Position", type: "select", options: POSITION_OPTIONS },
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
        editValues={data.map((r) => ({
          promotionDate: r.promotionDate ?? "",
          effectiveDate: r.effectiveDate ?? "",
          currentPosition: r.currentPosition ?? "",
          newPosition: r.newPosition ?? "",
          reason: r.reason ?? "",
          approvedBy: r.approvedBy ?? "",
        }))}
        editFileIds={data.map((r) => ({ attachment: r.attachmentFileId }))}
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
        onUpdate={(id, values, files) =>
          updatePromotion(userId, id, {
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

const TRANSFER_TYPE_OPTIONS = [
  { value: "HQ TO HQ", label: "HQ TO HQ" },
  { value: "BRANCH TO BRANCH", label: "BRANCH TO BRANCH" },
  { value: "HQ TO BRANCH", label: "HQ TO BRANCH" },
  { value: "BRANCH TO HQ", label: "BRANCH TO HQ" },
  // Exact string match relied on elsewhere (addTransfer's isTemporary check,
  // transferAutomation.ts's revert sweep) — kept unchanged per explicit
  // request, unlike the other four options above.
  { value: "Temporary Transfer", label: "Temporary Transfer" },
];

export function TransferPanel({
  userId,
  data,
  branches,
  departments,
  currentLocation,
}: {
  userId: number;
  data: TransferEntry[];
  /** Combined Branch + Department option list — CEO is included in
   *  Department (explicit reversal of an earlier HR-driven exclusion). */
  branches: BranchOpt[];
  departments: DepartmentOpt[];
  /** Employee's current Branch/Department (department-priority display) —
   *  pre-fills "From" so it doesn't need manual re-entry every time. */
  currentLocation?: string | null;
}) {
  const locationOptionGroups = [
    { label: "Branch", options: branches.map((b) => ({ value: b.name, label: b.name })) },
    {
      label: "Department",
      options: departments.map((d) => ({ value: d.name, label: d.name })),
    },
  ];
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Transfer"
        addLabel="+ Add transfer record"
        fields={[
          { key: "type", label: "Type", type: "select", options: TRANSFER_TYPE_OPTIONS },
          { key: "effectiveDate", label: "Effective Date", type: "date" },
          {
            key: "fromLocation",
            label: "From",
            type: "select",
            optionGroups: locationOptionGroups,
            defaultValue: currentLocation ?? undefined,
          },
          { key: "toLocation", label: "To", type: "select", optionGroups: locationOptionGroups },
          {
            key: "endDate",
            label: "End Date",
            type: "date",
            visibleWhen: (values) => values.type === "Temporary Transfer",
          },
          { key: "reason", label: "Reason", type: "textarea", full: true },
          { key: "attachment", label: "Attachment", type: "file", full: true },
        ]}
        columns={[
          { key: "effective", label: "Effective Date" },
          { key: "type", label: "Type" },
          { key: "from", label: "From" },
          { key: "to", label: "To" },
          { key: "endDate", label: "End Date" },
          { key: "reason", label: "Reason" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={data.map((r) => ({
          effective: r.effectiveDate ?? "—",
          type: r.type ?? "—",
          from: r.fromLocation ?? "—",
          to: r.toLocation ?? "—",
          endDate: r.endDate ?? "—",
          reason: r.reason ?? "—",
          attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        }))}
        rowIds={data.map((r) => r.id)}
        editValues={data.map((r) => ({
          type: r.type ?? "",
          effectiveDate: r.effectiveDate ?? "",
          fromLocation: r.fromLocation ?? "",
          toLocation: r.toLocation ?? "",
          endDate: r.endDate ?? "",
          reason: r.reason ?? "",
        }))}
        editFileIds={data.map((r) => ({ attachment: r.attachmentFileId }))}
        onAdd={(values, files) => {
          if (values.type === "Temporary Transfer" && !values.endDate) {
            return Promise.resolve({ ok: false, error: "End Date is required for a Temporary Transfer." });
          }
          return addTransfer(userId, {
            type: values.type ?? "",
            effectiveDate: values.effectiveDate ?? "",
            fromLocation: values.fromLocation ?? "",
            toLocation: values.toLocation ?? "",
            endDate: values.type === "Temporary Transfer" ? (values.endDate ?? "") : "",
            reason: values.reason ?? "",
            attachmentFile: files.attachment ?? null,
          });
        }}
        onUpdate={(id, values, files) => {
          if (values.type === "Temporary Transfer" && !values.endDate) {
            return Promise.resolve({ ok: false, error: "End Date is required for a Temporary Transfer." });
          }
          return updateTransfer(userId, id, {
            type: values.type ?? "",
            effectiveDate: values.effectiveDate ?? "",
            fromLocation: values.fromLocation ?? "",
            toLocation: values.toLocation ?? "",
            endDate: values.type === "Temporary Transfer" ? (values.endDate ?? "") : "",
            reason: values.reason ?? "",
            attachmentFile: files.attachment ?? null,
          });
        }}
        onDelete={(id) => deleteTransfer(userId, id)}
      />
    </EditableSection>
  );
}

const TRAINING_STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Enrolled", label: "Enrolled" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Others", label: "Others" },
];

export function TrainingPanel({ userId, data }: { userId: number; data: TrainingEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Training"
        addLabel="+ Add training record"
        fields={[
          { key: "name", label: "Training Name", type: "text", full: true },
          { key: "date", label: "Date", type: "date" },
          { key: "status", label: "Status", type: "select", options: TRAINING_STATUS_OPTIONS },
          {
            key: "statusOther",
            label: "Please specify",
            type: "text",
            visibleWhen: (values) => values.status === "Others",
          },
        ]}
        columns={[
          { key: "name", label: "Training Name" },
          { key: "date", label: "Date" },
          { key: "status", label: "Status" },
        ]}
        rows={data.map((r) => ({ name: r.name ?? "—", date: r.date ?? "—", status: r.status ?? "—" }))}
        rowIds={data.map((r) => r.id)}
        editValues={data.map((r) => {
          // Older rows (or ones entered before this dropdown existed) may
          // hold a status string that isn't one of the fixed options — treat
          // those the same as a fresh "Others" pick so the existing free
          // text still shows up (in the reveal-only-when-Others field)
          // instead of silently not matching any option.
          const isKnown = TRAINING_STATUS_OPTIONS.some((o) => o.value === r.status);
          return {
            name: r.name ?? "",
            date: r.date ?? "",
            status: r.status && !isKnown ? "Others" : r.status ?? "",
            statusOther: r.status && !isKnown ? r.status : "",
          };
        })}
        onAdd={(values) => {
          const status = values.status === "Others" ? values.statusOther ?? "" : values.status ?? "";
          return addTraining(userId, { name: values.name ?? "", date: values.date ?? "", status });
        }}
        onUpdate={(id, values) => {
          const status = values.status === "Others" ? values.statusOther ?? "" : values.status ?? "";
          return updateTraining(userId, id, { name: values.name ?? "", date: values.date ?? "", status });
        }}
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

const DOMESTIC_INQUIRY_DECISION_OPTIONS = [
  { value: "Misconduct Proven", label: "Misconduct Proven" },
  { value: "Misconduct Not Proven", label: "Misconduct Not Proven" },
  { value: "No Misconduct", label: "No Misconduct" },
  { value: "Case Withdrawn", label: "Case Withdrawn" },
  { value: "Pending", label: "Pending" },
];

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
          { key: "decision", label: "Decision", type: "select", options: DOMESTIC_INQUIRY_DECISION_OPTIONS, full: true },
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
        editValues={data.map((r) => ({
          date: r.date ?? "",
          panel: r.panel ?? "",
          caseSummary: r.caseSummary ?? "",
          decision: r.decision ?? "",
        }))}
        editFileIds={data.map((r) => ({ attachment: r.attachmentFileId }))}
        onAdd={(values, files) =>
          addDomesticInquiry(userId, {
            date: values.date ?? "",
            panel: values.panel ?? "",
            caseSummary: values.caseSummary ?? "",
            decision: values.decision ?? "",
            attachmentFile: files.attachment ?? null,
          })
        }
        onUpdate={(id, values, files) =>
          updateDomesticInquiry(userId, id, {
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

const SUSPENSION_TYPE_OPTIONS = [
  { value: "Suspension Pending Investigation", label: "Suspension Pending Investigation" },
  { value: "Suspension Pending Domestic Inquiry", label: "Suspension Pending Domestic Inquiry" },
  { value: "Disciplinary Suspension", label: "Disciplinary Suspension" },
  { value: "Administrative Suspension", label: "Administrative Suspension" },
  { value: "Paid Suspension", label: "Paid Suspension" },
  { value: "Unpaid Suspension", label: "Unpaid Suspension" },
];

export function SuspensionPanel({ userId, data }: { userId: number; data: SuspensionLetterEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Suspension Letter"
        addLabel="+ Add a suspension letter record"
        fields={[
          { key: "startDate", label: "Suspension Start", type: "date" },
          { key: "endDate", label: "Suspension End", type: "date" },
          { key: "type", label: "Suspension Type", type: "select", options: SUSPENSION_TYPE_OPTIONS, full: true },
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
        editValues={data.map((r) => ({
          startDate: r.startDate ?? "",
          endDate: r.endDate ?? "",
          type: r.type ?? "",
          reason: r.reason ?? "",
          issuedBy: r.issuedBy ?? "",
        }))}
        editFileIds={data.map((r) => ({ attachment: r.attachmentFileId }))}
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
        onUpdate={(id, values, files) =>
          updateSuspensionLetter(userId, id, {
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

const SHOWCAUSE_CASE_TYPE_OPTIONS = [
  { value: "Attendance", label: "Attendance" },
  { value: "Misconduct", label: "Misconduct" },
  { value: "Performance", label: "Performance" },
  { value: "Policy Violation", label: "Policy Violation" },
  { value: "Insubordination", label: "Insubordination" },
  { value: "Negligence", label: "Negligence" },
  { value: "Misuse of Company Property", label: "Misuse of Company Property" },
  { value: "Harassment", label: "Harassment" },
  { value: "Safety Violation", label: "Safety Violation" },
  { value: "Other", label: "Other" },
];

export function ShowcausePanel({ userId, data }: { userId: number; data: ShowcauseWarningLetterEntry[] }) {
  return (
    <EditableSection>
      <RepeatableRecordSection
        heading="Showcause/ Warning Letter"
        addLabel="+ Add a showcause/warning letter record"
        fields={[
          { key: "type", label: "Case Type", type: "select", options: SHOWCAUSE_CASE_TYPE_OPTIONS },
          { key: "typeOther", label: "Please specify", type: "text", visibleWhen: (values) => values.type === "Other" },
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
        editValues={data.map((r) => {
          // Older rows (or ones entered before this dropdown existed) may
          // hold a case type string that isn't one of the fixed options —
          // treat those the same as a fresh "Other" pick so the existing
          // free text still shows up instead of silently not matching any
          // option (same convention as Training's Status dropdown).
          const isKnown = SHOWCAUSE_CASE_TYPE_OPTIONS.some((o) => o.value === r.type);
          return {
            type: r.type && !isKnown ? "Other" : r.type ?? "",
            typeOther: r.type && !isKnown ? r.type : "",
            date: r.date ?? "",
            issuedBy: r.issuedBy ?? "",
            status: r.status ?? "",
            reason: r.reason ?? "",
            empResponse: r.empResponse ?? "",
          };
        })}
        editFileIds={data.map((r) => ({ attachment: r.attachmentFileId }))}
        onAdd={(values, files) => {
          const type = values.type === "Other" ? values.typeOther ?? "" : values.type ?? "";
          return addShowcauseWarningLetter(userId, {
            type,
            date: values.date ?? "",
            issuedBy: values.issuedBy ?? "",
            status: values.status ?? "",
            reason: values.reason ?? "",
            empResponse: values.empResponse ?? "",
            attachmentFile: files.attachment ?? null,
          });
        }}
        onUpdate={(id, values, files) => {
          const type = values.type === "Other" ? values.typeOther ?? "" : values.type ?? "";
          return updateShowcauseWarningLetter(userId, id, {
            type,
            date: values.date ?? "",
            issuedBy: values.issuedBy ?? "",
            status: values.status ?? "",
            reason: values.reason ?? "",
            empResponse: values.empResponse ?? "",
            attachmentFile: files.attachment ?? null,
          });
        }}
        onDelete={(id) => deleteShowcauseWarningLetter(userId, id)}
      />
    </EditableSection>
  );
}

const PIP_REVIEW_RESULT_OPTIONS = [
  { value: "Successful", label: "Successful" },
  { value: "Improvement Required", label: "Improvement Required" },
  { value: "Extended", label: "Extended" },
  { value: "Unsuccessful", label: "Unsuccessful" },
  { value: "Terminated", label: "Terminated" },
];

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
          { key: "reviewResult", label: "Review Result", type: "select", options: PIP_REVIEW_RESULT_OPTIONS },
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
        editValues={data.map((r) => ({
          startDate: r.startDate ?? "",
          endDate: r.endDate ?? "",
          supervisor: r.supervisor ?? "",
          reviewResult: r.reviewResult ?? "",
          improvementGoal: r.improvementGoal ?? "",
          remark: r.remark ?? "",
        }))}
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
        onUpdate={(id, values) =>
          updatePip(userId, id, {
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

const EXIT_TYPE_OPTIONS = [
  { value: "Resignation", label: "Resignation" },
  { value: "End of Contract", label: "End of Contract" },
  { value: "Internship Completed", label: "Internship Completed" },
  { value: "Termination/Dismissal", label: "Termination/Dismissal" },
];

export function ResignationPanel({ userId, data }: { userId: number; data: ResignationInfo | null }) {
  const [submissionDate, setSubmissionDate] = useState(data?.submissionDate ?? "");
  const [lastWorkingDate, setLastWorkingDate] = useState(data?.lastWorkingDate ?? "");
  const [reason, setReason] = useState(data?.reason ?? "");
  const [resignLetterFileId, setResignLetterFileId] = useState(data?.resignLetterFileId ?? null);
  const [pendingResignLetter, setPendingResignLetter] = useState<File | null>(null);
  const [acceptLetterFileId, setAcceptLetterFileId] = useState(data?.acceptLetterFileId ?? null);
  const [pendingAcceptLetter, setPendingAcceptLetter] = useState<File | null>(null);
  const [exitType, setExitType] = useState(data?.exitType ?? "");

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
          exitType,
        })
      }
    >
      <PanelHeading>Resignation</PanelHeading>
      <FieldGrid>
        <EditableSelectField label="Exit Type" value={exitType} onChange={setExitType} options={EXIT_TYPE_OPTIONS} />
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
// here). Full Name/Email are editable despite doubling as the login
// identifier (users.email) — editing an account's own email invalidates its
// current session (next request's lookup-by-email no longer matches), same
// as any email change would. Signed Offer Letter is a real Google Drive file
// now (employment.offer_letter_file_id) — same upload-on-save RealFileField
// convention as Resume/CV.
export function PersonalInfoPanel({
  employee,
  employeeId,
  showOfferLetter = false,
}: {
  employee: EmployeeDetailFull;
  employeeId: number;
  showOfferLetter?: boolean;
}) {
  const [fullName, setFullName] = useState(employee.fullName ?? "");
  const [email, setEmail] = useState(employee.email ?? "");
  const [dob, setDob] = useState(employee.dob ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [gender, setGender] = useState(employee.gender ?? "");
  const [nric, setNric] = useState(employee.nric ?? "");
  const [homeAddress, setHomeAddress] = useState(employee.homeAddress ?? "");
  const [offerLetterFileId, setOfferLetterFileId] = useState(employee.offerLetterFileId ?? null);
  const [offerLetterPending, setOfferLetterPending] = useState<File | null>(null);

  function clearOfferLetter() {
    if (offerLetterPending) setOfferLetterPending(null);
    else setOfferLetterFileId(null);
  }

  function handleSave() {
    if (!fullName.trim()) {
      return { ok: false, error: "Full Name cannot be empty." };
    }
    if (!isValidEmail(email)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (phone && !isValidPhoneDigits(parsePhoneValue(phone).digits)) {
      return { ok: false, error: "Enter a valid phone number." };
    }
    return updatePersonalInfo(employeeId, {
      fullName,
      email,
      dob,
      phone,
      gender,
      nric,
      homeAddress,
      offerLetterFileId,
      offerLetterFile: offerLetterPending,
    });
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>Personal Info</PanelHeading>
      <FieldGrid>
        <EditableField label="Full Name" value={fullName} onChange={setFullName} />
        <EditableField label="Date of Birth" value={dob} onChange={setDob} type="date" />
        <EditableSelectField label="Gender" value={gender} onChange={setGender} options={GENDER_OPTIONS} />
        <EditableField label="IC/ Passport No." value={nric} onChange={setNric} />
        <EmailField label="Email" value={email} onChange={setEmail} />
        <PhoneField label="Phone Number" value={phone} onChange={setPhone} />
        <EditableField label="Home Address" value={homeAddress} onChange={setHomeAddress} full />
        {showOfferLetter && (
          <RealFileField
            label="Signed Offer Letter"
            existingFileId={offerLetterFileId}
            pendingFile={offerLetterPending}
            onPick={setOfferLetterPending}
            onClear={clearOfferLetter}
            full
          />
        )}
      </FieldGrid>
    </EditableSection>
  );
}

const EMERGENCY_RELATIONSHIP_OPTIONS = [
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Spouse", label: "Spouse" },
  { value: "Brother", label: "Brother" },
  { value: "Sister", label: "Sister" },
  { value: "Son", label: "Son" },
  { value: "Daughter", label: "Daughter" },
  { value: "Guardian", label: "Guardian" },
  { value: "Relative", label: "Relative" },
  { value: "Friend", label: "Friend" },
  { value: "Other", label: "Other" },
];

// Shared across Onboarding's "Emergency Contact" section and Employee
// Record's Personal Info > Emergency Contact — same emergency_contact
// table. All 5 fields (Name/Phone/Relationship/Email/Address) are real
// columns, persisted on Save via the onSave prop the caller supplies.
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
  // Older rows (or ones entered before this dropdown existed) may hold a
  // relationship string that isn't one of the fixed options — treat those
  // the same as a fresh "Other" pick so the existing free text still shows
  // up (same convention as Training's Status dropdown).
  const isKnownInitialRelation = EMERGENCY_RELATIONSHIP_OPTIONS.some((o) => o.value === employee.emergencyRelation);
  const [relation, setRelation] = useState(
    employee.emergencyRelation ? (isKnownInitialRelation ? employee.emergencyRelation : "Other") : ""
  );
  const [relationOther, setRelationOther] = useState(
    employee.emergencyRelation && !isKnownInitialRelation ? employee.emergencyRelation : ""
  );
  const [email, setEmail] = useState(employee.emergencyEmail ?? "");
  const [address, setAddress] = useState(employee.emergencyAddress ?? "");

  function handleSave() {
    if (phone && !isValidPhoneDigits(parsePhoneValue(phone).digits)) {
      return Promise.resolve({ ok: false, error: "Enter a valid phone number." });
    }
    if (email && !isValidEmail(email)) {
      return Promise.resolve({ ok: false, error: "Enter a valid email address." });
    }
    return onSave({ name, phone, relation: relation === "Other" ? relationOther : relation, email, address });
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>Emergency Contact</PanelHeading>
      <FieldGrid>
        <EditableField label="Contact Name" value={name} onChange={setName} />
        <SelectWithOtherField
          label="Relationship"
          value={relation}
          otherText={relationOther}
          onValueChange={setRelation}
          onOtherTextChange={setRelationOther}
          options={EMERGENCY_RELATIONSHIP_OPTIONS}
          otherSentinel="Other"
        />
        <PhoneField label="Phone Number" value={phone} onChange={setPhone} />
        <EmailField label="Email" value={email} onChange={setEmail} />
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
  SidebarField,
  EditableField,
  EditableSelectField,
  SelectWithOtherField,
  EditableTextArea,
  PhoneField,
  EmailField,
  PlaceholderField,
  PlaceholderSelectField,
  PlaceholderTextArea,
  PlaceholderUploadField,
};
