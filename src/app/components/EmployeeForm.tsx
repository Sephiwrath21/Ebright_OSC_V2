"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import { Home, ChevronRight, User, Briefcase, Landmark, HeartPulse, CircleAlert } from "lucide-react";
import type { CreateEmployeeResult } from "@/app/dashboard-employee-management/actions";
import type { EmployeeDetailFull } from "@/lib/employeeQueries";
import type { InductionEmployeeOption } from "@/app/induction/queries";
import { CredentialScreen } from "@/app/induction/components/CredentialScreen";

const WORKFLOW_TEMPLATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Standard", label: "Regular Intern · HQ" },
  { value: "ProtegeInternBranch", label: "Protege Intern · Branch" },
  { value: "CoachPartTimer", label: "Coach (Part-timer) · Branch + 3-week" },
  { value: "CoachFullTimer", label: "Coach (Full-timer) · Branch + 3-week" },
  { value: "FullTimer", label: "Full-timer · HQ or Branch" },
];

const ROLE_OPTIONS = ["FT CEO", "FT HOD", "FT EXEC", "BM", "FT COACH", "PT COACH", "PROTEGE INTERN", "HQ INTERN"];

// Employee ID structure: RR-DD-NNNN (8 digits total). The role select drives
// the first two digits; the department code drives the next two; the user keys
// in the trailing 4 digits manually.
const ROLE_CODES: Record<string, string> = {
  "FT CEO": "11",
  "FT HOD": "22",
  "FT EXEC": "33",
  "INTERN": "44",
  "BM": "55",
  "FT COACH": "66",
  "PT COACH": "77",
  // All intern types share the intern role code 44.
  "PROTEGE INTERN": "44",
  "HQ INTERN": "44",
};
const DEPT_CODES: Array<{ code: string; name: string }> = [
  { code: "01", name: "CEO" },
  { code: "02", name: "Operation" },
  { code: "03", name: "Academy" },
  { code: "04", name: "HR" },
  { code: "05", name: "Finance" },
  { code: "06", name: "IOP" },
  { code: "07", name: "Marketing" },
  { code: "08", name: "Optimisation" },
];

// Map a picked department's name to its 2-digit Employee-ID DD code, so the ID
// composer stays in sync with the Department dropdown. Alias a few name spellings.
const DEPT_NAME_ALIASES: Record<string, string> = {
  operations: "02",
  "human resource": "04",
  "human resources": "04",
  optimization: "08",
};
function ddCodeForDeptName(name: string | null | undefined): string {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return "";
  const direct = DEPT_CODES.find((d) => d.name.toLowerCase() === key);
  return direct ? direct.code : DEPT_NAME_ALIASES[key] ?? "";
}
// Roles where the department code is fixed and not user-selectable.
const FIXED_DEPT_BY_ROLE: Record<string, string> = {
  "FT CEO": "01",
  "BM": "02",
  "FT COACH": "02",
  "PT COACH": "02",
  // Protégé interns are branch-based like coaches (Operation); HQ interns sit
  // in an HQ department, so their department stays user-selectable.
  "PROTEGE INTERN": "02",
};
// Which org field a role gets: HQ/department-based roles pick a DEPARTMENT;
// everyone else picks a BRANCH; FT CEO is org-less (neither dropdown).
const DEPT_ROLES = new Set(["FT HOD", "FT EXEC", "HQ INTERN"]);
const NO_ORG_ROLES = new Set(["FT CEO"]);
const GENDER_OPTIONS = ["Male", "Female", "Other"];
const EMPLOYMENT_TYPE_OPTIONS = [
  "Full time - Permanent",
  "Part time - 9 months",
  "Part time - 12 months",
  "Part time - 15 months",
  "Part time - 18 months",
  "Intern - 4 months",
  "Intern - 5 months",
  "Intern - 6 months",
];

