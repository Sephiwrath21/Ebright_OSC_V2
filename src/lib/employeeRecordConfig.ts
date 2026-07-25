export interface RecordSection {
  key: string;
  label: string;
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
      { key: "nda-nc", label: "NDA/ NC" },
      { key: "handbook", label: "Employee Handbook" },
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
      { key: "showcause", label: "Showcause/ Warning Letter" },
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
];

export function findRecordCategory(key: string): RecordCategory | undefined {
  return EMPLOYEE_RECORD_CATEGORIES.find((c) => c.key === key);
}
