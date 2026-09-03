export interface RecordSection {
  key: string;
  label: string;
  /** Nested sections (e.g. Offboarding's collapsible "Clearance" group,
   *  2026-08-27, see conversation) render under this group label instead of
   *  as a top-level sub-tab — same concept as stageProfileConfig.ts's own
   *  ProfileSection.group, ported here now that Exit reuses this real
   *  category/section structure directly instead of its own separate one.
   *  undefined (every other section today) means "top-level, ungrouped",
   *  unchanged from before this field existed. */
  group?: string;
}

export interface RecordCategory {
  key: string;
  label: string;
  sections: RecordSection[];
}

// Mirrors the Emp_Folder reference's cross-cutting "Employee Record" page
// family (pinfo_*/hr_*/finance_*/activeEmp_*/disciplinary_*/task_*) — reached
// from the Employee Records table, independent of the 5 stage flows.
export const EMPLOYEE_RECORD_CATEGORIES: RecordCategory[] = [
  {
    key: "personal-info",
    label: "Personal Info",
    sections: [
      { key: "personal-info", label: "Personal Info" },
      { key: "guardian-info", label: "Guardian Info" },
      { key: "payment", label: "Payment" },
      { key: "emergency-contact", label: "Emergency Contact" },
    ],
  },
  {
    key: "hr-info",
    label: "HR Info",
    sections: [
      { key: "resume", label: "Resume/CV" },
      { key: "offer-letter", label: "Offer Letter" },
      { key: "hiring-notes", label: "Hiring Notes" },
      { key: "reference", label: "Reference" },
      { key: "medical-check", label: "Medical Check" },
      // New (2026-08-26, see conversation) — same ProbationPanel/data as the
      // Probation stage-flow's own tab, now also reachable from Employee
      // Record's real HR Info structure.
      { key: "probation", label: "Probation" },
      { key: "nda-nc", label: "NDA / NC" },
      // "Doc" (2026-08-26, see conversation) — the tab's own content heading
      // is "Documents" (DocumentsPanel's own showEmploymentContract=true
      // heading, see EmployeeRecordView.tsx), this rail label is
      // deliberately shorter.
      { key: "handbook", label: "Doc" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    sections: [
      { key: "payroll", label: "Payroll/ Payslip" },
      { key: "tax-info", label: "Tax Info" },
    ],
  },
  {
    key: "active-employment",
    label: "Active Employment",
    sections: [
      { key: "leave", label: "Leave" },
      { key: "performance-review", label: "Performance Review" },
      { key: "training", label: "Training" },
      { key: "promotion", label: "Promotion" },
      { key: "transfer", label: "Transfer" },
      { key: "cert", label: "Cert./ Achievement" },
    ],
  },
  {
    key: "disciplinary",
    label: "Disciplinary",
    sections: [
      { key: "domestic-inquiry", label: "Domestic Inquiry" },
      { key: "suspension", label: "Suspension Letter" },
      { key: "showcause", label: "Showcause / Warning Letter" },
      { key: "pip", label: "Performance Improvement Plan" },
    ],
  },
  {
    key: "task",
    label: "Task",
    sections: [
      { key: "pending", label: "Pending" },
      { key: "overdue", label: "Overdue" },
    ],
  },
  // New (2026-08-27, see conversation) — Exit stage's own tabs, reusing
  // exactly the same 7 real section keys/panels StageProfileView.tsx's old
  // Exit-specific rendering already used (ResignationPanel/
  // ReferenceLetterPanel/ExitInterviewNotesPanel/the 3 Clearance checklist
  // panels/FinancialSettlementPanel, all in ActiveProfilePanels.tsx).
  // Knowledge Transfer/Asset Recovery/System Revocation stay grouped under
  // "Clearance" (a real expandable group, not flattened) — same group
  // mechanism stageProfileConfig.ts's own Exit config already used.
  {
    key: "offboarding",
    label: "Offboarding",
    sections: [
      { key: "resignation", label: "Resignation" },
      { key: "reference-letter", label: "Reference Letter" },
      { key: "exit-interview-notes", label: "Exit Interview Notes" },
      { key: "knowledge-transfer", label: "Knowledge Transfer", group: "Clearance" },
      { key: "asset-recovery", label: "Asset Recovery", group: "Clearance" },
      { key: "system-revocation", label: "System Revocation", group: "Clearance" },
      { key: "financial-settlement", label: "Financial Settlement" },
    ],
  },
];

export function findRecordCategory(key: string): RecordCategory | undefined {
  return EMPLOYEE_RECORD_CATEGORIES.find((c) => c.key === key);
}