// Months derived from each fixed-term contract type. Used to auto-fill End Date
// from Start Date — user can still override (e.g. uni-set intern dates).
const CONTRACT_MONTHS: Record<string, number> = {
  "Part time - 9 months": 9,
  "Part time - 12 months": 12,
  "Part time - 15 months": 15,
  "Part time - 18 months": 18,
  "Intern - 4 months": 4,
  "Intern - 5 months": 5,
  "Intern - 6 months": 6,
};

function addMonthsIso(startIso: string, months: number): string {
  const [y, m, d] = startIso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Onboarding" },
  { value: "inactive", label: "Inactive" },
  { value: "archive", label: "Archive" },
];
const BANK_OPTIONS = ["Maybank", "CIMB", "Public Bank", "RHB", "HSBC", "Bank Islam", "AmBank", "Hong Leong Bank"];
const RELATION_OPTIONS = ["Father", "Mother", "Spouse", "Sibling", "Child", "Relative", "Friend", "Other"];

interface BranchOpt { id: number; code: string; name: string }
interface DepartmentOpt { id: number; code: string; name: string }

type TabKey = "profile" | "employment" | "bank" | "emergency";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "profile", label: "User Profile" },
  { key: "employment", label: "Employment" },
  { key: "bank", label: "Bank Details" },
  { key: "emergency", label: "Emergency Contact" },
];

type FormAction = (state: CreateEmployeeResult | null, formData: FormData) => Promise<CreateEmployeeResult>;

