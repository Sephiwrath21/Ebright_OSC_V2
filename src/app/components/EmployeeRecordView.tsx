"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { initialsFromName } from "@/lib/text";
import { EMPLOYEE_RECORD_CATEGORIES, type RecordCategory } from "@/lib/employeeRecordConfig";
import {
  PanelHeading,
  Subsection,
  RecordTable,
  EditableField,
  PlaceholderField,
  PlaceholderSelectField,
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
import { EMPLOYEE_RECORD_STATIC_PANELS, PayrollPanel } from "@/app/components/EmployeeRecordPanels";
import { updateBankDetails, updateEmergencyContact } from "@/lib/employeeRecordActions";
import type {
  EmployeeDetailFull,
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
} from "@/lib/employeeQueries";

// Vertical sub-nav rail — green, from category_shared.css (shared by every
// Employee Record category, e.g. Personal Info / Guardian Info / Payment &
// Bank Info / Emergency Contact under "Personal Info").
const RAIL_WIDTH_PX = 210;
const RAIL_GAP_PX = 10;
const RAIL_BASE = "bg-[#b0ffbfa8] border-[#0a6e03] text-[#4b4949d6]";
const RAIL_CURRENT = "bg-[#0a6e03] border-[#063f02] text-white";

interface Props {
  employeeId: number;
  employeeName: string;
  category: RecordCategory;
  sectionKey: string;
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
}

export default function EmployeeRecordView({
  employeeId,
  employeeName,
  category,
  sectionKey,
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
}: Props) {
  const currentSection = category.sections.find((s) => s.key === sectionKey) ?? category.sections[0];

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-10">
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

        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-lg flex items-center justify-center shrink-0">
            {initialsFromName(employeeName)}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{employeeName}</h1>
            <p className="text-sm text-slate-500">Employee Record</p>
          </div>
        </div>

        {/* cat-tabs — horizontal, one entry per record category, independent of any stage */}
        <nav aria-label="Employee record categories" className="flex flex-wrap gap-1 mb-0">
          {EMPLOYEE_RECORD_CATEGORIES.map((cat) => {
            const isActive = cat.key === category.key;
            return (
              <Link
                key={cat.key}
                href={`/employee-record/${employeeId}/${cat.key}`}
                className={`px-4 py-2 rounded-t-[10px] border-2 border-b-0 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#22b8d1] border-[#0e6577] text-white"
                    : "bg-[#68d4ffa8] border-[#49a2c6] text-black hover:bg-[#68d4ff]"
                }`}
              >
                {cat.label}
              </Link>
            );
          })}
        </nav>

        {/* Card + vertical sub-nav rail as flex siblings, docked under the cat-tabs bar */}
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 bg-white rounded-b-[27px] rounded-tr-[27px] p-6">
            {(() => {
              const lookupKey = `${category.key}/${sectionKey}`;
              const StaticPanel = EMPLOYEE_RECORD_STATIC_PANELS[lookupKey];
              if (sectionKey === "personal-info" && employeeDetail)
                return <PersonalInfoPanel employee={employeeDetail} employeeId={employeeId} />;
              if (sectionKey === "payment" && employeeDetail)
                return <PaymentInfoPanel employee={employeeDetail} employeeId={employeeId} />;
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
              if (category.key === "finance" && sectionKey === "payroll" && salaryRevisions !== undefined)
                return <PayrollPanel employeeId={employeeId} salaryRevisions={salaryRevisions} />;
              if (category.key === "hr-info" && sectionKey === "nda-nc" && ndaInfo !== undefined && nonCompeteInfo !== undefined)
                return <NdaNcPanel userId={employeeId} ndaData={ndaInfo} nonCompeteData={nonCompeteInfo} />;
              if (category.key === "active-employment" && sectionKey === "cert" && achievements !== undefined)
                return <AchievementPanel userId={employeeId} data={achievements} />;
              if (category.key === "active-employment" && sectionKey === "promotion" && promotions !== undefined)
                return <PromotionPanel userId={employeeId} data={promotions} />;
              if (category.key === "active-employment" && sectionKey === "transfer" && transfers !== undefined)
                return <TransferPanel userId={employeeId} data={transfers} />;
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

          <nav
            aria-label={`${category.label} sections`}
            className="flex-none flex flex-col"
            style={{ width: RAIL_WIDTH_PX, gap: RAIL_GAP_PX }}
          >
            {category.sections.map((section) => {
              const isActive = section.key === currentSection.key;
              return (
                <Link
                  key={section.key}
                  href={`/employee-record/${employeeId}/${category.key}/${section.key}`}
                  className={`w-full box-border rounded-r-[20px] border-2 py-[11px] px-4 text-sm font-semibold leading-tight transition-colors ${
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

// Matches pinfo_payment.html's exact layout: "Bank Details" subsection (Bank
// Name, Account Holder, Account Number — real bank_details columns) +
// "Payment" subsection (Payment Method, Payment Frequency, Pay Date,
// Remarks — no matching column anywhere; would need 4 new columns, most
// likely on a payroll_settings-style table, to persist for real). Shown as
// PlaceholderFields so they read "Not provided" like everything else instead
// of a permanent on-screen caveat.
function PaymentInfoPanel({ employee, employeeId }: { employee: EmployeeDetailFull; employeeId: number }) {
  const [bankName, setBankName] = useState(employee.bankName ?? "");
  const [accountName, setAccountName] = useState(employee.accountName ?? "");
  const [bankAccount, setBankAccount] = useState(employee.bankAccount ?? "");

  return (
    <EditableSection onSave={() => updateBankDetails(employeeId, { bankName, accountName, bankAccount })}>
      <PanelHeading>Payment &amp; Bank Info</PanelHeading>
      <Subsection heading="Bank Details">
        <EditableField label="Bank Name" value={bankName} onChange={setBankName} />
        <EditableField label="Account Holder" value={accountName} onChange={setAccountName} />
        <EditableField label="Account Number" value={bankAccount} onChange={setBankAccount} full />
      </Subsection>
      <Subsection heading="Payment">
        <PlaceholderSelectField label="Payment Method" options={["Bank Transfer", "Cheque", "Cash"]} />
        <PlaceholderSelectField label="Payment Frequency" options={["Monthly", "Bi-weekly", "Weekly"]} />
        <PlaceholderField label="Pay Date" type="date" />
        <PlaceholderField label="Remarks" full />
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
