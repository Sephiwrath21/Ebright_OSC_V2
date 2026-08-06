"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { initialsFromName } from "@/lib/text";
import { EMPLOYEE_RECORD_CATEGORIES, type RecordCategory } from "@/lib/employeeRecordConfig";
import { STAGE_LABELS, type EmployeeStage } from "@/lib/employeeStages";
import {
  PanelHeading,
  Subsection,
  RecordTable,
  EditableField,
  EditableSelectField,
  EmergencyContactPanel,
  PersonalInfoPanel,
  ResumePanel,
  ReferenceCheckPanel,
  MedicalCheckPanel,
  DocumentsPanel,
  OnboardingPayrollPanel,
  AchievementPanel,
  PromotionPanel,
  TransferPanel,
  TrainingPanel,
  NdaNcPanel,
  DomesticInquiryPanel,
  SuspensionPanel,
  ShowcausePanel,
  PipPanel,
  RealAttachmentLink,
} from "@/app/components/ActiveProfilePanels";
import { EditableSection } from "@/app/components/EditMode";
import {
  EMPLOYEE_RECORD_STATIC_PANELS,
  PayrollPanel,
  GuardianInfoPanel,
  PerformanceReviewPanel,
  TaskPendingPanel,
  TaskOverduePanel,
} from "@/app/components/EmployeeRecordPanels";
import { updateBankDetails, updateEmergencyContact, updatePaymentInfo } from "@/lib/employeeRecordActions";
import type {
  EmployeeDetailFull,
  BranchOpt,
  DepartmentOpt,
  LeaveHistoryRow,
  ResumeInfo,
  ReferenceCheckInfo,
  MedicalCheckInfo,
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
  GuardianInfoEntry,
  PaymentInfoData,
  PerformanceReviewEntry,
  PayslipInfo,
  EmployeeTasksSummary,
} from "@/lib/employeeQueries";

// Vertical sub-nav rail — green, from category_shared.css (shared by every
// Employee Record category, e.g. Personal Info / Guardian Info / Payment &
// Bank Info / Emergency Contact under "Personal Info"). Hidden entirely on
// touch devices ([@media(hover:none)]:hidden below) — width is a literal
// w-[210px] Tailwind class since it now only ever renders at its one fixed
// desktop size.
const RAIL_GAP_PX = 10;
const RAIL_BASE = "bg-[#b0ffbfa8] border-[#0a6e03] text-[#4b4949d6]";
const RAIL_CURRENT = "bg-[#0a6e03] border-[#063f02] text-white";

interface Props {
  employeeId: number;
  employeeName: string;
  category: RecordCategory;
  sectionKey: string;
  /** Position/Branch/Department/current stage — from the same EmployeeOverviewRow
   *  already fetched unconditionally on every page load (for the notFound() check),
   *  so this profile summary shows on every category/section, not just Personal Info. */
  position?: string | null;
  branchName?: string | null;
  departmentName?: string | null;
  stage?: EmployeeStage;
  /** employment.employee_id — only assigned from Probation/Onboarding onward, so this is
   *  null (and hidden) for anyone still in Pre. */
  employeeCode?: string | null;
  /** Real user_profile/bank_details/emergency_contact data — only fetched for Personal Info's 3 data sections. */
  employeeDetail?: EmployeeDetailFull | null;
  /** Real leave_request rows — only fetched for Active Employment > Leave. */
  leaveHistory?: LeaveHistoryRow[];
  /** Real resume table data — only fetched for HR Info > Resume/CV. */
  resumeInfo?: ResumeInfo | null;
  /** Real reference_check table data — only fetched for HR Info > Reference. */
  referenceCheck?: ReferenceCheckInfo | null;
  /** Real medical_check table data — only fetched for HR Info > Medical Check. */
  medicalCheck?: MedicalCheckInfo | null;
  /** Real documents table data — only fetched for HR Info > Handbook. */
  documentsInfo?: DocumentsInfo | null;
  /** Real payroll table data — only fetched for Finance > Tax Info. */
  payrollInfo?: PayrollInfo | null;
  /** Real achievement rows — only fetched for Active Employment > Cert./Achievement. */
  achievements?: AchievementEntry[];
  /** Real salary_revision rows — only fetched for Finance > Payroll/Payslip. */
  salaryRevisions?: SalaryRevisionEntry[];
  /** Real promotion rows — only fetched for Active Employment > Promotion. */
  promotions?: PromotionEntry[];
  /** Real transfer rows — only fetched for Active Employment > Transfer. */
  transfers?: TransferEntry[];
  /** Real training rows — only fetched for Active Employment > Training. */
  trainings?: TrainingEntry[];
  /** Real nda/non_compete table data — only fetched for HR Info > NDA/NC. */
  ndaInfo?: NdaInfo | null;
  nonCompeteInfo?: NonCompeteInfo | null;
  /** Real disciplinary sub-table rows — only fetched for their own Disciplinary sub-tabs. */
  domesticInquiries?: DomesticInquiryEntry[];
  suspensionLetters?: SuspensionLetterEntry[];
  showcauseWarningLetters?: ShowcauseWarningLetterEntry[];
  pips?: PipEntry[];
  /** Real guardian_info rows — only fetched for Personal Info > Guardian Info. */
  guardianInfo?: GuardianInfoEntry[];
  /** Real payment_info data — only fetched for Personal Info > Payment. */
  paymentInfo?: PaymentInfoData | null;
  /** Real performance_review data — only fetched for Active Employment > Performance Review. */
  performanceReview?: PerformanceReviewEntry[];
  /** Real payslip data — only fetched for Finance > Payroll/Payslip. */
  payslip?: PayslipInfo | null;
  /** Combined Branch/Department option lists for Transfer's From/To dropdowns. */
  branches?: BranchOpt[];
  departments?: DepartmentOpt[];
  /** Real Task Manager data (separate database) — only fetched for the Task category. */
  tasks?: EmployeeTasksSummary;
}