export default function EmployeeForm({
  branches,
  departments,
  mode,
  employee,
  action,
  isSelfEdit = false,
  buddyOptions = [],
}: {
  branches: BranchOpt[];
  departments: DepartmentOpt[];
  mode: "create" | "edit";
  employee?: EmployeeDetailFull;
  action: FormAction;
  isSelfEdit?: boolean;
  /** Active-user list for the Induction Buddy dropdown. Only used when
   *  the "Assign to onboarding" toggle is on. Empty on edit pages. */
  buddyOptions?: InductionEmployeeOption[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CreateEmployeeResult | null, FormData>(action, null);
  const [currentRole, setCurrentRole] = useState<string>(employee?.role ?? "");
  const [employmentType, setEmploymentType] = useState<string>(employee?.employmentType ?? "");
  const [startDate, setStartDate] = useState<string>(employee?.startDate ?? "");
  const [endDate, setEndDate] = useState<string>(employee?.endDate ?? "");
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  // Onboarding toggle — only relevant on the Add Employee (create) flow.
  // When on, the form posts workflow_template / onboarding_start_date /
  // buddy_user_id and the server creates an induction_profile + steps in
  // the same transaction, then returns credentials for the overlay.
  const [assignOnboarding, setAssignOnboarding] = useState(false);
  const [onbWorkflowTemplate, setOnbWorkflowTemplate] = useState("Standard");
  const [onbStartDate, setOnbStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  // When HR changes the start date, the email-send date follows along
  // unless they've manually changed it (tracked by sendEmailDirty).
  const [onbSendEmailOn, setOnbSendEmailOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [sendEmailDirty, setSendEmailDirty] = useState(false);
  const [onbBuddyId, setOnbBuddyId] = useState("");
  const [branchId, setBranchId] = useState<string>(
    employee?.branchId ? String(employee.branchId) : "",
  );
  const [departmentId, setDepartmentId] = useState<string>(
    employee?.departmentId ? String(employee.departmentId) : "",
  );
  // The org field follows the selected role: department for HQ/dept roles,
  // branch for everyone else. FT CEO is auto-assigned to the CEO department.
  const showDept = DEPT_ROLES.has(currentRole);
  const isNoOrgRole = NO_ORG_ROLES.has(currentRole);
  const showBranch = !showDept && !isNoOrgRole;
  const ceoDept = departments.find((d) => d.code === "01");

  // Employee ID parts. Existing rows that already follow the RR-DD-NNNNNN
  // convention pre-fill cleanly; legacy values stay in the serial slot.
  const existingId = employee?.employeeId ?? "";
  const idIsCanonical = /^\d{8}$/.test(existingId);
  const [empDeptCode, setEmpDeptCode] = useState<string>(
    idIsCanonical ? existingId.slice(2, 4) : "",
  );
  const [empSerial, setEmpSerial] = useState<string>(
    idIsCanonical ? existingId.slice(4) : existingId.replace(/\D/g, "").slice(0, 4),
  );

  const empRoleCode = ROLE_CODES[currentRole] ?? "";
  const fixedDeptForRole = FIXED_DEPT_BY_ROLE[currentRole] ?? null;
  const effectiveDeptCode = fixedDeptForRole ?? empDeptCode;
  // For dept-driven roles the DD is auto-set from the Department dropdown, so
  // lock it (and the role-fixed case) rather than let it drift out of sync.
  const ddLocked = fixedDeptForRole !== null || (showDept && effectiveDeptCode !== "");
  // Final value submitted as `employeeId` — only complete when all three parts are filled.
  const composedEmployeeId =
    empRoleCode && effectiveDeptCode && empSerial.length === 4
      ? `${empRoleCode}${effectiveDeptCode}${empSerial}`
      : "";

  // When the user changes Employment Type or Start Date, auto-fill End Date for
  // fixed-term contracts. Skip if Start Date is empty or contract is permanent.
  function recalcEndDate(nextType: string, nextStart: string) {
    const months = CONTRACT_MONTHS[nextType];
    if (!months || !nextStart) return;
    setEndDate(addMonthsIso(nextStart, months));
  }

  const isEdit = mode === "edit";

  const headingText = isSelfEdit ? "Edit My Profile" : isEdit ? "Edit Employee" : "Add Employee";
  const headingDesc = isSelfEdit
    ? "Update your personal, employment, bank, and emergency contact details."
    : isEdit
      ? `Update ${employee?.fullName ?? "this employee"}'s details across the four sections below.`
      : "Enter the new employee's details across the four sections below.";
  const saveButtonText = isSelfEdit
    ? "Save Profile"
    : isEdit
      ? "Save Changes"
      : assignOnboarding
        ? "Save & Generate Link"
        : "Save Employee";
  const savingText = "Saving...";

  // Credential overlay: shown after Save & Generate Link succeeds. Done
  // navigates back to the employee list and refreshes so the new row
  // appears in the onboarding panel without a manual refresh.
  if (state?.credentials) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credential-overlay-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0, 0, 0, 0.45)" }}
      >
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <CredentialScreen
            data={{
              ...state.credentials,
              // The candidate logs in via the standard /login page (not
              // the token URL). Rebuild from the actual browser origin
              // so HR sees a link they can confirm works from their
              // session, regardless of NEXTAUTH_URL on the server.
              loginLink:
                typeof window !== "undefined"
                  ? `${window.location.origin}/login`
                  : state.credentials.loginLink,
            }}
            onDone={() => {
              router.push("/dashboard-employee-management");
              router.refresh();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 pt-4 pb-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          {isSelfEdit ? (
            <>
              <Link href="/profile" className="hover:text-slate-900 transition-colors">My Profile</Link>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <span className="text-slate-900 font-medium">Edit</span>
            </>
          ) : (
            <>
              <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <Link href="/dashboard-employee-management" className="hover:text-slate-900 transition-colors">Employees</Link>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
              {isEdit && employee ? (
                <>
                  <Link href={`/dashboard-employee-management/${employee.id}`} className="hover:text-slate-900 transition-colors truncate max-w-[180px]">
                    {employee.fullName}
                  </Link>
                  <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  <span className="text-slate-900 font-medium">Edit</span>
                </>
              ) : (
                <span className="text-slate-900 font-medium">New</span>
              )}
            </>
          )}
        </nav>

        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">{headingText}</h1>
          <p className="mt-1 text-sm text-slate-500">{headingDesc}</p>
        </header>

        {state?.error && (
          <div role="alert" className="mb-5 flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
            <CircleAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-6">
          {isEdit && employee && <input type="hidden" name="userId" value={employee.id} />}

          <div className={activeTab === "profile" ? "" : "hidden"}>
          <Section
            Icon={User}
            title="User Profile"
            description="Personal identity and contact details."
            actions={<TabNav active={activeTab} onChange={setActiveTab} />}
          >
            <Field label="Full Name" required>
              <input name="fullName" type="text" placeholder="e.g. ERNIE SUHAILA BINTI RAMLAN" className={inputCls} defaultValue={employee?.fullName ?? ""} required />
            </Field>
            <Field label="Nick Name">
              <input name="nickName" type="text" placeholder="e.g. ERNIE" className={inputCls} defaultValue={employee?.nickName ?? ""} />
            </Field>
            <Field label="Email" required hint={isSelfEdit ? "Change your email via Profile → Edit." : undefined}>
              <input
                name="email"
                type="email"
                placeholder="name@ebright.my"
                className={`${inputCls}${isSelfEdit ? " bg-slate-50 text-slate-600" : ""}`}
                defaultValue={employee?.email ?? ""}
                required
                readOnly={isSelfEdit}
              />
            </Field>
            <Field label="Phone">
              <PhoneInput name="phone" defaultValue={employee?.phone ?? ""} />
            </Field>
            <Field label="Gender">
              <Select name="gender" placeholder="Select gender" options={GENDER_OPTIONS} defaultValue={employee?.gender ?? ""} />
            </Field>
            <Field label="Date of Birth">
              <DobPicker defaultDob={employee?.dob ?? null} />
            </Field>
            <Field label="NRIC">
              <NricInput name="nric" defaultValue={employee?.nric ?? ""} />
            </Field>
            <Field label="Nationality">
              <input name="nationality" type="text" className={inputCls} defaultValue={employee?.nationality ?? "Malaysian"} />
            </Field>
            <Field label="Home Address" span={2}>
              <textarea
                name="homeAddress"
                rows={2}
                placeholder="Full home address"
                className={`${inputCls} h-auto py-2.5 resize-y min-h-[72px]`}
                defaultValue={employee?.homeAddress ?? ""}
              />
            </Field>
          </Section>
          </div>

          <div className={activeTab === "employment" ? "" : "hidden"}>
          <Section
            Icon={Briefcase}
            title="Employment"
            description="Role, branch, and contract terms."
            actions={<TabNav active={activeTab} onChange={setActiveTab} />}
          >
            <Field
              label="Employee ID"
              hint={
                isSelfEdit
                  ? "Assigned by HR — read-only."
                  : "Format: RR (role) + DD (department) + 4-digit serial. Role auto-filled; last 4 entered manually."
              }
              span={2}
            >
              {isSelfEdit ? (
                <input
                  type="text"
                  value={existingId}
                  readOnly
                  className={`${inputCls} bg-slate-50 text-slate-600`}
                />
              ) : (
                <div className="flex items-stretch gap-2">
                  <div
                    className="inline-flex items-center justify-center h-10 w-16 rounded-lg border border-slate-200 bg-slate-50 font-mono text-sm font-semibold text-slate-700 select-none"
                    title="Role code (auto from selected role)"
                    aria-label="Role code"
                  >
                    {empRoleCode || "—"}
                  </div>
                  <div className="relative w-32">
                    <select
                      value={effectiveDeptCode}
                      onChange={(e) => setEmpDeptCode(e.target.value)}
                      disabled={ddLocked}
                      title={
                        fixedDeptForRole
                          ? `Locked to ${fixedDeptForRole} for this role`
                          : showDept
                            ? "Auto-set from the selected department"
                            : "Department code"
                      }
                      className={`${inputCls} pr-8 appearance-none cursor-pointer font-mono ${
                        ddLocked ? "bg-slate-50 text-slate-600 cursor-not-allowed" : ""
                      }`}
                    >
                      <option value="" disabled>
                        DD
                      </option>
                      {DEPT_CODES.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={empSerial}
                    onChange={(e) => setEmpSerial(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="4 digits"
                    maxLength={4}
                    className={`${inputCls} flex-1 font-mono`}
                  />
                  <input type="hidden" name="employeeId" value={composedEmployeeId} />
                </div>
              )}
            </Field>
            <Field label="Role" required>
              <div className="relative">
                <select
                  name="role"
                  defaultValue={employee?.role ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCurrentRole(v);
                    // Keep only the org value that matches the new role.
                    if (DEPT_ROLES.has(v)) setBranchId("");
                    else if (NO_ORG_ROLES.has(v)) { setBranchId(""); setDepartmentId(""); }
                    else setDepartmentId("");
                  }}
                  required
                  className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                >
                  <option value="" disabled>Select role</option>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
              </div>
            </Field>
            {showBranch && (
              <Field label="Branch" required>
                <div className="relative">
                  <select
                    name="branchId"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    required
                    className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                  >
                    <option value="" disabled>Select branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
                </div>
              </Field>
            )}
            {showDept && (
              <Field label="Department" required>
                <div className="relative">
                  <select
                    name="departmentId"
                    value={departmentId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setDepartmentId(id);
                      // Sync the Employee-ID DD code to the chosen department.
                      const dd = ddCodeForDeptName(
                        departments.find((d) => String(d.id) === id)?.name,
                      );
                      if (dd) setEmpDeptCode(dd);
                    }}
                    required
                    className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                  >
                    <option value="" disabled>Select department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
                </div>
              </Field>
            )}
            {isNoOrgRole && (
              <Field label="Department">
                <div className={`${inputCls} flex items-center bg-slate-50 text-slate-500`}>
                  {ceoDept ? `${ceoDept.code} — ${ceoDept.name} · auto-assigned` : "CEO department not found"}
                </div>
                <input type="hidden" name="departmentId" value={ceoDept ? String(ceoDept.id) : ""} />
              </Field>
            )}
            <Field label="Employment Type">
              <div className="relative">
                <select
                  name="employmentType"
                  value={employmentType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmploymentType(v);
                    recalcEndDate(v, startDate);
                  }}
                  className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                >
                  <option value="" disabled>Select type</option>
                  {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
              </div>
            </Field>
            {currentRole === "PT COACH" && (
              <Field label="Rate" hint="e.g. RM 50/hour — shown only for PT COACH">
                <input
                  name="rate"
                  type="text"
                  placeholder="e.g. RM 50/hour"
                  className={inputCls}
                  defaultValue={employee?.rate ?? ""}
                />
              </Field>
            )}
            <Field label="Start Date">
              <input
                name="startDate"
                type="date"
                className={inputCls}
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  recalcEndDate(employmentType, v);
                }}
              />
            </Field>
            <Field label="End Date" hint="Auto-filled for fixed-term contracts — editable to match uni-set dates.">
              <input
                name="endDate"
                type="date"
                className={inputCls}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <Field label="Status">
              <div className="relative">
                <select
                  name="status"
                  defaultValue={employee?.status ?? "active"}
                  className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
              </div>
            </Field>
            <Field label="Probation">
              <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm cursor-pointer hover:bg-slate-50">
                <input name="probation" type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" defaultChecked={employee?.probation ?? false} />
                <span className="text-slate-700">Currently on probation</span>
              </label>
            </Field>

            {!isEdit && !isSelfEdit && (
              <div className="col-span-2 space-y-4">
                <hr className="border-slate-200" />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Assign to onboarding</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Generate login credentials and assign an induction workflow.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      name="assign_to_onboarding"
                      checked={assignOnboarding}
                      onChange={(e) => setAssignOnboarding(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                </div>

                {assignOnboarding && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Workflow Template" required>
                      <div className="relative">
                        <select
                          name="workflow_template"
                          value={onbWorkflowTemplate}
                          onChange={(e) => setOnbWorkflowTemplate(e.target.value)}
                          required
                          className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                        >
                          {WORKFLOW_TEMPLATE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
                      </div>
                    </Field>
                    <Field label="Onboarding Start Date" required>
                      <input
                        name="onboarding_start_date"
                        type="date"
                        value={onbStartDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOnbStartDate(v);
                          // Auto-sync the send date if HR hasn't manually
                          // tweaked it — matches the spec default of
                          // "same as the onboarding start date".
                          if (!sendEmailDirty) setOnbSendEmailOn(v);
                        }}
                        required
                        className={inputCls}
                      />
                    </Field>
                    <Field
                      label="Send onboarding email on"
                      hint="Defaults to the onboarding start date. Pick an earlier or later date to schedule the welcome email."
                    >
                      <input
                        name="send_email_on"
                        type="date"
                        value={onbSendEmailOn}
                        onChange={(e) => {
                          setOnbSendEmailOn(e.target.value);
                          setSendEmailDirty(true);
                        }}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Induction Buddy" span={2}>
                      <div className="relative">
                        <select
                          name="buddy_user_id"
                          value={onbBuddyId}
                          onChange={(e) => setOnbBuddyId(e.target.value)}
                          className={`${inputCls} pr-8 appearance-none cursor-pointer`}
                        >
                          <option value="">No buddy assigned</option>
                          {buddyOptions.map((b) => (
                            <option key={b.userId} value={b.userId}>
                              {b.fullName} ({b.email})
                            </option>
                          ))}
                        </select>
                        <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
                      </div>
                    </Field>
                  </div>
                )}
              </div>
            )}
          </Section>
          </div>

          <div className={activeTab === "bank" ? "" : "hidden"}>
          <Section
            Icon={Landmark}
            title="Bank Details"
            description="Used for salary disbursement."
            actions={<TabNav active={activeTab} onChange={setActiveTab} />}
          >
            <Field label="Bank Name">
              <Select name="bankName" placeholder="Select bank" options={BANK_OPTIONS} defaultValue={employee?.bankName ?? ""} />
            </Field>
            <Field label="Account Holder Name" hint="Name as registered with the bank.">
              <input name="accountName" type="text" placeholder="e.g. ERNIE SUHAILA BINTI RAMLAN" className={inputCls} defaultValue={employee?.accountName ?? ""} />
            </Field>
            <Field label="Account Number" span={2}>
              <input name="bankAccount" type="text" inputMode="numeric" placeholder="e.g. 1642-3344-9902" className={inputCls} defaultValue={employee?.bankAccount ?? ""} />
            </Field>
          </Section>
          </div>

          <div className={activeTab === "emergency" ? "" : "hidden"}>
          <Section
            Icon={HeartPulse}
            title="Emergency Contact"
            description="Person to reach in case of emergency."
            actions={<TabNav active={activeTab} onChange={setActiveTab} />}
          >
            <Field label="Contact Name">
              <input name="emergencyName" type="text" placeholder="Full name" className={inputCls} defaultValue={employee?.emergencyName ?? ""} />
            </Field>
            <Field label="Contact Phone">
              <PhoneInput
                name="emergencyPhone"
                defaultValue={employee?.emergencyPhone ?? ""}
              />
            </Field>
            <Field label="Relation">
              <Select name="emergencyRelation" placeholder="Select relation" options={RELATION_OPTIONS} defaultValue={employee?.emergencyRelation ?? ""} />
            </Field>
          </Section>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push(isSelfEdit ? "/profile" : isEdit && employee ? `/dashboard-employee-management/${employee.id}` : "/dashboard-employee-management")}
              disabled={pending}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pending ? savingText : saveButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "block w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

// ──────────────────────────────────────────────────────────
// TabNav — pill-segmented control matching the AppShell tabs.
// ──────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: TabKey; onChange: (key: TabKey) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Employee form sections"
      className="inline-flex items-center gap-1 p-1 rounded-full bg-slate-100"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`h-9 px-5 rounded-full text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
              isActive
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// NricInput — auto-formatted Malaysian NRIC YYMMDD-PB-XXXX (12 digits, 6-2-4).
// ──────────────────────────────────────────────────────────

function formatNric(digits: string): string {
  const d = digits.slice(0, 12);
  if (d.length <= 6) return d;
  if (d.length <= 8) return `${d.slice(0, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

function NricInput({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const [digits, setDigits] = useState(() => defaultValue.replace(/\D/g, "").slice(0, 12));
  const formatted = formatNric(digits);
  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatted}
      onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 12))}
      placeholder="YYMMDD-PB-XXXX"
      className={inputCls}
      maxLength={14}
    />
  );
}

// ──────────────────────────────────────────────────────────
// PhoneInput — fixed +60 prefix + auto-formatted XX-NNNN MMMM
// ──────────────────────────────────────────────────────────

function extractLocalDigits(input: string): string {
  if (!input) return "";
  let d = input.replace(/\D/g, "");
  if (d.startsWith("60")) d = d.slice(2); // strip +60 / 60 country code
  if (d.startsWith("0")) d = d.slice(1); // strip leading 0 (e.g. 011-...)
  return d.slice(0, 10);
}

function formatLocalPhone(digits: string): string {
  const len = digits.length;
  if (len === 0) return "";
  if (len <= 2) return digits;
  if (len <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)} ${digits.slice(6)}`;
}

function PhoneInput({
  name,
  defaultValue = "",
}: {
  name: string;
  defaultValue?: string;
}) {
  const [digits, setDigits] = useState(() => extractLocalDigits(defaultValue));
  const formatted = formatLocalPhone(digits);
  const submitValue = digits ? `+60 ${formatted}` : "";

  return (
    <div className="flex items-stretch h-10 rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      <span
        aria-hidden="true"
        className="inline-flex items-center px-3 bg-slate-50 border-r border-slate-200 text-sm font-semibold text-slate-600 select-none"
      >
        +60
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={formatted}
        onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder="11-XXXX XXXX"
        className="flex-1 px-3 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
      <input type="hidden" name={name} value={submitValue} />
    </div>
  );
}

function Section({
  Icon,
  title,
  description,
  actions,
  children,
}: {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <header className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-600" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  required = false,
  hint,
  span = 1,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  span?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <label className={`block ${span === 2 ? "md:col-span-2" : ""}`}>
      <span className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && <span className="block mt-1 text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Select({
  name,
  placeholder,
  options,
  defaultValue = "",
  required,
}: {
  name: string;
  placeholder: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className={`${inputCls} pr-8 appearance-none cursor-pointer`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
    </div>
  );
}

function DobPicker({ defaultDob }: { defaultDob: string | null }) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 85; y--) years.push(y);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const days: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

  let defaultY = "";
  let defaultM = "";
  let defaultD = "";
  if (defaultDob) {
    const parts = defaultDob.split("-");
    if (parts.length === 3) {
      defaultY = parts[0];
      defaultM = String(parseInt(parts[1], 10));
      defaultD = String(parseInt(parts[2], 10));
    }
  }

  const selectCls = `${inputCls} pr-8 appearance-none cursor-pointer`;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="relative">
        <select name="dobDay" defaultValue={defaultD} className={selectCls} aria-label="Day">
          <option value="">Day</option>
          {days.map((d) => (<option key={d} value={d}>{d}</option>))}
        </select>
        <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
      </div>
      <div className="relative">
        <select name="dobMonth" defaultValue={defaultM} className={selectCls} aria-label="Month">
          <option value="">Month</option>
          {months.map((m, i) => (<option key={i + 1} value={i + 1}>{m}</option>))}
        </select>
        <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
      </div>
      <div className="relative">
        <select name="dobYear" defaultValue={defaultY} className={selectCls} aria-label="Year">
          <option value="">Year</option>
          {years.map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
        <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90" aria-hidden="true" />
      </div>
    </div>
  );
}

