"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Home,
  ChevronRight,
  Search,
  KeyRound,
  Check,
  Building2,
  Layers,
  CircleUser,
  MapPin,
  X,
} from "lucide-react";

export type AccountUser = {
  user_id: number;
  email: string;
  full_name: string | null;
  role_id: number;
  role_type: string;
  status: string;
  last_login: string | null;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  department_id: number | null;
  department_name: string | null;
  position: string | null;
};

export type AccountData = {
  users: AccountUser[];
  branches: { branch_id: number; branch_name: string }[];
  departments: { department_id: number; department_name: string }[];
  roles: { role_id: number; role_type: string }[];
};

const RELATIVE_FMT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE_FMT.format(diffSec, "second");
  if (abs < 3600) return RELATIVE_FMT.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return RELATIVE_FMT.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return RELATIVE_FMT.format(Math.round(diffSec / 86400), "day");
  return DATE_FMT.format(new Date(iso));
}

function prettyRole(roleType: string): string {
  return roleType
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  return source
    .split(/[\s.]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AccountManagementView({ data }: { data: AccountData }) {
  const [roleId, setRoleId] = useState<number | "all">("all");
  const [locationType, setLocationType] = useState<"all" | "branch" | "department">(
    "all",
  );
  const [locationValueId, setLocationValueId] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [resetSent, setResetSent] = useState<Set<number>>(new Set());

  const selectedRole = data.roles.find((r) => r.role_id === roleId);
  const selectedRoleType = selectedRole?.role_type.toLowerCase() ?? null;
  const isAdminRoleSelected = selectedRoleType === "admin";
  const isStaffRoleSelected = selectedRoleType === "staff";

  // "HQ" branch — used for the staff inference rule
  const hqBranchId =
    data.branches.find((b) => {
      const n = b.branch_name.trim().toLowerCase();
      return n === "hq" || n === "headquarters";
    })?.branch_id ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.users.filter((u) => {
      if (roleId !== "all" && u.role_id !== roleId) return false;

      if (locationValueId !== "all") {
        if (locationType === "branch") {
          // Staff with department but no branch are inferred to belong to HQ
          const isHqInference =
            isStaffRoleSelected &&
            locationValueId === hqBranchId &&
            u.branch_id === null &&
            u.department_id !== null;
          if (u.branch_id !== locationValueId && !isHqInference) return false;
        } else if (locationType === "department") {
          if (u.department_id !== locationValueId) return false;
        }
      }

      if (q) {
        const hay = [
          u.full_name,
          u.email,
          u.branch_name,
          u.department_name,
          u.position,
          u.role_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    data.users,
    roleId,
    locationType,
    locationValueId,
    isStaffRoleSelected,
    hqBranchId,
    query,
  ]);

  const handleRoleChange = (next: number | "all") => {
    setRoleId(next);
    setLocationType("all");
    setLocationValueId("all");
  };

  const handleLocationTypeChange = (next: "all" | "branch" | "department") => {
    setLocationType(next);
    setLocationValueId("all");
  };

  // Role isn't counted — Clear is only meant for the contextual filters
  const hasActiveFilters =
    query.length > 0 ||
    locationType !== "all" ||
    locationValueId !== "all";

  // Clear keeps the role selection so users stay scoped to e.g. "All Admins"
  // after clearing branch/department filters.
  const clearFilters = () => {
    setQuery("");
    setLocationType("all");
    setLocationValueId("all");
  };

  const handleReset = (userId: number) => {
    setResetSent((s) => {
      const next = new Set(s);
      next.add(userId);
      return next;
    });
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16 space-y-6">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-all duration-200"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Account Management</span>
        </nav>

        {/* Header */}
        <header className="bg-gradient-to-b from-white to-slate-50 border border-slate-200 rounded-2xl shadow-sm p-6 md:p-8">
          <h1 className="text-2xl font-bold text-slate-800">Account Management</h1>
          <p className="mt-1.5 text-sm font-medium text-slate-500">
            View and manage all user accounts across branches and departments.
          </p>
        </header>

        {/* Filters — compact dropdown row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, branch…"
              className="h-10 w-full pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
            />
          </div>

          <DropdownFilter
            icon={<CircleUser className="w-4 h-4 text-slate-500" aria-hidden="true" />}
            value={roleId === "all" ? "all" : String(roleId)}
            onChange={(v) => handleRoleChange(v === "all" ? "all" : Number(v))}
            options={[
              { value: "all", label: "All Roles" },
              ...data.roles.map((r) => ({
                value: String(r.role_id),
                label: prettyRole(r.role_type),
              })),
            ]}
          />

          {/* Admin or Staff: hierarchical Location → Branch/Department picker */}
          {(isAdminRoleSelected || isStaffRoleSelected) && (
            <>
              <DropdownFilter
                icon={
                  <MapPin
                    className="w-4 h-4 text-indigo-500"
                    aria-hidden="true"
                  />
                }
                value={locationType}
                onChange={(v) =>
                  handleLocationTypeChange(v as "all" | "branch" | "department")
                }
                options={[
                  { value: "all", label: "Location: Any" },
                  { value: "branch", label: "Location: Branch" },
                  { value: "department", label: "Location: Department" },
                ]}
              />

              {locationType === "branch" && (
                <DropdownFilter
                  icon={
                    <Building2
                      className="w-4 h-4 text-slate-500"
                      aria-hidden="true"
                    />
                  }
                  value={locationValueId === "all" ? "all" : String(locationValueId)}
                  onChange={(v) =>
                    setLocationValueId(v === "all" ? "all" : Number(v))
                  }
                  options={[
                    { value: "all", label: "All Branches" },
                    ...data.branches.map((b) => ({
                      value: String(b.branch_id),
                      label: b.branch_name,
                    })),
                  ]}
                />
              )}

              {locationType === "department" && (
                <DropdownFilter
                  icon={
                    <Layers
                      className="w-4 h-4 text-slate-500"
                      aria-hidden="true"
                    />
                  }
                  value={locationValueId === "all" ? "all" : String(locationValueId)}
                  onChange={(v) =>
                    setLocationValueId(v === "all" ? "all" : Number(v))
                  }
                  options={[
                    { value: "all", label: "All Departments" },
                    ...data.departments.map((d) => ({
                      value: String(d.department_id),
                      label: d.department_name,
                    })),
                  ]}
                />
              )}
            </>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition-all duration-200"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-800">
              User Accounts
            </h2>
            <p className="text-xs font-medium text-slate-500">
              {filtered.length} of {data.users.length} accounts shown
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-sm font-semibold text-slate-700">
                  <th className="text-left px-6 py-3 font-semibold">Account</th>
                  <th className="text-center px-6 py-3 font-semibold">Role</th>
                  <th className="text-center px-6 py-3 font-semibold">
                    Branch / Department
                  </th>
                  <th className="text-center px-6 py-3 font-semibold">Status</th>
                  <th className="text-center px-6 py-3 font-semibold">
                    Last Logged In
                  </th>
                  <th className="text-right px-6 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-16 text-center text-sm font-medium text-slate-400"
                    >
                      No accounts match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((u, idx) => (
                    <UserRow
                      key={u.user_id}
                      user={u}
                      zebra={idx % 2 === 1}
                      resetSent={resetSent.has(u.user_id)}
                      onReset={() => handleReset(u.user_id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50/50">
            <KeyRound
              className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0"
              aria-hidden="true"
            />
            <span className="text-xs text-slate-600">
              Passwords are stored as bcrypt hashes and cannot be viewed. Use{" "}
              <span className="font-semibold text-slate-700">Send Reset Link</span>{" "}
              to let a user set a new one.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function DropdownFilter({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200">
      {icon}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none pr-1 max-w-[180px]"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserRow({
  user,
  zebra,
  resetSent,
  onReset,
}: {
  user: AccountUser;
  zebra: boolean;
  resetSent: boolean;
  onReset: () => void;
}) {
  const rowBg = zebra ? "bg-slate-50/50" : "bg-white";
  const isSuperadmin = user.role_type.toLowerCase() === "superadmin";
  return (
    <tr
      className={`${rowBg} hover:bg-slate-100 transition-colors duration-200 border-b border-slate-100 last:border-b-0`}
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full w-9 h-9 bg-indigo-100 text-indigo-700 font-semibold text-sm flex items-center justify-center shrink-0">
            {initials(user.full_name, user.email)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">
              {user.full_name ?? "—"}
            </div>
            <div className="text-[12px] text-slate-500 truncate">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <RolePill roleType={user.role_type} />
      </td>
      <td className="px-6 py-4 text-center">
        <BranchDeptCell
          isSuperadmin={isSuperadmin}
          isStaff={user.role_type.toLowerCase() === "staff"}
          branchName={user.branch_name}
          departmentName={user.department_name}
          position={user.position}
        />
      </td>
      <td className="px-6 py-4 text-center">
        <StatusPill status={user.status} />
      </td>
      <td className="px-6 py-4 text-center">
        <div className="text-sm">
          <div className="font-medium text-slate-700 tabular-nums">
            {relativeTime(user.last_login)}
          </div>
          {user.last_login && (
            <div className="text-[11px] text-slate-400 tabular-nums">
              {DATE_FMT.format(new Date(user.last_login))}
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-right">
        {resetSent ? (
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            Link sent
          </span>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all duration-200"
          >
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            Send Reset Link
          </button>
        )}
      </td>
    </tr>
  );
}

function BranchDeptCell({
  isSuperadmin,
  isStaff,
  branchName,
  departmentName,
  position,
}: {
  isSuperadmin: boolean;
  isStaff: boolean;
  branchName: string | null;
  departmentName: string | null;
  position: string | null;
}) {
  if (isSuperadmin) {
    return (
      <div className="text-sm font-medium text-slate-700">
        Optimisation Department
      </div>
    );
  }

  void isStaff; // HQ inference still applies to filtering, not display
  const deptLine = [departmentName, position].filter(Boolean).join(" · ");
  const hasAnything = branchName || deptLine;

  if (!hasAnything) {
    return <span className="text-slate-400 text-sm">—</span>;
  }

  return (
    <div className="text-sm">
      {branchName && (
        <div className="font-semibold text-slate-800">{branchName}</div>
      )}
      {deptLine && (
        <div className="text-[12px] font-medium text-slate-500">{deptLine}</div>
      )}
    </div>
  );
}

function RolePill({ roleType }: { roleType: string }) {
  const lower = roleType.toLowerCase();
  const palette: Record<string, { bg: string; text: string; dot: string }> = {
    superadmin: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500" },
    ceo: { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500" },
    admin: { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500" },
    finance: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
    hr: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  };
  const m =
    palette[lower] ??
    { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${m.bg} ${m.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${m.dot}`}
        aria-hidden="true"
      />
      {prettyRole(roleType)}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Active
      </span>
    );
  }
  if (lower === "inactive" || lower === "disabled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-600">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true" />
        Inactive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-600">
      {prettyRole(status)}
    </span>
  );
}
