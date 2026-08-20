"use client";

import { forwardRef, startTransition, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EditableSection, useEditMode, type SaveResult } from "@/app/components/EditMode";
import { usePageEditContext, type ValidationResult } from "@/app/components/PageEditMode";
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
  addPayslipHistory,
  deletePayslipHistory,
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
  addKnowledgeTransferItem,
  toggleKnowledgeTransferItem,
  renameKnowledgeTransferItem,
  deleteKnowledgeTransferItem,
  addAssetRecoveryItem,
  toggleAssetRecoveryItem,
  renameAssetRecoveryItem,
  deleteAssetRecoveryItem,
  addSystemRevocationItem,
  toggleSystemRevocationItem,
  renameSystemRevocationItem,
  deleteSystemRevocationItem,
  updateFinancialSettlement,
  type AddExitChecklistItemInput,
  type ActionResult,
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
  PayslipHistoryEntry,
  NdaInfo,
  NonCompeteInfo,
  DomesticInquiryEntry,
  SuspensionLetterEntry,
  ShowcauseWarningLetterEntry,
  PipEntry,
  DisciplinarySummaryRow,
  DisciplinarySourceType,
  ResignationInfo,
  ReferenceLetterInfo,
  ExitInterviewNoteInfo,
  ExitChecklistItem,
  FinancialSettlementInfo,
} from "@/lib/employeeQueries";
import type { ProbationDisplayInfo } from "@/lib/probationDecision";
import { profileUrlForStage } from "@/lib/stageProfileConfig";
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
// gray "-" when empty, plain dark text when filled, swapping to an
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
  return <h2 className="text-2xl font-semibold text-[#4b4949d6] dark:text-slate-200 mb-6 pr-24 sm:pr-0">{children}</h2>;
}

function SubsectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-lg font-semibold text-[#4b4949d6] dark:text-slate-200 mb-4">{children}</h3>;
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

const valueClass = "text-sm text-[#4b4949] dark:text-slate-300 truncate";
const emptyClass = "text-sm italic text-slate-400 dark:text-slate-500";
const labelClass = "text-xs font-medium text-slate-500 dark:text-slate-400";
const inputClass =
  "text-sm text-[#4b4949] dark:text-slate-100 bg-transparent border-0 border-b border-slate-300 dark:border-slate-500 p-0 pb-0.5 focus:outline-none focus:border-blue-500";

// Read-only, non-editable field (e.g. Full Name/Email — real data the user
// isn't allowed to change here for a business reason, not a missing column).
function FieldDisplay({ label, value, full = false }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {value ? <span className={valueClass}>{value}</span> : <span className={emptyClass}>-</span>}
    </div>
  );
}

// Small label-over-value display for a profile summary block (e.g. the stage
// profile sidebar's Branch/Dept, Position, Phone Number, Email) — shared here
// so Employee Record's own profile header can match that exact style.
function SidebarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="w-full">
      <span className="block text-xs text-[#4b4949] dark:text-slate-300">{label}</span>
      <span className="block text-sm text-[#4b4949] dark:text-slate-300 truncate">{children}</span>
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
        <span className={emptyClass}>-</span>
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
            className={`flex items-stretch h-11 rounded-[10px] bg-[#f0f0f0a6] dark:bg-slate-950 overflow-hidden focus-within:outline focus-within:outline-2 ${
              invalid ? "outline outline-2 outline-red-500" : "focus-within:outline-blue-500"
            }`}
          >
            <select
              value={countryCode}
              onChange={(e) => commit(e.target.value, digits)}
              aria-label={`${label} country code`}
              className="basis-1/4 min-w-0 bg-transparent border-0 border-r border-black/10 dark:border-white/10 pl-3 pr-1 text-sm text-[#4b4949] dark:text-slate-100 focus:outline-none"
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
              className="basis-3/4 min-w-0 px-3 text-sm text-[#4b4949] dark:text-slate-100 bg-transparent focus:outline-none"
            />
          </div>
          {invalid && <span className="text-xs text-red-600 dark:text-red-400">Enter a valid phone number.</span>}
        </>
      ) : value ? (
        <span className={valueClass}>{composePhoneValue(parsed.countryCode, parsed.digits)}</span>
      ) : (
        <span className={emptyClass}>-</span>
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
          {invalid && <span className="text-xs text-red-600 dark:text-red-400">Enter a valid email address.</span>}
        </>
      ) : value ? (
        <span className={valueClass}>{value}</span>
      ) : (
        <span className={emptyClass}>-</span>
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
        <span className={emptyClass}>-</span>
      )}
    </div>
  );
}

const DURATION_UNIT_OPTIONS = [
  { value: "d", label: "d" },
  { value: "w", label: "w" },
  { value: "m", label: "m" },
  { value: "y", label: "y" },
];

// Splits a stored "6m"/"2w"/"1y" duration into its number + unit letter for
// editing. Also salvages any pre-existing freeform value entered before this
// field had a fixed shape (e.g. a stray "er") by keeping whatever leading
// digits it finds and defaulting the unit to month — never throws, worst
// case is an empty amount the user fills in themselves.
function parseDuration(value: string): { amount: string; unit: string } {
  const match = /^(\d+)\s*([dwmy])$/i.exec(value.trim());
  if (match) return { amount: match[1], unit: match[2].toLowerCase() };
  const digits = /^\d+/.exec(value.trim());
  return { amount: digits ? digits[0] : "", unit: "m" };
}

