"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  X,
  Shield,
  Mail,
  User,
  MapPin,
  KeyRound,
  Loader2,
  Check,
  AlertCircle,
  UserPlus,
  BadgeCheck,
} from "lucide-react";
import {
  lookupStaffEmail,
  activateStaffAccount,
  createManagedAccount,
} from "@/app/account-management/actions";
import type { AccountUser } from "@/app/components/AccountManagementView";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Role = { role_id: number; role_type: string };
type Branch = { branch_id: number; branch_name: string; region: string | null };
type Department = { department_id: number; department_name: string };

type Verified = {
  userId: number;
  name: string | null;
  branchName: string | null;
  departmentName: string | null;
  position: string | null;
};

function prettyRole(roleType: string): string {
  return roleType
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default function AddAccountModal({
  roles,
  branches,
  departments,
  onClose,
  onCreated,
}: {
  roles: Role[];
  branches: Branch[];
  departments: Department[];
  onClose: () => void;
  onCreated: (user: AccountUser) => void;
}) {
  const [roleId, setRoleId] = useState<number | "">("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [orgUnit, setOrgUnit] = useState(""); // "branch:<id>" | "dept:<id>" | ""
  const [region, setRegion] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [verified, setVerified] = useState<Verified | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, startVerify] = useTransition();

  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedRole = roles.find((r) => r.role_id === roleId);
  const roleType = (selectedRole?.role_type ?? "").toLowerCase();
  const isStaff = roleType === "staff";
  const isRm = roleType === "regional manager";
  // Department-scoped roles get a department dropdown; branch-scoped roles get a
  // branch dropdown (both required).
  const needsDept = roleType === "department" || roleType === "hod";
  const needsBranch = roleType === "branch" || roleType === "branch manager";

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const b of branches) {
      const r = b.region?.trim();
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [branches]);

  // Switching role wipes the downstream fields so each flow starts clean.
  const changeRole = (next: number | "") => {
    setRoleId(next);
    setEmail("");
    setName("");
    setOrgUnit("");
    setRegion("");
    setPassword("");
    setConfirm("");
    setVerified(null);
    setVerifyError(null);
    setError(null);
  };

  const emailValid = EMAIL_RE.test(email.trim());
  const pwValid = password.length >= 8;
  const pwMatch = confirm.length > 0 && confirm === password;

  const handleVerify = () => {
    setVerifyError(null);
    startVerify(async () => {
      const res = await lookupStaffEmail(email);
      if (res.ok) {
        setVerified({
          userId: res.userId!,
          name: res.name ?? null,
          branchName: res.branchName ?? null,
          departmentName: res.departmentName ?? null,
          position: res.position ?? null,
        });
      } else {
        setVerified(null);
        setVerifyError(res.error ?? "Could not verify this email.");
      }
    });
  };

  // Can the primary submit fire?
  const canSubmit = (() => {
    if (roleId === "") return false;
    if (!pwValid || !pwMatch) return false;
    if (isStaff) return verified !== null;
    if (!emailValid || !name.trim()) return false;
    if (needsDept) return orgUnit.startsWith("dept:");
    if (needsBranch) return orgUnit.startsWith("branch:");
    if (isRm) return region !== "";
    return true; // other roles — org unit optional
  })();

  const handleSubmit = () => {
    if (!canSubmit || roleId === "") return;
    setError(null);
    startSubmit(async () => {
      const res = isStaff
        ? await activateStaffAccount(verified!.userId, roleId, password)
        : await createManagedAccount({
            roleId,
            email,
            name,
            password,
            orgUnit: isRm ? "" : orgUnit,
            region: isRm ? region : "",
          });
      if (res.ok && res.user) {
        onCreated(res.user as AccountUser);
      } else {
        setError(res.error ?? "Could not create the account.");
      }
    });
  };

  const primaryLabel = isStaff ? "Activate account" : "Create account";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-account-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full w-11 h-11 bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3
                id="add-account-title"
                className="text-base font-semibold text-slate-900"
              >
                Add User
              </h3>
              <p className="text-[12px] text-slate-500">
                Pick a role first — the rest adapts to it.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Role — always first */}
          <Field icon={<Shield className="w-4 h-4" />} label="Role">
            <select
              value={roleId === "" ? "" : String(roleId)}
              onChange={(e) =>
                changeRole(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.role_id} value={r.role_id}>
                  {prettyRole(r.role_type)}
                </option>
              ))}
            </select>
          </Field>

          {roleId === "" ? (
            <p className="text-[13px] text-slate-400">
              Choose a role to continue.
            </p>
          ) : isStaff ? (
            /* ─── Staff: verify a pre-registered email, then set password ─── */
            <>
              <Field
                icon={<Mail className="w-4 h-4" />}
                label="Email"
                hint="Staff are pre-registered by HR — verify the email to load their record."
              >
                {verified ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="h-10 flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm text-slate-700"
                    />
                    <span className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      <BadgeCheck className="w-4 h-4" aria-hidden="true" />
                      Verified
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@ebright.my"
                      autoComplete="off"
                      className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={!emailValid || verifying}
                      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {verifying && (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      )}
                      Verify
                    </button>
                  </div>
                )}
                {verifyError && (
                  <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-rose-600">
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    {verifyError}
                  </p>
                )}
              </Field>

              {verified && (
                <>
                  {/* Auto-filled record — read-only */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500">
                      <BadgeCheck className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                      Staff record
                    </div>
                    <ReadRow label="Name" value={verified.name} />
                    <ReadRow
                      label="Branch / Department"
                      value={
                        verified.branchName ??
                        verified.departmentName ??
                        null
                      }
                    />
                    <ReadRow label="Position" value={verified.position} />
                  </div>

                  <PasswordFields
                    password={password}
                    confirm={confirm}
                    setPassword={setPassword}
                    setConfirm={setConfirm}
                    pwValid={pwValid}
                    pwMatch={pwMatch}
                  />
                </>
              )}
            </>
          ) : (
            /* ─── Everything else: create a new account ─── */
            <>
              <Field icon={<Mail className="w-4 h-4" />} label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@ebright.my"
                  autoComplete="off"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                />
              </Field>

              <Field icon={<User className="w-4 h-4" />} label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="off"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                />
              </Field>

              {needsDept ? (
                <Field icon={<MapPin className="w-4 h-4" />} label="Department">
                  <select
                    value={orgUnit}
                    onChange={(e) => setOrgUnit(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                  >
                    <option value="">Select a department…</option>
                    {departments.map((d) => (
                      <option key={d.department_id} value={`dept:${d.department_id}`}>
                        {d.department_name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : needsBranch ? (
                <Field icon={<MapPin className="w-4 h-4" />} label="Branch">
                  <select
                    value={orgUnit}
                    onChange={(e) => setOrgUnit(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                  >
                    <option value="">Select a branch…</option>
                    {branches.map((b) => (
                      <option key={b.branch_id} value={`branch:${b.branch_id}`}>
                        {b.branch_name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : isRm ? (
                <Field
                  icon={<MapPin className="w-4 h-4" />}
                  label="Region"
                  hint="Regional managers are scoped to one region."
                >
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                  >
                    <option value="">Select a region…</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        Region {r}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field
                  icon={<MapPin className="w-4 h-4" />}
                  label="Branch / Department"
                  hint="Optional — assign to one branch or one department."
                >
                  <select
                    value={orgUnit}
                    onChange={(e) => setOrgUnit(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                  >
                    <option value="">— None —</option>
                    <optgroup label="Branches">
                      {branches.map((b) => (
                        <option key={`b-${b.branch_id}`} value={`branch:${b.branch_id}`}>
                          {b.branch_name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Departments">
                      {departments.map((d) => (
                        <option key={`d-${d.department_id}`} value={`dept:${d.department_id}`}>
                          {d.department_name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
              )}

              <PasswordFields
                password={password}
                confirm={confirm}
                setPassword={setPassword}
                setConfirm={setConfirm}
                pwValid={pwValid}
                pwMatch={pwMatch}
              />
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-9 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
          >
            {submitting && (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            )}
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-500">{icon}</span>
        <h4 className="text-sm font-semibold text-slate-800">{label}</h4>
      </div>
      {hint && <p className="text-[12px] text-slate-500 mb-2.5">{hint}</p>}
      {children}
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 truncate">
        {value ?? "—"}
      </span>
    </div>
  );
}

function PasswordFields({
  password,
  confirm,
  setPassword,
  setConfirm,
  pwValid,
  pwMatch,
}: {
  password: string;
  confirm: string;
  setPassword: (v: string) => void;
  setConfirm: (v: string) => void;
  pwValid: boolean;
  pwMatch: boolean;
}) {
  return (
    <Field
      icon={<KeyRound className="w-4 h-4" />}
      label="Password"
      hint="Set the initial password — at least 8 characters."
    >
      <div className="space-y-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (min. 8 characters)"
          autoComplete="new-password"
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          autoComplete="new-password"
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
        />
      </div>
      {password.length > 0 && (
        <p
          className={`mt-2 inline-flex items-center gap-1 text-[12px] font-medium ${
            pwValid ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {pwValid ? (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {pwValid
            ? "Acceptable password"
            : "Password must be at least 8 characters"}
        </p>
      )}
      {confirm.length > 0 && (
        <p
          className={`mt-1 inline-flex items-center gap-1 text-[12px] font-medium ${
            pwMatch ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {pwMatch ? (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {pwMatch ? "Passwords match" : "Passwords do not match"}
        </p>
      )}
    </Field>
  );
}