export default function EmployeeRecordView({
  employeeId,
  employeeName,
  category,
  sectionKey,
  position,
  branchName,
  departmentName,
  stage,
  employeeCode,
  employeeDetail,
  leaveHistory,
  resumeInfo,
  referenceCheck,
  medicalCheck,
  documentsInfo,
  payrollInfo,
  achievements,
  salaryRevisions,
  promotions,
  transfers,
  trainings,
  ndaInfo,
  nonCompeteInfo,
  domesticInquiries,
  suspensionLetters,
  showcauseWarningLetters,
  pips,
  guardianInfo,
  paymentInfo,
  performanceReview,
  payslip,
  branches,
  departments,
  tasks,
}: Props) {
  const currentSection = category.sections.find((s) => s.key === sectionKey) ?? category.sections[0];

  return (
    <div className="min-h-full bg-slate-50">
      {/* No longer needs a --rail-width custom property: the vertical rail
          is either hidden outright (touch devices, replaced by the mobile
          sub-tab row) or rendered at its one fixed w-[210px] (mouse/
          trackpad-driven browsers) — neither consumer needs a shared fluid
          value anymore. */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-10">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/employee-folder" className="hover:text-slate-900 transition-colors">
            Employee Overview
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Employee Record</span>
        </nav>

        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-lg flex items-center justify-center shrink-0">
            {initialsFromName(employeeName)}
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-slate-900">{employeeName}</h1>
            {stage && stage !== "pre" && employeeCode && (
              <span className="block text-xs text-slate-500">ID: {employeeCode}</span>
            )}
            <span className="block text-xs text-slate-500">
              {departmentName ?? branchName ?? "--"} · {position || "--"}
            </span>
            <span className="block text-xs text-slate-500">{stage ? STAGE_LABELS[stage] : "--"}</span>
          </div>
        </div>

        {/* cat-tabs — horizontal, one entry per record category, independent
            of any stage. Switched from a width breakpoint (lg:) to the
            [@media(hover:none)] arbitrary variant — same technique already
            used in src/task-manager/ui/bits.tsx for the identical "real
            touch device, not just a narrow window" distinction. A width
            breakpoint can't tell an iPad Pro in landscape (1366px CSS width,
            wider than a resized desktop browser would ever need to trigger
            "mobile" at) from an actual small desktop window — hover:none
            only matches when the PRIMARY input has no hover capability
            (touch), true for phones/tablets of any size/orientation and
            false for anything mouse/trackpad-driven, which is the actual
            "not a desktop browser" distinction requested. (Caveat: iPadOS
            reports hover:hover if an external trackpad/mouse is actively
            paired — an intentional platform behavior, not a bug in this
            query — so that specific combination would still get the
            desktop layout below.) Base classes are now the desktop
            (folder-tab) look; [@media(hover:none)]: overrides restore the
            pill-capsule look for touch devices — same bg-[#eef3fb] rounded
            capsule + bg-[#a9d3f7bd] text-[#004386c9] active state as
            EmployeeNamelistView's List/Grid toggle and the Task panel's
            Source filter pills, for visual consistency across the module.
            w-full on touch (not the old calc(100% - rail width) cap, which
            was truncating labels like "Finance" by reserving space for a
            sidebar that's hidden on touch anyway). Tabs that still don't
            fit are simply not visible until scrolled to (nowrap +
            overflow-x-auto), never wrapped to a second row, either way. */}
        <nav
          aria-label="Employee record categories"
          className="flex flex-nowrap items-center gap-1 mb-0 overflow-x-auto w-auto [@media(hover:none)]:w-full bg-transparent rounded-none p-0 [@media(hover:none)]:bg-[#eef3fb] [@media(hover:none)]:rounded-full [@media(hover:none)]:p-1"
        >
          {EMPLOYEE_RECORD_CATEGORIES.map((cat) => {
            const isActive = cat.key === category.key;
            return (
              <Link
                key={cat.key}
                href={`/employee-record/${employeeId}/${cat.key}`}
                className={`shrink-0 flex items-center px-4 py-2 text-sm font-medium transition-colors rounded-t-[10px] border-2 border-b-0 [@media(hover:none)]:rounded-full [@media(hover:none)]:border-0 ${
                  isActive
                    ? "bg-[#22b8d1] border-[#0e6577] text-white [@media(hover:none)]:bg-[#a9d3f7bd] [@media(hover:none)]:text-[#004386c9]"
                    : "bg-[#68d4ffa8] border-[#49a2c6] text-black hover:bg-[#68d4ff] [@media(hover:none)]:bg-transparent [@media(hover:none)]:text-black/65 [@media(hover:none)]:hover:bg-[#dde8f7]"
                }`}
              >
                {cat.label}
              </Link>
            );
          })}
        </nav>

        {/* Touch-only sub-tab row ([@media(hover:none)] — see the cat-tabs
            bar's own comment above for why hover:none rather than a lg:
            width breakpoint; desktop, and any mouse/trackpad-driven browser
            regardless of window width, keeps the vertical rail below
            instead, unchanged). hidden by default (desktop doesn't need
            this row at all — display:none, so every other class here is
            inert until the media query matches); [@media(hover:none)]:flex
            shows it on touch. Same pill vocabulary as the cat-tabs bar
            above; scrolls horizontally rather than wrapping when a category
            has more sections than fit (HR Info's 7, in particular). Own
            mt-2/mb-3 for spacing rather than touching the cat-tabs bar's own
            margin, so desktop's mb-0 (folder tabs flush against the card)
            stays untouched. Guarded on sections.length > 1 per spec ("shown
            only when the selected main tab has sub-sections") — always true
            today (every category has 2+), kept as a real check rather than
            assumed. */}
        {category.sections.length > 1 && (
          <nav
            aria-label={`${category.label} sections`}
            className="hidden [@media(hover:none)]:flex flex-nowrap items-center gap-1 mt-2 mb-3 overflow-x-auto bg-[#eef3fb] rounded-full p-1"
          >
            {category.sections.map((section) => {
              const isActive = section.key === currentSection.key;
              return (
                <Link
                  key={section.key}
                  href={`/employee-record/${employeeId}/${category.key}/${section.key}`}
                  className={`shrink-0 flex items-center rounded-full px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                    isActive ? "bg-[#a9d3f7bd] text-[#004386c9]" : "text-black/65 hover:bg-[#dde8f7]"
                  }`}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Card + vertical sub-nav rail as flex siblings, docked under the
            cat-tabs bar — same side-by-side structure as desktop at every
            breakpoint (never stacks). The rail's own width fluidly shrinks
            on narrow viewports (see its own style below) so both columns
            keep fitting side by side instead of the rail getting pushed
            below the content. */}
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 bg-white rounded-b-[27px] rounded-tr-[27px] p-4 sm:p-6">
            {(() => {
              const lookupKey = `${category.key}/${sectionKey}`;
              const StaticPanel = EMPLOYEE_RECORD_STATIC_PANELS[lookupKey];
              if (sectionKey === "personal-info" && employeeDetail)
                return <PersonalInfoPanel employee={employeeDetail} employeeId={employeeId} />;
              if (sectionKey === "guardian-info" && guardianInfo !== undefined)
                return <GuardianInfoPanel userId={employeeId} data={guardianInfo} />;
              if (sectionKey === "payment" && employeeDetail && paymentInfo !== undefined)
                return <PaymentInfoPanel employee={employeeDetail} employeeId={employeeId} data={paymentInfo} />;
              if (sectionKey === "emergency-contact" && employeeDetail)
                return (
                  <EmergencyContactPanel employee={employeeDetail} onSave={(data) => updateEmergencyContact(employeeId, data)} />
                );
              if (sectionKey === "leave" && leaveHistory) return <LeavePanel rows={leaveHistory} />;
              if (category.key === "hr-info" && sectionKey === "resume" && resumeInfo)
                return <ResumePanel userId={employeeId} resumeFileId={resumeInfo.resumeFileId} cvFileId={resumeInfo.cvFileId} />;
              if (category.key === "hr-info" && sectionKey === "reference" && referenceCheck !== undefined)
                return <ReferenceCheckPanel userId={employeeId} data={referenceCheck} />;
              if (category.key === "hr-info" && sectionKey === "medical-check" && medicalCheck !== undefined)
                return <MedicalCheckPanel userId={employeeId} data={medicalCheck} />;
              if (category.key === "hr-info" && sectionKey === "handbook" && documentsInfo !== undefined)
                return <DocumentsPanel userId={employeeId} data={documentsInfo} showEmploymentContract={false} />;
              if (category.key === "finance" && sectionKey === "tax-info" && payrollInfo !== undefined && employeeDetail)
                return <OnboardingPayrollPanel userId={employeeId} data={payrollInfo} employeeDetail={employeeDetail} />;
              if (category.key === "finance" && sectionKey === "payroll" && salaryRevisions !== undefined && payslip !== undefined)
                return <PayrollPanel employeeId={employeeId} salaryRevisions={salaryRevisions} payslip={payslip} />;
              if (category.key === "hr-info" && sectionKey === "nda-nc" && ndaInfo !== undefined && nonCompeteInfo !== undefined)
                return <NdaNcPanel userId={employeeId} ndaData={ndaInfo} nonCompeteData={nonCompeteInfo} />;
              if (category.key === "active-employment" && sectionKey === "cert" && achievements !== undefined)
                return <AchievementPanel userId={employeeId} data={achievements} />;
              if (category.key === "active-employment" && sectionKey === "performance-review" && performanceReview !== undefined)
                return <PerformanceReviewPanel userId={employeeId} data={performanceReview} />;
              if (category.key === "active-employment" && sectionKey === "promotion" && promotions !== undefined)
                return <PromotionPanel userId={employeeId} data={promotions} currentPosition={position} />;
              if (category.key === "active-employment" && sectionKey === "transfer" && transfers !== undefined)
                return (
                  <TransferPanel
                    userId={employeeId}
                    data={transfers}
                    branches={branches ?? []}
                    departments={departments ?? []}
                    currentLocation={departmentName ?? branchName}
                  />
                );
              if (category.key === "active-employment" && sectionKey === "training" && trainings !== undefined)
                return <TrainingPanel userId={employeeId} data={trainings} />;
              if (category.key === "disciplinary" && sectionKey === "domestic-inquiry" && domesticInquiries !== undefined)
                return <DomesticInquiryPanel userId={employeeId} data={domesticInquiries} />;
              if (category.key === "disciplinary" && sectionKey === "suspension" && suspensionLetters !== undefined)
                return <SuspensionPanel userId={employeeId} data={suspensionLetters} />;
              if (category.key === "disciplinary" && sectionKey === "showcause" && showcauseWarningLetters !== undefined)
                return <ShowcausePanel userId={employeeId} data={showcauseWarningLetters} />;
              if (category.key === "disciplinary" && sectionKey === "pip" && pips !== undefined)
                return <PipPanel userId={employeeId} data={pips} />;
              if (category.key === "task" && sectionKey === "pending" && tasks !== undefined)
                return <TaskPendingPanel tasks={tasks.pending} />;
              if (category.key === "task" && sectionKey === "overdue" && tasks !== undefined)
                return <TaskOverduePanel tasks={tasks.overdue} />;
              if (StaticPanel) return <StaticPanel />;
              return (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <p className="text-base font-semibold text-slate-800">
                    {category.label} — {currentSection.label}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
                    This section&apos;s fields aren&apos;t wired up yet. Navigation and layout match the reference; the form content
                    is pending a scoping decision.
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Desktop/mouse-driven-browser-only — [@media(hover:none)]:hidden
              (see the cat-tabs bar's own comment for why hover:none rather
              than a lg: width breakpoint). On any real touch device
              (phone/tablet, any size/orientation, including iPad Pro
              landscape) the mobile sub-tab row above replaces this
              entirely, per explicit request — the vertical rail shouldn't
              exist in that position there at all, not just visually adapt.
              w-[210px] is unconditional now (was lg:w-[210px] against a
              fluid mobile width) since this element is either fully hidden
              or rendered at its one fixed desktop size, nothing in between. */}
          <nav
            aria-label={`${category.label} sections`}
            className="flex flex-none w-[210px] flex-col [@media(hover:none)]:hidden"
            style={{ gap: RAIL_GAP_PX }}
          >
            {category.sections.map((section) => {
              const isActive = section.key === currentSection.key;
              return (
                <Link
                  key={section.key}
                  href={`/employee-record/${employeeId}/${category.key}/${section.key}`}
                  className={`w-full min-h-11 flex items-center box-border rounded-r-[20px] border-2 py-[11px] px-2.5 sm:px-4 text-xs sm:text-sm font-semibold leading-tight transition-colors ${
                    isActive ? RAIL_CURRENT : `${RAIL_BASE} hover:brightness-95`
                  }`}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "Cash", label: "Cash" },
];
const PAYMENT_FREQUENCY_OPTIONS = [
  { value: "Monthly", label: "Monthly" },
  { value: "Bi-weekly", label: "Bi-weekly" },
  { value: "Weekly", label: "Weekly" },
];

// Matches pinfo_payment.html's exact layout: "Bank Details" subsection (Bank
// Name, Account Holder, Account Number — real bank_details columns) +
// "Payment" subsection (Payment Method, Payment Frequency, Pay Date,
// Remarks — real payment_info columns now, deliberately separate from
// bank_details). One Edit/Save button for the whole tab, same as
// PayrollPanel — both real tables saved together.
function PaymentInfoPanel({
  employee,
  employeeId,
  data,
}: {
  employee: EmployeeDetailFull;
  employeeId: number;
  data: PaymentInfoData | null;
}) {
  const [bankName, setBankName] = useState(employee.bankName ?? "");
  const [accountName, setAccountName] = useState(employee.accountName ?? "");
  const [bankAccount, setBankAccount] = useState(employee.bankAccount ?? "");
  const [paymentMethod, setPaymentMethod] = useState(data?.paymentMethod ?? "");
  const [paymentFrequency, setPaymentFrequency] = useState(data?.paymentFrequency ?? "");
  const [payDate, setPayDate] = useState(data?.payDate ?? "");
  const [remark, setRemark] = useState(data?.remark ?? "");

  async function handleSave() {
    const [bankResult, paymentResult] = await Promise.all([
      updateBankDetails(employeeId, { bankName, accountName, bankAccount }),
      updatePaymentInfo(employeeId, { paymentMethod, paymentFrequency, payDate, remark }),
    ]);
    if (bankResult && bankResult.ok === false) return bankResult;
    if (paymentResult && paymentResult.ok === false) return paymentResult;
    return { ok: true };
  }

  return (
    <EditableSection onSave={handleSave}>
      <PanelHeading>Payment &amp; Bank Info</PanelHeading>
      <Subsection heading="Bank Details">
        <EditableField label="Bank Name" value={bankName} onChange={setBankName} />
        <EditableField label="Account Holder" value={accountName} onChange={setAccountName} />
        <EditableField label="Account Number" value={bankAccount} onChange={setBankAccount} full />
      </Subsection>
      <Subsection heading="Payment">
        <EditableSelectField label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHOD_OPTIONS} />
        <EditableSelectField
          label="Payment Frequency"
          value={paymentFrequency}
          onChange={setPaymentFrequency}
          options={PAYMENT_FREQUENCY_OPTIONS}
        />
        <EditableField label="Pay Date" value={payDate} onChange={setPayDate} type="date" />
        <EditableField label="Remarks" value={remark} onChange={setRemark} full />
      </Subsection>
    </EditableSection>
  );
}

function LeavePanel({ rows }: { rows: LeaveHistoryRow[] }) {
  return (
    <div>
      <PanelHeading>Leave</PanelHeading>
      <RecordTable
        columns={[
          { key: "type", label: "Leave Type" },
          { key: "dates", label: "Date" },
          { key: "days", label: "Duration" },
          { key: "status", label: "Status" },
          { key: "attachment", label: "Attachment" },
        ]}
        rows={rows.map((r) => ({
          type: r.leaveTypeName,
          dates: r.startDate === r.endDate ? r.startDate : `${r.startDate} – ${r.endDate}`,
          days: `${r.totalDays} Day${r.totalDays === "1" ? "" : "s"}`,
          status: <span className="capitalize">{r.status}</span>,
          attachment: <RealAttachmentLink fileId={r.attachment} />,
        }))}
      />
    </div>
  );
}