// Shared Duration field — numeric-only amount + a d(ay)/w(eek)/m(onth)/
// y(ear) unit select, composed into a single stored string ("6m") on every
// change so the caller's value/onChange contract stays identical to
// EditableField's (a drop-in swap at every Non-Compete/Performance Review
// Duration call site). Digits-only on the amount, same live-filter pattern
// as EmployeeRecordView.tsx's PaymentInfoPanel Account Number field.
export function DurationField({
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
  const { amount, unit } = parseDuration(value);

  function commit(nextAmount: string, nextUnit: string) {
    onChange(nextAmount ? `${nextAmount}${nextUnit}` : "");
  }

  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => commit(e.target.value.replace(/\D/g, ""), unit)}
            className={`${inputClass} w-16`}
          />
          <select value={unit} onChange={(e) => commit(amount, e.target.value)} className={inputClass}>
            {DURATION_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : value ? (
        <span className={valueClass}>{value}</span>
      ) : (
        <span className={emptyClass}>-</span>
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
          <span className={emptyClass}>-</span>
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
          className="text-sm text-[#4b4949] dark:text-slate-100 bg-transparent border border-slate-300 dark:border-slate-500 rounded-lg p-2 resize-y focus:outline-none focus:border-blue-500"
        />
      ) : value ? (
        <span className="text-sm text-[#4b4949] dark:text-slate-300 whitespace-pre-wrap">{value}</span>
      ) : (
        <span className={emptyClass}>-</span>
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
        <span className={emptyClass}>-</span>
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
        <span className={emptyClass}>-</span>
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
          className="text-sm text-[#4b4949] dark:text-slate-100 bg-transparent border border-slate-300 dark:border-slate-500 rounded-lg p-2 resize-y focus:outline-none focus:border-blue-500"
        />
      ) : value ? (
        <span className="text-sm text-[#4b4949] dark:text-slate-300 whitespace-pre-wrap">{value}</span>
      ) : (
        <span className={emptyClass}>-</span>
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
            className="shrink-0 p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  if (!editing) return <span className={emptyClass}>-</span>;

  return (
    <label className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg border-2 border-dashed border-[#b9c4d6] dark:border-slate-600 bg-[#f7f9fc] dark:bg-slate-800 px-4 py-2 text-sm text-[#6b7280] dark:text-slate-400 cursor-pointer hover:border-[#4a90e2] hover:bg-[#eef4fd] dark:hover:bg-slate-700">
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
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#4a90e2] dark:text-blue-400 hover:underline">
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
    <a href={`/api/attachment/${encodeURIComponent(fileId)}`} target="_blank" rel="noopener noreferrer" className="text-[#4a90e2] dark:text-blue-400 hover:underline">
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
              className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-sm leading-none"
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
              className="shrink-0 text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      ) : editing ? (
        <label className="inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-dashed border-[#b9c4d6] dark:border-slate-600 bg-[#f7f9fc] dark:bg-slate-800 px-3 py-1.5 text-xs text-[#6b7280] dark:text-slate-400 cursor-pointer hover:border-[#4a90e2] hover:bg-[#eef4fd] dark:hover:bg-slate-700">
          <input type="file" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          Click to upload
        </label>
      ) : (
        <span className={emptyClass}>-</span>
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
  canEdit = true,
}: {
  userId: number;
  resumeFileId: string | null;
  cvFileId: string | null;
  canEdit?: boolean;
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
      canEdit={canEdit}
      sectionLabel="Resume/CV"
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

// Real interview_assessment table — Pre stage's own Interview Assessment tab,
// AND (as of 2026-08-13, see conversation) Employee Record's HR Info >
// Hiring Notes tab — same underlying record, shown twice across the
// lifecycle. These were kept deliberately unlinked at first because Hiring
// Notes' old placeholder mock used a different dropdown vocabulary
// (Excellent/Good/Average/Below Average and Hire/Hold/Reject vs. this
// table's real 1-5 rating and Proceed/Hire/Hold/Reject) — resolved by
// dropping the placeholder's vocabulary entirely and standardizing on this
// table's real one everywhere it's shown, per explicit decision. `heading`
// lets Hiring Notes override the panel title/registration label without a
// second copy of this component (same convention as DocumentsPanel's
// showEmploymentContract-driven heading).
export function InterviewAssessmentPanel({
  userId,
  data,
  heading = "Interview Assessment",
  canEdit = true,
}: {
  userId: number;
  data: InterviewAssessmentInfo | null;
  heading?: string;
  canEdit?: boolean;
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
      canEdit={canEdit}
      sectionLabel={heading}
    >
      <PanelHeading>{heading}</PanelHeading>
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
  canEdit = true,
}: {
  userId: number;
  data: ReferenceCheckInfo | null;
  canEdit?: boolean;
}) {
  const [refName, setRefName] = useState(data?.refName ?? "");
  const [company, setCompany] = useState(data?.company ?? "");
  const [relationship, setRelationship] = useState(data?.relationship ?? "");
  const [position, setPosition] = useState(data?.position ?? "");
  const [contactNumber, setContactNumber] = useState(data?.contactNumber ?? "");
  const [email, setEmail] = useState(data?.email ?? "");

  // Same checks as handleSave's own inline guard — see PersonalInfoPanel's
  // validate() above for why this is a separate function rather than a
  // dry-run flag on handleSave itself.
  function validate(): ValidationResult {
    const errors: string[] = [];
    if (contactNumber && !isValidPhoneDigits(parsePhoneValue(contactNumber).digits)) errors.push("Enter a valid phone number.");
    if (email && !isValidEmail(email)) errors.push("Enter a valid email address.");
    return errors.length > 0 ? { valid: false, error: errors.join("\n") } : { valid: true };
  }

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
    <EditableSection onSave={handleSave} validate={validate} canEdit={canEdit} sectionLabel="Reference Check">
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
  canEdit = true,
}: {
  userId: number;
  data: MedicalCheckInfo | null;
  canEdit?: boolean;
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
      canEdit={canEdit}
      sectionLabel="Medical Check"
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
      {value ? <span className={`${valueClass} whitespace-pre-wrap`}>{value}</span> : <span className={emptyClass}>-</span>}
    </div>
  );
}

const PROBATION_STATUS_PILL_CLASSES: Record<string, string> = {
  Confirm: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  Stop: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  Extended: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  "In Progress": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

// Confirm/Extend/Stop only render once Edit is clicked (per explicit
// decision — see conversation), same "everything's gated by the panel's own
// Edit/Save toggle" convention as every other field here. A private child
// of ProbationPanel's own <EditableSection> so useEditMode() reads that
// section's real state, same reason SalaryRevisionAttachmentField/
// ExitChecklistAddItemRow above are their own small components rather than
// a plain read in the parent body.
function ProbationDecisionSection({
  canDecide,
  display,
  onPick,
  decideError,
}: {
  canDecide: boolean;
  display: ProbationDisplayInfo;
  onPick: (outcome: "Confirmed" | "Extended" | "Stopped") => void;
  decideError: string | null;
}) {
  const editing = useEditMode();
  if (!editing || !canDecide) return null;
  return (
    <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10">
      <SubsectionHeading>Probation Decision</SubsectionHeading>
      {display.decidedByName && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Last decided by {display.decidedByName}
          {display.decidedAt ? ` on ${new Date(display.decidedAt).toLocaleDateString()}` : ""}.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onPick("Confirmed")}
          className="min-h-10 rounded-lg px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => onPick("Extended")}
          className="min-h-10 rounded-lg px-4 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
        >
          Extend
        </button>
        <button
          type="button"
          onClick={() => onPick("Stopped")}
          className="min-h-10 rounded-lg px-4 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
        >
          Stop
        </button>
      </div>
      {decideError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{decideError}</p>}
    </div>
  );
}

// Real probation table — Probation stage's own tab only (no Employee Record
// equivalent in the mock). confirmationLetter*/extensionLetter* are
// independent Google Drive file fields, same pattern as resume.resume_file_id.
// Start Date/End Date/Probation Status are read-only here (see
// probationDecision.ts) — sourced from ebright_hrfs, not this panel's own
// editable form; Confirmation Date/Extension End Date and the two letters
// stay locally editable as before. canDecide (HR/Superadmin only, per
// explicit decision — see conversation) gates the Confirm/Extend/Stop
// buttons; the actual restriction is enforced server-side in
// decideProbationOutcome regardless of what this prop says.
//
// Feedback is always editable now, per explicit decision (see conversation,
// 2026-08-13) — this replaces the earlier hybrid design (external feedback2
// read-only vs. local_feedback editable, gated on
// display.hasCareerApplicationMatch). localFeedback below is seeded from
// feedback2 when present (else from the locally-saved value), but from that
// point on it's just the field's own current text — HR can freely overwrite
// it either way. Always saved to probation.local_feedback; the external
// ebright_hrfs.career_applications.feedback2 column is never written to,
// from here or anywhere else — read-only always. Confirm/Stop both require
// the field to be non-empty first — checked here (before opening the
// confirm dialog, for immediate feedback) AND again server-side in
// decideProbationOutcome (the actual enforcement — this client check is
// just UX, a direct call could otherwise skip it).
export function ProbationPanel({
  userId,
  data,
  display,
  canDecide,
  canEdit = true,
}: {
  userId: number;
  data: ProbationInfo | null;
  display: ProbationDisplayInfo;
  canDecide: boolean;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [confirmDate, setConfirmDate] = useState(data?.confirmDate ?? "");
  const [extEndDate, setExtEndDate] = useState(data?.extEndDate ?? "");
  const [confirmationLetterFileId, setConfirmationLetterFileId] = useState(data?.confirmationLetterFileId ?? null);
  const [confirmationLetterPending, setConfirmationLetterPending] = useState<File | null>(null);
  const [extensionLetterFileId, setExtensionLetterFileId] = useState(data?.extensionLetterFileId ?? null);
  const [extensionLetterPending, setExtensionLetterPending] = useState<File | null>(null);
  // feedback2 (external, when present) seeds the initial value; from there
  // it's just this field's own current text, freely editable either way —
  // see the doc comment above.
  const [localFeedback, setLocalFeedback] = useState(display.feedback2 ?? data?.localFeedback ?? "");

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

  function pickOutcome(outcome: "Confirmed" | "Extended" | "Stopped") {
    if (outcome !== "Extended" && !localFeedback.trim()) {
      setDecideError("Feedback must be filled in before Confirm or Stop.");
      return;
    }
    setDecideError(null);
    setPendingOutcome(outcome);
  }

  async function confirmOutcome() {
    if (!pendingOutcome) return;
    const outcome = pendingOutcome;
    setDeciding(true);
    setDecideError(null);
    const result = await decideProbationOutcome(userId, outcome, localFeedback);
    setDeciding(false);
    setPendingOutcome(null);
    if (!result.ok) {
      setDecideError(result.error ?? "Failed to record probation decision.");
      return;
    }
    // Confirmed moves this person to Active — isEffectivelyConfirmed now
    // makes the live-computed override for this URL resolve to "active",
    // not "probation", so refreshing the SAME /probation/employee/[id] page
    // 404s (its own dual-listing guard no longer allows it — see
    // conversation, live bug report). Navigate to their new Active profile
    // instead, same reason StageProfileView's own Proceed handlers push
    // rather than refresh after a real stage move. Extended/Stopped both
    // keep them on this same Probation page, so refresh is still correct
    // there.
    if (outcome === "Confirmed") router.push(profileUrlForStage("active", userId));
    else router.refresh();
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
            localFeedback,
          });
          if (!result || result.ok !== false) router.refresh();
          return result;
        }}
        canEdit={canEdit}
      >
        <PanelHeading>Probation</PanelHeading>
        <FieldGrid>
          <StaticField label="Start Date" value={display.startDate} />
          <StaticField label="End Date" value={display.endDate} />
          <div className="flex flex-col gap-1 min-w-0">
            <span className={labelClass}>Probation Status</span>
            <span
              className={`self-start inline-block px-3 py-1 rounded-full text-xs font-medium ${
                PROBATION_STATUS_PILL_CLASSES[display.displayStatus] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {display.displayStatus}
            </span>
          </div>
          <EditableField label="Confirmation Date" value={confirmDate} onChange={setConfirmDate} type="date" />
          {display.displayStatus === "Extended" && (
            <EditableField label="Extension End Date" value={extEndDate} onChange={setExtEndDate} type="date" />
          )}
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
          <EditableTextArea label="Feedback" value={localFeedback} onChange={setLocalFeedback} full />
        </FieldGrid>

        <ProbationDecisionSection canDecide={canDecide} display={display} onPick={pickOutcome} decideError={decideError} />
      </EditableSection>

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
  canEdit = true,
}: {
  userId: number;
  data: DocumentsInfo | null;
  showEmploymentContract?: boolean;
  canEdit?: boolean;
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
      canEdit={canEdit}
      sectionLabel={showEmploymentContract ? "Documents" : "Employee Handbook"}
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
//
// Employee Record's Tax Info instance drops Bank Details entirely (already
// shown, on its own, under Personal Info > Payment — this panel's copy was
// a pure duplicate there) and renames the heading to match — Onboarding's
// own Payroll tab is unaffected, both default to the original combined
// behavior. showBankDetails=false also skips the updateBankDetails() call
// on Save, not just the section's visibility — Tax Info never reads or
// edits bank_details in that mode, so there's nothing for it to write back.
export function OnboardingPayrollPanel({
  userId,
  data,
  employeeDetail,
  heading = "Payroll",
  showBankDetails = true,
  canEdit = true,
}: {
  userId: number;
  data: PayrollInfo | null;
  employeeDetail: EmployeeDetailFull;
  heading?: string;
  showBankDetails?: boolean;
  canEdit?: boolean;
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

  // Catches a pre-existing saved value that contains non-digit characters
  // (entered before this restriction existed) and was never retyped this
  // session — same pattern as EmployeeRecordView.tsx's PaymentInfoPanel.
  function validate(): ValidationResult {
    if (showBankDetails && bankAccount && !/^\d+$/.test(bankAccount)) {
      return { valid: false, error: "Account Number must contain digits only." };
    }
    return { valid: true };
  }

  return (
    <EditableSection
      onSave={async () => {
        const payrollResult = await updatePayroll(userId, {
          epfNumber,
          socsoNumber,
          eisNumber,
          taxNumber,
          pcbForm,
          pcbAttachmentFileId: pcbFileId,
          pcbAttachmentFile: pcbPending,
        });
        if (!payrollResult.ok) return payrollResult;
        if (!showBankDetails) return { ok: true };
        const bankResult = await updateBankDetails(userId, { bankName, accountName, bankAccount });
        if (!bankResult.ok) return bankResult;
        return { ok: true };
      }}
      validate={validate}
      canEdit={canEdit}
      sectionLabel={heading}
    >
      <PanelHeading>{heading}</PanelHeading>
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
      {showBankDetails && (
        <Subsection heading="Bank Details">
          <EditableField label="Bank Name" value={bankName} onChange={setBankName} />
          <EditableField label="Account Holder" value={accountName} onChange={setAccountName} />
          {/* Digits only, filtered live as typed — same pattern
              EmployeeRecordView.tsx's PaymentInfoPanel uses. validate()
              above still catches a pre-existing non-digit value that was
              never retyped. */}
          <EditableField label="Account Number" value={bankAccount} onChange={(v) => setBankAccount(v.replace(/\D/g, ""))} full />
        </Subsection>
      )}
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
  /** Opens that row (index into `rows`/`rowIds`) — always clickable when
   *  provided, regardless of edit mode (2026-08-13, see conversation): the
   *  row itself decides whether it opens read-only or editable (see
   *  RecordAddModal's own startReadOnly/canEdit), not this table. */
  onRowClick?: (index: number) => void;
}) {
  const editing = useEditMode();
  const showDeleteColumn = !!onDeleteRow && editing;
  const rowsClickable = !!onRowClick;
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
                  className={`text-left px-3.5 py-2.5 bg-[#f0f0f0a6] dark:bg-slate-800 text-sm font-medium text-[#4b4949] dark:text-slate-300 whitespace-nowrap ${
                    i === 0 ? "rounded-l-[10px]" : ""
                  } ${i === columns.length - 1 && !showDeleteColumn ? "rounded-r-[10px]" : ""}`}
                >
                  {c.label}
                </th>
              ))}
              {showDeleteColumn && (
                <th scope="col" className="px-3.5 py-2.5 bg-[#f0f0f0a6] dark:bg-slate-800 rounded-r-[10px] w-10">
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
                  className="px-3.5 py-6 text-sm text-slate-400 text-center border-b border-black/5 dark:border-white/10"
                >
                  No records yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={rowIds?.[i] ?? i}
                  onClick={rowsClickable ? () => onRowClick(i) : undefined}
                  className={rowsClickable ? "cursor-pointer hover:bg-[#f0f4fa] dark:hover:bg-slate-800" : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className="align-top px-3.5 py-3.5 text-sm text-[#4b4949] dark:text-slate-300 border-b border-black/5 dark:border-white/10 whitespace-nowrap"
                    >
                      {row[c.key] ?? "—"}
                    </td>
                  ))}
                  {showDeleteColumn && (
                    <td className="align-top px-3.5 py-3.5 text-center border-b border-black/5 dark:border-white/10">
                      {rowIds?.[i] !== undefined && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteRow(rowIds[i]);
                          }}
                          aria-label="Delete record"
                          className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-lg leading-none font-semibold"
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
          className="inline-flex min-h-11 items-center gap-1.5 mt-4 px-[18px] py-2 rounded-[10px] border-0 bg-[#d9fd63a8] dark:bg-lime-900 text-sm font-medium text-[#5c6b0a] dark:text-lime-300 hover:bg-[#d9fd63] dark:hover:bg-lime-800"
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
  /** "year-month" renders YearMonthPicker (a </> year stepper over a
   *  12-month list, saving "YYYY-MM") instead of a plain <select> — built
   *  specifically for Payslip History's Month field, per explicit decision
   *  (see conversation): a flat <select> would need one option per
   *  month-per-year (26+ entries to scroll through) instead of stepping
   *  years and picking from a fixed 12. */
  type: "text" | "date" | "textarea" | "file" | "select" | "year-month";
  full?: boolean;
  /** Flat option list — required when type is "select" unless optionGroups is set. */
  options?: { value: string; label: string }[];
  /** Grouped option list (rendered as <optgroup>s) — takes priority over
   *  `options` when both are set (e.g. Transfer's From/To: Branch group +
   *  Department group, instead of one flattened list). */
  optionGroups?: { label: string; options: { value: string; label: string }[] }[];
  /** Computes optionGroups from the modal's current values instead of a
   *  fixed list — takes priority over both `optionGroups` and `options`
   *  when set (e.g. Transfer's "To", whose valid Branch/Department groups
   *  depend on the currently-picked Type). Re-evaluated on every render, so
   *  it always reflects the latest values as the user fills in the form. */
  optionGroupsFor?: (values: Record<string, string>) => { label: string; options: { value: string; label: string }[] }[];
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

// Shared field list for the Leave detail modal (Employee Record's Leave tab
// and the Stage profile's MC/Leave tab both use this) — view-only, opened
// via RecordAddModal with startReadOnly + canEdit={false}, per explicit
// decision (see conversation): Leave has no Edit/Save concept at all, this
// modal only ever displays a clicked row's fields.
export const LEAVE_DETAIL_FIELDS: RecordField[] = [
  { key: "type", label: "Leave Type", type: "text" },
  { key: "dates", label: "Date", type: "text" },
  { key: "days", label: "Duration", type: "text" },
  { key: "reason", label: "Reason", type: "text", full: true },
  // Attachment marked full (2026-08-20, see conversation) so Status lands
  // on its own row below it instead of sitting side-by-side in the grid.
  { key: "attachment", label: "Attachment", type: "file", full: true },
  { key: "status", label: "Status", type: "text" },
];

const recordModalInputClass =
  "h-11 rounded-[10px] bg-[#f0f0f0a6] dark:bg-slate-950 border-0 px-3.5 text-sm text-[#4b4949] dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Shared "YYYY-MM" -> "Month YYYY" formatter — used by YearMonthPicker's own
// closed-state label and by PayslipHistoryPanel's table rows, so both stay
// in sync on how a stored value displays.
function formatMonthLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month] = value.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name ? `${name} ${year}` : value;
}

const YEAR_MONTH_DROPDOWN_MARGIN = 6;

// Year-stepper + 12-month picker — see RecordField.type's own "year-month"
// comment for why this exists instead of a flat <select>. This trigger
// lives inside RecordAddModal's own field list, which has overflow-y-auto
// so the modal itself can scroll when it has many fields — a plain
// position:absolute dropdown gets clipped to that scrollable ancestor
// instead of floating free (confirmed live: only a sliver of the month
// list rendered, per explicit decision/bug report — see conversation).
// Fixed the same way RowActionMenu already solves this exact problem
// elsewhere in this app: switch to viewport-relative position:fixed,
// computed from the trigger's own getBoundingClientRect() after the
// dropdown mounts (needs its own rendered height first), flipped above the
// trigger when there's no room below. A fixed-position dropdown would
// otherwise drift away from its trigger if the modal's field list scrolls
// underneath it while open, so it just closes on scroll instead of trying
// to re-track — same choice RowActionMenu makes, for the same reason.
function YearMonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [yearStr, monthStr] = value ? value.split("-") : [undefined, undefined];
  const selectedYear = yearStr ? Number(yearStr) : undefined;
  const selectedMonth = monthStr ? Number(monthStr) : undefined;
  const [displayYear, setDisplayYear] = useState(selectedYear ?? new Date().getFullYear());
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onScroll(e: Event) {
      // Unlike RowActionMenu (whose menu is never itself scrollable), this
      // picker's own month list is — scrolling it dispatches a (non-
      // bubbling) "scroll" event that this capture-phase listener would
      // otherwise see too, closing the dropdown on its own internal scroll.
      // Only close for scrolling OUTSIDE the menu (e.g. the modal's field
      // list scrolling underneath it).
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const btnRect = btnRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const openUp = btnRect.bottom + menuRect.height + YEAR_MONTH_DROPDOWN_MARGIN > window.innerHeight;
    const top = openUp ? btnRect.top - menuRect.height - YEAR_MONTH_DROPDOWN_MARGIN : btnRect.bottom + YEAR_MONTH_DROPDOWN_MARGIN;
    setMenuPos({ top, left: btnRect.left, width: btnRect.width });
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setDisplayYear(selectedYear ?? new Date().getFullYear());
          setOpen((o) => !o);
        }}
        className={`${recordModalInputClass} w-full text-left flex items-center justify-between`}
      >
        <span className={value ? "" : "text-[#4b4949a3] dark:text-slate-400"}>{value ? formatMonthLabel(value) : "Select month"}</span>
        <span className="text-[#4b4949a3] dark:text-slate-400" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          style={
            menuPos
              ? { position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width }
              : { position: "fixed", top: -9999, left: -9999 }
          }
          className="z-[2100] rounded-[10px] border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 shadow-[0_4px_14px_0_#0000001a] overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-black/10 dark:border-white/10 bg-[#f0f0f0a6] dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setDisplayYear((y) => y - 1)}
              aria-label="Previous year"
              className="px-2 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[#4b4949] dark:text-slate-300 font-medium"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-[#4b4949] dark:text-slate-200">{displayYear}</span>
            <button
              type="button"
              onClick={() => setDisplayYear((y) => y + 1)}
              aria-label="Next year"
              className="px-2 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[#4b4949] dark:text-slate-300 font-medium"
            >
              ›
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {MONTH_NAMES.map((name, i) => {
              const monthNum = i + 1;
              const isSelected = selectedYear === displayYear && selectedMonth === monthNum;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(`${displayYear}-${String(monthNum).padStart(2, "0")}`);
                    setOpen(false);
                  }}
                  className={`block w-full text-left px-3.5 py-2 text-sm ${
                    isSelected ? "bg-[#4a90e2] text-white font-medium" : "text-[#4b4949] dark:text-slate-300 hover:bg-[#f0f4fa] dark:hover:bg-slate-800"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function RecordAddModal({
  title,
  fields,
  saving,
  error,
  initialValues,
  initialFileIds,
  startReadOnly = false,
  canEdit = true,
  showFooter = true,
  onClose,
  onSave,
}: {
  title: string;
  fields: RecordField[];
  saving: boolean;
  error: string | null;
  /** false hides the bottom Close/Cancel + Edit/Save footer entirely (e.g.
   *  Leave's detail view, see conversation) — the header's own "×" is the
   *  only close affordance. Only meaningful alongside startReadOnly +
   *  canEdit={false}, where there'd be nothing left in the footer anyway;
   *  defaults true so every other RecordAddModal caller is unaffected. */
  showFooter?: boolean;
  /** When editing an existing record, its current raw field values — takes
   *  priority over each field's own `defaultValue` (which only makes sense
   *  for a brand-new add). Omit for the "add new" case. */
  initialValues?: RecordEditValues;
  /** When editing, the existing saved attachment id per file-type field key
   *  (e.g. { attachment: "abc123" }) — shown as a "View file" link until
   *  replaced with a new pick. Omit for the "add new" case. */
  initialFileIds?: Record<string, string | null>;
  /** Opens showing plain read-only text instead of inputs, with an "Edit"
   *  button in place of Save (2026-08-13, see conversation — clicking an
   *  existing row now always opens this modal, regardless of the page's own
   *  Edit toggle; only clicking Edit *inside* the modal switches this one
   *  record to editable). Only meaningful for the "edit existing" case — a
   *  brand-new add always opens directly editable regardless of this prop,
   *  since there's nothing to view yet. */
  startReadOnly?: boolean;
  /** false hides the in-modal Edit button (view-only, e.g. a CEO looking at
   *  someone else's profile) — viewing still works regardless, only
   *  switching to editable is gated. Defaults true. */
  canEdit?: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>, files: Record<string, File>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(fields.filter((f) => f.defaultValue).map((f) => [f.key, f.defaultValue as string])),
    ...initialValues,
  }));
  const [files, setFiles] = useState<Record<string, File>>({});
  const [readOnly, setReadOnly] = useState(startReadOnly);

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
      <div className="relative flex w-full max-w-[560px] max-h-[calc(100vh-32px)] flex-col box-border bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-2xl shadow-[0_12px_32px_0_#00000026] overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-[#4b4949d6] dark:text-slate-200">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-[#4b4949a3] dark:text-slate-400 hover:bg-[#f0f4fa] dark:hover:bg-slate-800 hover:text-[#4b4949] dark:hover:text-slate-200"
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
                <label className="text-sm font-medium text-[#4b4949] dark:text-slate-300">{f.label}</label>
                {readOnly ? (
                  f.type === "file" ? (
                    initialFileIds?.[f.key] ? (
                      <RealAttachmentLink fileId={initialFileIds[f.key]} />
                    ) : (
                      <span className="text-sm italic text-slate-400">-</span>
                    )
                  ) : values[f.key] ? (
                    <span className="text-sm text-[#4b4949] whitespace-pre-wrap">{values[f.key]}</span>
                  ) : (
                    <span className="text-sm italic text-slate-400">-</span>
                  )
                ) : f.type === "textarea" ? (
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
                      <label className="shrink-0 text-xs text-[#4a90e2] dark:text-blue-400 hover:underline cursor-pointer">
                        <input type="file" className="hidden" onChange={(e) => setFileField(f.key, e.target.files?.[0] ?? null)} />
                        Replace
                      </label>
                    </div>
                  )
                ) : f.type === "year-month" ? (
                  <YearMonthPicker value={values[f.key] ?? ""} onChange={(v) => setField(f.key, v)} />
                ) : f.type === "select" ? (
                  <select value={values[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} className={recordModalInputClass}>
                    <option value=""></option>
                    {f.optionGroupsFor || f.optionGroups
                      ? (f.optionGroupsFor ? f.optionGroupsFor(values) : f.optionGroups!).map((g) => (
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
          {error && <p className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        {showFooter && (
        <div className="flex shrink-0 justify-end gap-3 px-5 sm:px-7 py-4 mt-2 border-t border-black/5 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-[#4b4949] dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-black/15 dark:border-white/15 hover:bg-[#f0f4fa] dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {readOnly ? (
            canEdit && (
              <button
                type="button"
                onClick={() => setReadOnly(false)}
                className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] transition-colors"
              >
                Edit
              </button>
            )
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(values, files)}
              className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
        )}
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
  canEdit = true,
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
  /** false hides the in-modal Edit button when an existing row is clicked
   *  (view-only, e.g. a CEO looking at someone else's profile) — viewing
   *  still works regardless. Does NOT affect the separate "+ Add" button,
   *  which stays gated on the page's own edit-mode toggle as before. */
  canEdit?: boolean;
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
      // Wrapped in startTransition (2026-08-13, see conversation — Payslip
      // rows not appearing after Save) — a bare router.refresh() called here
      // races against this same function's own setSaving/setModalOpen calls
      // just above; startTransition tells React to treat the resulting
      // Server Component re-render as a deferred update it can properly wait
      // for and merge, rather than risking it getting dropped/superseded by
      // those synchronous state updates landing in the same tick.
      startTransition(() => router.refresh());
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
      startTransition(() => router.refresh());
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
          className="inline-flex min-h-11 items-center gap-1.5 mt-4 px-[18px] py-2 rounded-[10px] border-0 bg-[#d9fd63a8] dark:bg-lime-900 text-sm font-medium text-[#5c6b0a] dark:text-lime-300 hover:bg-[#d9fd63] dark:hover:bg-lime-800"
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
          // Read-only-first only when the page isn't already in edit mode
          // (2026-08-13, see conversation — reverted from "always opens
          // read-only" per explicit correction): with the page's own Edit
          // toggle already on, clicking an existing row now skips the
          // read-only step and opens straight into the editable form, no
          // in-modal toggle needed. A brand-new "+ Add" always opens
          // editable regardless (editingRowId is null there).
          startReadOnly={editingRowId !== null && !editing}
          canEdit={canEdit}
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

export function AchievementPanel({ userId, data, canEdit = true }: { userId: number; data: AchievementEntry[]; canEdit?: boolean }) {
  return (
    <EditableSection canEdit={canEdit}>
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
        canEdit={canEdit}
      />
    </EditableSection>
  );
}

// Replaces the old single-upload Payslip widget (payslip.attachment_file_id
// — see that table's own schema comment) with a repeatable history, one row
// per month, per explicit decision (see conversation). Same
// RepeatableRecordSection pattern as Achievement/Training, except Month
// uses YearMonthPicker (type: "year-month") instead of a flat <select> —
// see that field type's own comment. Deliberately no EditableSection
// wrapper of its own here — rendered inside PayrollPanel's existing one
// (EmployeeRecordPanels.tsx), same as SalaryRevisionFields; its
// useEditMode() reads that ambient context instead of creating a new one.
// Add + Delete only, same as Training — no in-place edit.
export function PayslipHistoryPanel({ userId, data }: { userId: number; data: PayslipHistoryEntry[] }) {
  return (
    <RepeatableRecordSection
      heading="Payslip"
      addLabel="+ Add Payslip"
      fields={[
        { key: "month", label: "Month", type: "year-month" },
        { key: "attachment", label: "Payslip file", type: "file" },
      ]}
      columns={[
        { key: "month", label: "Month" },
        { key: "attachment", label: "Payslip file" },
        { key: "uploadDate", label: "Upload Date" },
      ]}
      rows={data.map((r) => ({
        month: formatMonthLabel(r.month),
        attachment: <RealAttachmentLink fileId={r.attachmentFileId} />,
        uploadDate: r.uploadDate ?? "—",
      }))}
      rowIds={data.map((r) => r.id)}
      onAdd={(values, files) => addPayslipHistory(userId, { month: values.month ?? "", attachmentFile: files.attachment ?? null })}
      onDelete={(id) => deletePayslipHistory(userId, id)}
    />
  );
}

function parseAmount(val: string): number | null {
  const n = parseFloat(val.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}
// No space between "RM" and the number — matches CurrencyField's own
// read-only display exactly (see conversation: unified so Salary Revision's
// Adjustment field/History table don't show a visually different RM style
// than the Current/New Salary inputs right next to them).
function formatAmount(n: number): string {
  return (n < 0 ? "-RM" : "RM") + Math.abs(n).toFixed(2);
}

// Editable currency input — RM prefix + fixed 2-decimal display, per
// explicit spec (see conversation: Financial Settlement's amount fields).
// No existing editable-currency component to reuse: Salary Revision's
// Current/New Salary and Payslip's Basic Salary are all plain EditableField
// (raw text, no prefix/formatting at all) — formatAmount() above is
// display-only, used for Salary Revision's read-only Adjustment field and
// its history table rows, never for a live input. Modeled on PhoneField's
// boxed-prefix layout instead, the closest existing "prefix + input"
// convention in this file. Note the "RM0.00" (no space) display here is a
// deliberate divergence from formatAmount()'s "RM 0.00" (with a space) —
// matches this feature's explicit spec exactly rather than silently
// reusing the other convention; flagged, not unified, since nothing asked
// for the two to match. Normalizes to 2 decimals on blur, not on every
// keystroke, so a half-typed value isn't fought mid-entry.
function CurrencyField({
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
  function handleBlur() {
    const n = parseAmount(value);
    onChange(n !== null ? n.toFixed(2) : "");
  }
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <span className={labelClass}>{label}</span>
      {editing ? (
        <div className="flex items-stretch h-11 rounded-[10px] bg-[#f0f0f0a6] dark:bg-slate-950 overflow-hidden focus-within:outline focus-within:outline-2 focus-within:outline-blue-500">
          <span className="flex items-center pl-3 pr-1 text-sm text-[#4b4949a3] dark:text-slate-400 select-none">RM</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder="0.00"
            className="flex-1 min-w-0 pr-3 text-sm text-[#4b4949] dark:text-slate-100 bg-transparent focus:outline-none"
          />
        </div>
      ) : value ? (
        <span className={valueClass}>{`RM${Number.parseFloat(value).toFixed(2)}`}</span>
      ) : (
        <span className={emptyClass}>-</span>
      )}
    </div>
  );
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
            <label className="shrink-0 text-xs text-[#4a90e2] dark:text-blue-400 hover:underline cursor-pointer">
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
        <span className={emptyClass}>-</span>
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
  // edit mode) — Save then corrects that row in place (updateSalaryRevision)
  // instead of appending a new one. Deliberately NOT defaulting to `latest`
  // when unset (fixed 2026-08-13, see conversation) — a brand-new revision
  // should start blank, not pre-filled with the previous revision's own
  // values; `latest` is still used on its own below, just for the
  // unchanged-vs-latest no-op guard, not to seed the form.
  const [editingId, setEditingId] = useState<number | null>(null);
  const loaded = editingId !== null ? data.find((r) => r.id === editingId) ?? null : null;

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
        // Wrapped in startTransition (2026-08-13, see conversation — new
        // Salary Revision rows not appearing in History after Save) — see
        // RepeatableRecordSection's own handleSave for why a bare
        // router.refresh() here races against this same PageEditProvider
        // Save cycle's own state updates.
        startTransition(() => router.refresh());
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
    if (!result || result.ok !== false) {
      startTransition(() => router.refresh());
      // Reset the form back to blank after a successful add (2026-08-13, see
      // conversation) — loaded/syncedLoadedId both stay null throughout a
      // plain "add new" flow (editingId never gets set), so the resync
      // effect above never re-fires on its own here; without this, adding a
      // second new revision in the same session would start pre-filled with
      // whatever was just submitted, the same "should always start empty"
      // bug this fix targets, just one save later.
      setIssuedDate("");
      setEffectiveDate("");
      setCurrentSalary("");
      setNewSalary("");
      setReason("");
      setApprovedBy("");
      setPendingFile(null);
    }
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
      startTransition(() => router.refresh());
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
            className="text-xs text-[#4a90e2] dark:text-blue-400 hover:underline shrink-0"
          >
            Cancel edit — add new revision instead
          </button>
        )}
      </div>
      <FieldGrid>
        <EditableField label="Issue Date" value={issuedDate} onChange={setIssuedDate} type="date" />
        <EditableField label="Effective Date" value={effectiveDate} onChange={setEffectiveDate} type="date" />
        <CurrencyField label="Current Salary" value={currentSalary} onChange={setCurrentSalary} />
        <CurrencyField label="New Salary" value={newSalary} onChange={setNewSalary} />
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
export function SalaryRevisionPanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: SalaryRevisionEntry[];
  canEdit?: boolean;
}) {
  const ref = useRef<SalaryRevisionHandle>(null);
  return (
    <EditableSection onSave={() => ref.current?.save()} canEdit={canEdit} sectionLabel="Salary Revision">
      <SalaryRevisionFields ref={ref} userId={userId} data={data} />
    </EditableSection>
  );
}

export function PromotionPanel({
  userId,
  data,
  currentPosition,
  canEdit = true,
}: {
  userId: number;
  data: PromotionEntry[];
  /** Employee's actual current position (employment.position) — pre-fills
   *  "Current Position" so it doesn't need manual re-entry every time. */
  currentPosition?: string | null;
  canEdit?: boolean;
}) {
  return (
    <EditableSection canEdit={canEdit}>
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
        canEdit={canEdit}
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
  canEdit = true,
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
  canEdit?: boolean;
}) {
  const branchOptionGroup = { label: "Branch", options: branches.map((b) => ({ value: b.name, label: b.name })) };
  const departmentOptionGroup = { label: "Department", options: departments.map((d) => ({ value: d.name, label: d.name })) };
  const locationOptionGroups = [branchOptionGroup, departmentOptionGroup];
  // "To"'s valid location groups depend on the picked Type (2026-08-13, see
  // conversation): a transfer landing at HQ (...TO HQ) only makes sense as a
  // Department pick, one landing at a Branch (...TO BRANCH) only as a Branch
  // pick, and Temporary Transfer — the one type not modeling a permanent
  // HQ/Branch move — keeps both groups combined, same as before this change.
  // Empty (no options at all) until Type is picked, same "pick the
  // constraining field first" convention as Add Pre-stage Employee's own
  // Branch/Department-scoped Position field.
  function toLocationGroupsForType(type: string | undefined) {
    if (type === "HQ TO HQ" || type === "BRANCH TO HQ") return [departmentOptionGroup];
    if (type === "BRANCH TO BRANCH" || type === "HQ TO BRANCH") return [branchOptionGroup];
    if (type === "Temporary Transfer") return locationOptionGroups;
    return [];
  }
  return (
    <EditableSection canEdit={canEdit}>
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
          { key: "toLocation", label: "To", type: "select", optionGroupsFor: (values) => toLocationGroupsForType(values.type) },
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
        canEdit={canEdit}
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

export function TrainingPanel({ userId, data, canEdit = true }: { userId: number; data: TrainingEntry[]; canEdit?: boolean }) {
  return (
    <EditableSection canEdit={canEdit}>
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
        canEdit={canEdit}
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
export function NdaPanel({ userId, data, canEdit = true }: { userId: number; data: NdaInfo | null; canEdit?: boolean }) {
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
      canEdit={canEdit}
      sectionLabel="NDA"
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
export function NonCompetePanel({ userId, data, canEdit = true }: { userId: number; data: NonCompeteInfo | null; canEdit?: boolean }) {
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
      canEdit={canEdit}
      sectionLabel="Non-Compete"
    >
      <PanelHeading>Non-Compete</PanelHeading>
      <FieldGrid>
        <EditableField label="Signed Date" value={signDate} onChange={setSignDate} type="date" />
        <EditableField label="Expiry Date" value={expiryDate} onChange={setExpiryDate} type="date" />
        <DurationField label="Duration" value={duration} onChange={setDuration} full />
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
  canEdit = true,
}: {
  userId: number;
  ndaData: NdaInfo | null;
  nonCompeteData: NonCompeteInfo | null;
  canEdit?: boolean;
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
      canEdit={canEdit}
      sectionLabel="NDA/ NC"
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
        <DurationField label="Duration" value={ncDuration} onChange={setNcDuration} full />
        <RealFileField label="Attachment" existingFileId={ncFileId} pendingFile={ncPending} onPick={setNcPending} onClear={clearNcFile} full />
      </Subsection>
    </EditableSection>
  );
}

// Stage-flow's Active > Disciplinary tab is a single combined summary
// (Date/Type/Description) per active_disciplinary.html — still no ADD form
// here (that stays exclusive to Employee Record's Disciplinary category,
// per explicit decision). A row is always clickable, regardless of the
// page's own Edit toggle (2026-08-13, see conversation, same shared
// RecordTable/RecordAddModal pattern every other repeatable table now
// uses) — opens read-only by default, with an in-modal Edit button (gated
// on `canEdit` — e.g. a CEO viewing someone else's profile still gets a
// view, just no Edit button) switching to the same real update actions
// each type's own dedicated Employee Record panel uses, reusing the exact
// same field configs (DOMESTIC_INQUIRY_FIELDS/SUSPENSION_FIELDS/
// SHOWCAUSE_FIELDS/PIP_FIELDS + their own *EditValues functions) rather
// than duplicating them.
export function DisciplinarySummaryPanel({
  userId,
  data,
  domesticInquiries,
  suspensionLetters,
  showcauseWarningLetters,
  pips,
  canEdit = true,
}: {
  userId: number;
  data: DisciplinarySummaryRow[];
  domesticInquiries: DomesticInquiryEntry[];
  suspensionLetters: SuspensionLetterEntry[];
  showcauseWarningLetters: ShowcauseWarningLetterEntry[];
  pips: PipEntry[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  // Not wrapped in its own EditableSection (unlike Achievement/Promotion/
  // etc, each of which reads this via useEditMode() from their own
  // wrapper) — this panel renders directly inside Active's own
  // PageEditProvider, so its "is the page already in edit mode" signal
  // has to come from that context directly instead. null (no provider —
  // e.g. viewed as history from Exit) reads as "not editing", same as
  // every other page this panel could be viewed from that has no Edit
  // toggle of its own.
  const pageEdit = usePageEditContext();
  const editing = pageEdit?.isEditing ?? false;

  const [editingRow, setEditingRow] = useState<DisciplinarySummaryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setEditingRow(null);
    setError(null);
  }

  async function handleSave(values: Record<string, string>, files: Record<string, File>) {
    if (!editingRow) return;
    setSaving(true);
    setError(null);
    try {
      let result: SaveResult;
      if (editingRow.sourceType === "domestic-inquiry") {
        result = await updateDomesticInquiry(userId, editingRow.id, {
          date: values.date ?? "",
          panel: values.panel ?? "",
          caseSummary: values.caseSummary ?? "",
          decision: values.decision ?? "",
          attachmentFile: files.attachment ?? null,
        });
      } else if (editingRow.sourceType === "suspension") {
        result = await updateSuspensionLetter(userId, editingRow.id, {
          startDate: values.startDate ?? "",
          endDate: values.endDate ?? "",
          type: values.type ?? "",
          reason: values.reason ?? "",
          issuedBy: values.issuedBy ?? "",
          attachmentFile: files.attachment ?? null,
        });
      } else if (editingRow.sourceType === "showcause") {
        const type = values.type === "Other" ? values.typeOther ?? "" : values.type ?? "";
        result = await updateShowcauseWarningLetter(userId, editingRow.id, {
          type,
          date: values.date ?? "",
          issuedBy: values.issuedBy ?? "",
          status: values.status ?? "",
          reason: values.reason ?? "",
          empResponse: values.empResponse ?? "",
          attachmentFile: files.attachment ?? null,
        });
      } else {
        result = await updatePip(userId, editingRow.id, {
          startDate: values.startDate ?? "",
          endDate: values.endDate ?? "",
          supervisor: values.supervisor ?? "",
          reviewResult: values.reviewResult ?? "",
          improvementGoal: values.improvementGoal ?? "",
          remark: values.remark ?? "",
        });
      }
      if (result && result.ok === false) {
        setError(result.error ?? "Save failed.");
        setSaving(false);
        return;
      }
      setSaving(false);
      close();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  // Looks up the clicked row's own full raw record (the merged summary row
  // itself only carries Date/Type/Description) and pairs it with that
  // type's own field config — undefined (renders nothing) for the brief
  // window between a row click and this resolving, or if the row's own
  // array hasn't caught up yet after a save elsewhere.
  const modalConfig = (() => {
    if (!editingRow) return undefined;
    if (editingRow.sourceType === "domestic-inquiry") {
      const raw = domesticInquiries.find((r) => r.id === editingRow.id);
      return raw && { title: "Domestic Inquiry", fields: DOMESTIC_INQUIRY_FIELDS, initialValues: domesticInquiryEditValues(raw), initialFileIds: { attachment: raw.attachmentFileId } };
    }
    if (editingRow.sourceType === "suspension") {
      const raw = suspensionLetters.find((r) => r.id === editingRow.id);
      return raw && { title: "Suspension Letter", fields: SUSPENSION_FIELDS, initialValues: suspensionEditValues(raw), initialFileIds: { attachment: raw.attachmentFileId } };
    }
    if (editingRow.sourceType === "showcause") {
      const raw = showcauseWarningLetters.find((r) => r.id === editingRow.id);
      return raw && { title: "Showcause/ Warning Letter", fields: SHOWCAUSE_FIELDS, initialValues: showcauseEditValues(raw), initialFileIds: { attachment: raw.attachmentFileId } };
    }
    const raw = pips.find((r) => r.id === editingRow.id);
    return raw && { title: "Performance Improvement Plan", fields: PIP_FIELDS, initialValues: pipEditValues(raw), initialFileIds: undefined };
  })();

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
        onRowClick={(i) => setEditingRow(data[i])}
      />
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Full disciplinary records (Domestic Inquiry, Suspension, Showcause/Warning, PIP) are added from this
        employee&apos;s Employee Record &gt; Disciplinary section.
      </p>
      {modalConfig && (
        <RecordAddModal
          title={`Edit ${modalConfig.title}`}
          fields={modalConfig.fields}
          saving={saving}
          error={error}
          initialValues={modalConfig.initialValues}
          initialFileIds={modalConfig.initialFileIds}
          startReadOnly={!editing}
          canEdit={canEdit}
          onClose={close}
          onSave={handleSave}
        />
      )}
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

// Shared with DisciplinarySummaryPanel's own click-to-edit modal (Active
// stage, 2026-08-13, see conversation) — one definition per type, reused
// rather than duplicated, so a future field change here doesn't silently
// drift out of sync between the two places it's edited from.
const DOMESTIC_INQUIRY_FIELDS: RecordField[] = [
  { key: "date", label: "Inquiry Date", type: "date", full: true },
  { key: "panel", label: "Panel", type: "text", full: true },
  { key: "caseSummary", label: "Case Summary", type: "textarea", full: true },
  { key: "decision", label: "Decision", type: "select", options: DOMESTIC_INQUIRY_DECISION_OPTIONS, full: true },
  { key: "attachment", label: "Attachment", type: "file", full: true },
];
function domesticInquiryEditValues(r: DomesticInquiryEntry): RecordEditValues {
  return {
    date: r.date ?? "",
    panel: r.panel ?? "",
    caseSummary: r.caseSummary ?? "",
    decision: r.decision ?? "",
  };
}

export function DomesticInquiryPanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: DomesticInquiryEntry[];
  canEdit?: boolean;
}) {
  return (
    <EditableSection canEdit={canEdit}>
      <RepeatableRecordSection
        heading="Domestic Inquiry"
        addLabel="+ Add a domestic inquiry record"
        fields={DOMESTIC_INQUIRY_FIELDS}
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
        editValues={data.map(domesticInquiryEditValues)}
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
        canEdit={canEdit}
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

// Shared with DisciplinarySummaryPanel — see DOMESTIC_INQUIRY_FIELDS' own comment.
const SUSPENSION_FIELDS: RecordField[] = [
  { key: "startDate", label: "Suspension Start", type: "date" },
  { key: "endDate", label: "Suspension End", type: "date" },
  { key: "type", label: "Suspension Type", type: "select", options: SUSPENSION_TYPE_OPTIONS, full: true },
  { key: "reason", label: "Reason", type: "textarea", full: true },
  { key: "issuedBy", label: "Issued by", type: "text", full: true },
  { key: "attachment", label: "Attachment", type: "file", full: true },
];
function suspensionEditValues(r: SuspensionLetterEntry): RecordEditValues {
  return {
    startDate: r.startDate ?? "",
    endDate: r.endDate ?? "",
    type: r.type ?? "",
    reason: r.reason ?? "",
    issuedBy: r.issuedBy ?? "",
  };
}

export function SuspensionPanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: SuspensionLetterEntry[];
  canEdit?: boolean;
}) {
  return (
    <EditableSection canEdit={canEdit}>
      <RepeatableRecordSection
        heading="Suspension Letter"
        addLabel="+ Add a suspension letter record"
        fields={SUSPENSION_FIELDS}
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
        editValues={data.map(suspensionEditValues)}
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
        canEdit={canEdit}
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

// Status was a bare free-text field until now (2026-08-13, see conversation)
// — showcause_warning_letter.status already exists as a plain varchar
// column (no schema change needed), just never had fixed options in the UI.
const SHOWCAUSE_STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "Issued", label: "Issued" },
  { value: "Under Review", label: "Under Review" },
  { value: "Action Taken", label: "Action Taken" },
  { value: "Closed", label: "Closed" },
];

// Shared with DisciplinarySummaryPanel — see DOMESTIC_INQUIRY_FIELDS' own comment.
const SHOWCAUSE_FIELDS: RecordField[] = [
  { key: "type", label: "Case Type", type: "select", options: SHOWCAUSE_CASE_TYPE_OPTIONS },
  { key: "typeOther", label: "Please specify", type: "text", visibleWhen: (values) => values.type === "Other" },
  { key: "date", label: "Issued Date", type: "date" },
  { key: "issuedBy", label: "Issued by", type: "text" },
  { key: "status", label: "Status", type: "select", options: SHOWCAUSE_STATUS_OPTIONS },
  { key: "reason", label: "Reason", type: "textarea", full: true },
  { key: "empResponse", label: "Employee Responses", type: "textarea", full: true },
  { key: "attachment", label: "Attachment", type: "file", full: true },
];
// Older rows (or ones entered before this dropdown existed) may hold a case
// type string that isn't one of the fixed options — treat those the same as
// a fresh "Other" pick so the existing free text still shows up instead of
// silently not matching any option (same convention as Training's Status
// dropdown).
function showcauseEditValues(r: ShowcauseWarningLetterEntry): RecordEditValues {
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
}

export function ShowcausePanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: ShowcauseWarningLetterEntry[];
  canEdit?: boolean;
}) {
  return (
    <EditableSection canEdit={canEdit}>
      <RepeatableRecordSection
        heading="Showcause/ Warning Letter"
        addLabel="+ Add a showcause/warning letter record"
        fields={SHOWCAUSE_FIELDS}
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
        editValues={data.map(showcauseEditValues)}
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
        canEdit={canEdit}
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

// Shared with DisciplinarySummaryPanel — see DOMESTIC_INQUIRY_FIELDS' own comment.
const PIP_FIELDS: RecordField[] = [
  { key: "startDate", label: "Start Date", type: "date" },
  { key: "endDate", label: "End Date", type: "date" },
  { key: "supervisor", label: "Supervisor", type: "text" },
  { key: "reviewResult", label: "Review Result", type: "select", options: PIP_REVIEW_RESULT_OPTIONS },
  { key: "improvementGoal", label: "Improvement Goals", type: "textarea", full: true },
  { key: "remark", label: "Remarks", type: "text", full: true },
];
function pipEditValues(r: PipEntry): RecordEditValues {
  return {
    startDate: r.startDate ?? "",
    endDate: r.endDate ?? "",
    supervisor: r.supervisor ?? "",
    reviewResult: r.reviewResult ?? "",
    improvementGoal: r.improvementGoal ?? "",
    remark: r.remark ?? "",
  };
}

export function PipPanel({ userId, data, canEdit = true }: { userId: number; data: PipEntry[]; canEdit?: boolean }) {
  return (
    <EditableSection canEdit={canEdit}>
      <RepeatableRecordSection
        heading="Performance Improvement Plan"
        addLabel="+ Add a PIP record"
        fields={PIP_FIELDS}
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
        editValues={data.map(pipEditValues)}
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
        canEdit={canEdit}
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

export function ResignationPanel({ userId, data, canEdit = true }: { userId: number; data: ResignationInfo | null; canEdit?: boolean }) {
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
      canEdit={canEdit}
      sectionLabel="Resignation"
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

export function ReferenceLetterPanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: ReferenceLetterInfo | null;
  canEdit?: boolean;
}) {
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
      canEdit={canEdit}
      sectionLabel="Reference Letter"
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

export function ExitInterviewNotesPanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: ExitInterviewNoteInfo | null;
  canEdit?: boolean;
}) {
  const [date, setDate] = useState(data?.date ?? "");
  const [interviewer, setInterviewer] = useState(data?.interviewer ?? "");
  const [reason, setReason] = useState(data?.reason ?? "");
  const [reasonOther, setReasonOther] = useState(data?.reasonOther ?? "");
  const [note, setNote] = useState(data?.note ?? "");

  return (
    <EditableSection
      onSave={() =>
        updateExitInterviewNote(userId, {
          date,
          interviewer,
          reason,
          // Only persisted when reason is actually "other" — same convention
          // as Showcause's Case Type/Training's Status own *Other fields, so
          // a stale answer left over from a since-changed reason never lingers.
          reasonOther: reason === "other" ? reasonOther : "",
          note,
        })
      }
      canEdit={canEdit}
      sectionLabel="Exit Interview Notes"
    >
      <PanelHeading>Exit Interview Notes</PanelHeading>
      <FieldGrid>
        <EditableField label="Interview Date" value={date} onChange={setDate} type="date" />
        <EditableField label="Interviewer" value={interviewer} onChange={setInterviewer} />
        <EditableSelectField label="Primary Reason for Leaving" value={reason} onChange={setReason} options={EXIT_REASON_OPTIONS} full />
        {reason === "other" && (
          <EditableField label="Please specify" value={reasonOther} onChange={setReasonOther} full />
        )}
        <EditableTextArea label="Feedback / Notes" value={note} onChange={setNote} full />
      </FieldGrid>
    </EditableSection>
  );
}

// Exit > Clearance's 3 checklists (Knowledge Transfer/Asset Recovery/System
// Revocation) — real now, per explicit design (see conversation). ONE
// Save button total (EditableSection's own top-right one) — checking/
// unchecking, deleting an item, and typing a new item's label all just
// accumulate in local state; clicking Save batches everything: toggle calls
// for changed rows, delete calls for pending-deleted rows, and (if a new
// label was typed) an add call. Adding/deleting a row is HR/Superadmin-only
// (canAddItem, resolved server-side from the session role — see the
// page-level fetch); toggling is open to any in-scope role. If a new label
// is pending, Save first blocks on AddItemScopeDialog ("Apply to all
// employees" writes a global item, user_id null; "Only this employee"
// scopes it to just this one) before the batch actually runs — canceling
// that dialog voids the WHOLE pending batch, not just the new item: this
// app's Edit/Save model has no separate Cancel (EditMode.tsx's own button
// always flips Edit -> Save, no third state), so a half-committed save
// would be a more confusing outcome than discarding everything.
function AddItemScopeDialog({ onCancel, onChoose }: { onCancel: () => void; onChoose: (scope: "all" | "employee") => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-[360px] max-h-full overflow-y-auto box-border bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-2xl px-6 pt-7 pb-6 shadow-[0_12px_32px_0_#00000026] text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-[#4b4949] dark:text-slate-300 mb-[22px]">Add this item to:</p>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onChoose("all")}
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-white bg-[#4a90e2] hover:bg-[#3a7bc8] transition-colors"
          >
            Apply to all employees
          </button>
          <button
            type="button"
            onClick={() => onChoose("employee")}
            className="min-h-11 rounded-[10px] px-6 py-2.5 text-sm font-medium text-[#4b4949] dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-black/25 dark:border-white/25 hover:bg-[#f0f4fa] dark:hover:bg-slate-700 transition-colors"
          >
            Only this employee
          </button>
          <button type="button" onClick={onCancel} className="mt-1 text-xs text-slate-500 dark:text-slate-400 hover:underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ExitChecklistPanel({
  heading,
  userId,
  items,
  canAddItem,
  canEdit = true,
  onToggle,
  onRename,
  onAdd,
  onDelete,
}: {
  heading: string;
  userId: number;
  items: ExitChecklistItem[];
  canAddItem: boolean;
  canEdit?: boolean;
  onToggle: (userId: number, itemId: number, checked: boolean) => Promise<ActionResult>;
  onRename: (userId: number, itemId: number, label: string) => Promise<ActionResult>;
  onAdd: (userId: number, input: AddExitChecklistItemInput) => Promise<ActionResult>;
  onDelete: (userId: number, itemId: number) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pendingChecked, setPendingChecked] = useState<Record<number, boolean>>({});
  const [pendingLabels, setPendingLabels] = useState<Record<number, string>>({});
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const [newLabel, setNewLabel] = useState("");
  const [choosingScope, setChoosingScope] = useState(false);
  const scopeChoiceRef = useRef<((scope: "all" | "employee" | null) => void) | null>(null);

  function resetPending() {
    setPendingChecked(Object.fromEntries(items.map((item) => [item.id, item.checked])));
    setPendingLabels(Object.fromEntries(items.map((item) => [item.id, item.label])));
    setPendingDeleteIds(new Set());
    setNewLabel("");
  }

  // Re-baselines whenever fresh data arrives (mount, and after this panel's
  // own post-Save router.refresh() below) — items is the source of truth;
  // pendingChecked/pendingLabels/pendingDeleteIds/newLabel only exist to
  // hold in-progress edits between here and the next Save.
  useEffect(() => {
    resetPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function handleSave(): Promise<SaveResult> {
    let scope: "all" | "employee" | null = null;
    const label = newLabel.trim();
    if (label) {
      scope = await new Promise<"all" | "employee" | null>((resolve) => {
        scopeChoiceRef.current = resolve;
        setChoosingScope(true);
      });
      setChoosingScope(false);
      if (scope === null) {
        resetPending();
        return { ok: true };
      }
    }

    const toggled = items.filter((item) => !pendingDeleteIds.has(item.id) && pendingChecked[item.id] !== item.checked);
    const renamed = items.filter(
      (item) => !pendingDeleteIds.has(item.id) && pendingLabels[item.id]?.trim() && pendingLabels[item.id].trim() !== item.label,
    );
    const deleted = items.filter((item) => pendingDeleteIds.has(item.id));
    if (toggled.length === 0 && renamed.length === 0 && deleted.length === 0 && !label) return { ok: true };

    const results = await Promise.all([
      ...toggled.map((item) => onToggle(userId, item.id, pendingChecked[item.id])),
      ...renamed.map((item) => onRename(userId, item.id, pendingLabels[item.id].trim())),
      ...deleted.map((item) => onDelete(userId, item.id)),
      ...(label ? [onAdd(userId, { label, scope: scope! })] : []),
    ]);
    const failed = results.find((r) => r && r.ok === false);
    if (failed) return failed;
    router.refresh();
    return { ok: true };
  }

  return (
    <EditableSection onSave={handleSave} canEdit={canEdit} sectionLabel={heading}>
      <PanelHeading>{heading}</PanelHeading>
      <ExitChecklistItems
        items={items.filter((item) => !pendingDeleteIds.has(item.id))}
        pendingChecked={pendingChecked}
        pendingLabels={pendingLabels}
        canEditItem={canAddItem}
        onChange={(id, checked) => setPendingChecked((prev) => ({ ...prev, [id]: checked }))}
        onLabelChange={(id, label) => setPendingLabels((prev) => ({ ...prev, [id]: label }))}
        onDelete={(id) => setPendingDeleteIds((prev) => new Set(prev).add(id))}
        userId={userId}
        onToggle={onToggle}
        canEdit={canEdit}
      />
      {canAddItem && <ExitChecklistAddItemRow value={newLabel} onChange={setNewLabel} />}
      {choosingScope && (
        <AddItemScopeDialog
          onCancel={() => scopeChoiceRef.current?.(null)}
          onChoose={(scope) => scopeChoiceRef.current?.(scope)}
        />
      )}
    </EditableSection>
  );
}

// Rename permission mirrors add/delete exactly (canEditItem, HR/Superadmin
// only — see conversation) — everyone else in Edit mode can still toggle
// checkboxes but sees static label text, never an input. Like every other
// field in this app (EditableField/PhoneField/etc.), the label just IS an
// <input> once editing+canEditItem are both true — "click the text to edit
// it" is simply what focusing a normal text input looks like, no separate
// static-to-input toggle step, consistent with the rest of the app.
//
// Checking/unchecking is deliberately NOT gated on `editing` (fixed
// 2026-08-13, see conversation — was gated the same as rename/delete/add
// until now) — it works at any time, still respecting canEdit (the
// panel-level permission, e.g. a CEO viewing someone else's profile) as its
// only gate. Rename/delete/add are UNCHANGED — still require both editing
// AND canEditItem (HR/Superadmin), exactly as before. The mechanism differs
// by mode: while editing, a toggle still just stages into pendingChecked
// (unchanged), batched into whatever ExitChecklistPanel's own Save
// eventually submits; outside edit mode there is no page-level Save to
// batch with at all, so the toggle calls onToggle directly and refreshes
// immediately, in addition to (not instead of) the same optimistic
// pendingChecked update — so the checkbox reflects the click instantly
// either way, and there's nothing left to submit if the user later does
// enter edit mode (items itself will already reflect the saved value by
// then, so handleSave's own toggled-vs-item.checked diff comes up empty).
function ExitChecklistItems({
  items,
  pendingChecked,
  pendingLabels,
  canEditItem,
  onChange,
  onLabelChange,
  onDelete,
  userId,
  onToggle,
  canEdit,
}: {
  items: ExitChecklistItem[];
  pendingChecked: Record<number, boolean>;
  pendingLabels: Record<number, string>;
  canEditItem: boolean;
  onChange: (itemId: number, checked: boolean) => void;
  onLabelChange: (itemId: number, label: string) => void;
  onDelete: (itemId: number) => void;
  userId: number;
  onToggle: (userId: number, itemId: number, checked: boolean) => Promise<ActionResult>;
  canEdit: boolean;
}) {
  const editing = useEditMode();
  const router = useRouter();
  const [savingId, setSavingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleImmediateToggle(itemId: number, checked: boolean) {
    setSavingId(itemId);
    setToggleError(null);
    try {
      const result = await onToggle(userId, itemId, checked);
      if (result && result.ok === false) {
        setToggleError(result.error ?? "Failed to save.");
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : "Failed to save.");
    }
    setSavingId(null);
  }

  return (
    <>
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={pendingChecked[item.id] ?? false}
            disabled={!canEdit || savingId === item.id}
            onChange={(e) => {
              const checked = e.target.checked;
              onChange(item.id, checked);
              if (!editing && canEdit) handleImmediateToggle(item.id, checked);
            }}
            className="w-4 h-4 shrink-0 rounded border-slate-300 dark:border-slate-500 disabled:cursor-not-allowed"
          />
          {editing && canEditItem ? (
            <input
              type="text"
              value={pendingLabels[item.id] ?? item.label}
              onChange={(e) => onLabelChange(item.id, e.target.value)}
              className="flex-1 min-w-0 text-sm text-[#4b4949] dark:text-slate-100 bg-transparent border-0 border-b border-slate-300 dark:border-slate-500 px-0 py-0.5 focus:outline-none focus:border-blue-500"
            />
          ) : (
            <span className="text-sm text-[#4b4949] dark:text-slate-300 flex-1">{item.label}</span>
          )}
          {editing && canEditItem && (
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              aria-label={`Delete "${item.label}"`}
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900 text-sm leading-none"
            >
              −
            </button>
          )}
        </li>
      ))}
    </ul>
    {toggleError && <p className="mt-2 text-xs text-red-600">{toggleError}</p>}
    </>
  );
}

// Gated by useEditMode(), same as every other editable field in this app —
// only shown once Edit is clicked (canAddItem, the HR/Superadmin role gate,
// is checked by the caller separately). Save is a single accumulate-locally
// text field now, not its own button — ExitChecklistPanel's own top-right
// Save reads this value at commit time (see handleSave's `label` there).
function ExitChecklistAddItemRow({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editing = useEditMode();
  if (!editing) return null;
  return (
    <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add a new checklist item…"
        className="w-full h-10 rounded-[10px] bg-[#f0f0f0a6] dark:bg-slate-950 border-0 px-3.5 text-sm text-[#4b4949] dark:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      />
    </div>
  );
}

export function KnowledgeTransferPanel({
  userId,
  items,
  canAddItem,
  canEdit = true,
}: {
  userId: number;
  items: ExitChecklistItem[];
  canAddItem: boolean;
  canEdit?: boolean;
}) {
  return (
    <ExitChecklistPanel
      heading="Clearance – Knowledge Transfer"
      userId={userId}
      items={items}
      canAddItem={canAddItem}
      canEdit={canEdit}
      onToggle={toggleKnowledgeTransferItem}
      onRename={renameKnowledgeTransferItem}
      onAdd={addKnowledgeTransferItem}
      onDelete={deleteKnowledgeTransferItem}
    />
  );
}

export function AssetRecoveryPanel({
  userId,
  items,
  canAddItem,
  canEdit = true,
}: {
  userId: number;
  items: ExitChecklistItem[];
  canAddItem: boolean;
  canEdit?: boolean;
}) {
  return (
    <ExitChecklistPanel
      heading="Clearance – Asset Recovery"
      userId={userId}
      items={items}
      canAddItem={canAddItem}
      canEdit={canEdit}
      onToggle={toggleAssetRecoveryItem}
      onRename={renameAssetRecoveryItem}
      onAdd={addAssetRecoveryItem}
      onDelete={deleteAssetRecoveryItem}
    />
  );
}

export function SystemRevocationPanel({
  userId,
  items,
  canAddItem,
  canEdit = true,
}: {
  userId: number;
  items: ExitChecklistItem[];
  canAddItem: boolean;
  canEdit?: boolean;
}) {
  return (
    <ExitChecklistPanel
      heading="Clearance – System Revocation"
      userId={userId}
      items={items}
      canAddItem={canAddItem}
      canEdit={canEdit}
      onToggle={toggleSystemRevocationItem}
      onRename={renameSystemRevocationItem}
      onAdd={addSystemRevocationItem}
      onDelete={deleteSystemRevocationItem}
    />
  );
}

export function FinancialSettlementPanel({
  userId,
  data,
  canEdit = true,
}: {
  userId: number;
  data: FinancialSettlementInfo | null;
  canEdit?: boolean;
}) {
  const [finalPayDate, setFinalPayDate] = useState(data?.finalPayDate ?? "");
  const [outstandingLeavePayout, setOutstandingLeavePayout] = useState(data?.outstandingLeavePayout ?? "");
  const [outstandingClaims, setOutstandingClaims] = useState(data?.outstandingClaims ?? "");
  const [loanAdvanceDeduction, setLoanAdvanceDeduction] = useState(data?.loanAdvanceDeduction ?? "");
  const [notes, setNotes] = useState(data?.notes ?? "");
  const [fileId, setFileId] = useState(data?.settlementLetterFileId ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function clearFile() {
    if (pendingFile) setPendingFile(null);
    else setFileId(null);
  }

  return (
    <EditableSection
      onSave={() =>
        updateFinancialSettlement(userId, {
          finalPayDate,
          outstandingLeavePayout,
          outstandingClaims,
          loanAdvanceDeduction,
          notes,
          settlementLetterFileId: fileId,
          settlementLetterFile: pendingFile,
        })
      }
      canEdit={canEdit}
      sectionLabel="Clearance – Financial Settlement"
    >
      <PanelHeading>Clearance – Financial Settlement</PanelHeading>
      <FieldGrid>
        <EditableField label="Final Pay Date" value={finalPayDate} onChange={setFinalPayDate} type="date" />
        <CurrencyField label="Outstanding Leave Payout" value={outstandingLeavePayout} onChange={setOutstandingLeavePayout} />
        <CurrencyField label="Outstanding Claims" value={outstandingClaims} onChange={setOutstandingClaims} />
        <CurrencyField label="Loan / Advance Deduction" value={loanAdvanceDeduction} onChange={setLoanAdvanceDeduction} />
        <EditableTextArea label="Notes" value={notes} onChange={setNotes} full />
        <RealFileField label="Settlement Letter" existingFileId={fileId} pendingFile={pendingFile} onPick={setPendingFile} onClear={clearFile} full />
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
  canEdit = true,
}: {
  employee: EmployeeDetailFull;
  employeeId: number;
  showOfferLetter?: boolean;
  canEdit?: boolean;
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

  // Same checks as handleSave's own inline guard below, extracted so a
  // PageEditProvider (see PageEditMode.tsx) can validate this section
  // without attempting the actual save — handleSave's own checks stay as
  // they are (untouched) so standalone usage (e.g. Pre stage's own Personal
  // Info tab) keeps validating exactly as before this existed.
  function validate(): ValidationResult {
    const errors: string[] = [];
    if (!fullName.trim()) errors.push("Full Name cannot be empty.");
    if (!isValidEmail(email)) errors.push("Enter a valid email address.");
    if (phone && !isValidPhoneDigits(parsePhoneValue(phone).digits)) errors.push("Enter a valid phone number.");
    return errors.length > 0 ? { valid: false, error: errors.join("\n") } : { valid: true };
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
    <EditableSection onSave={handleSave} validate={validate} canEdit={canEdit} sectionLabel="Personal Info">
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
  canEdit = true,
}: {
  employee: EmployeeDetailFull;
  onSave: (data: {
    name: string;
    phone: string;
    relation: string;
    email: string;
    address: string;
  }) => Promise<{ ok: boolean; error?: string } | void>;
  canEdit?: boolean;
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

  // Same checks as handleSave's own inline guard — see PersonalInfoPanel's
  // validate() above for why this is a separate function rather than a
  // dry-run flag on handleSave itself.
  function validate(): ValidationResult {
    const errors: string[] = [];
    if (phone && !isValidPhoneDigits(parsePhoneValue(phone).digits)) errors.push("Enter a valid phone number.");
    if (email && !isValidEmail(email)) errors.push("Enter a valid email address.");
    return errors.length > 0 ? { valid: false, error: errors.join("\n") } : { valid: true };
  }

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
    <EditableSection onSave={handleSave} validate={validate} canEdit={canEdit} sectionLabel="Emergency Contact">
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
  CurrencyField,
  Subsection,
  RecordTable,
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
