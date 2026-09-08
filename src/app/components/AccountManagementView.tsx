"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, useEffect } from "react";
import {
  Home,
  ChevronRight,
  Search,
  KeyRound,
  Briefcase,
  CircleUser,
  MapPin,
  X,
  ChevronDown,
  Loader2,
  Mail,
  Shield,
  SlidersHorizontal,
  Check,
  AlertCircle,
  User,
  UserPlus,
} from "lucide-react";
import {
  updateAccountRole,
  updateAccountEmail,
  updateAccountPassword,
  updateAccountName,
  updateAccountOrgUnit,
} from "@/app/account-management/actions";
import AccessTabs from "@/app/components/AccessTabs";
import AddAccountModal from "@/app/components/AddAccountModal";

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
  branches: { branch_id: number; branch_name: string; region: string | null }[];
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

function roleAccent(roleType: string): { bg: string; text: string; dot: string } {
  const palette: Record<string, { bg: string; text: string; dot: string }> = {
    superadmin: { bg: "bg-rose-100 dark:bg-rose-900", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
    ceo: { bg: "bg-purple-100 dark:bg-purple-900", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
    admin: { bg: "bg-indigo-100 dark:bg-indigo-900", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
    finance: { bg: "bg-amber-100 dark:bg-amber-900", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
    hr: { bg: "bg-emerald-100 dark:bg-emerald-900", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
    department: { bg: "bg-sky-100 dark:bg-sky-900", text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
    branch: { bg: "bg-teal-100 dark:bg-teal-900", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
    "regional manager": {
      bg: "bg-cyan-100 dark:bg-cyan-900",
      text: "text-cyan-700 dark:text-cyan-300",
      dot: "bg-cyan-500",
    },
    od: { bg: "bg-violet-100 dark:bg-violet-900", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
    hod: { bg: "bg-fuchsia-100 dark:bg-fuchsia-900", text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
    staff: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-700 dark:text-slate-300", dot: "bg-slate-500" },
  };
  return (
    palette[roleType.toLowerCase()] ?? {
      bg: "bg-slate-100 dark:bg-slate-800",
      text: "text-slate-600 dark:text-slate-300",
      dot: "bg-slate-400",
    }
  );
}

// Staff all share the "staff" role, so differentiate them by work position
// (employment.position — BM, FT COACH, PT COACH, FT EXEC, …).
function positionAccent(position: string | null): {
  bg: string;
  text: string;
  dot: string;
} {
  const p = (position ?? "").trim().toUpperCase();
  const palette: Record<string, { bg: string; text: string; dot: string }> = {
    BM: { bg: "bg-orange-100 dark:bg-orange-900", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
    "FT EXEC": { bg: "bg-blue-100 dark:bg-blue-900", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
    "FT COACH": { bg: "bg-lime-100 dark:bg-lime-900", text: "text-lime-700 dark:text-lime-300", dot: "bg-lime-600" },
    "PT COACH": {
      bg: "bg-green-100 dark:bg-green-900",
      text: "text-green-700 dark:text-green-300",
      dot: "bg-green-500",
    },
    "FT HOD": { bg: "bg-pink-100 dark:bg-pink-900", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
    "FT CEO": {
      bg: "bg-purple-100 dark:bg-purple-900",
      text: "text-purple-700 dark:text-purple-300",
      dot: "bg-purple-500",
    },
    INTERN: { bg: "bg-pink-100 dark:bg-pink-900", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
    ADMIN: { bg: "bg-indigo-100 dark:bg-indigo-900", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500" },
  };
  return (
    palette[p] ?? {
      bg: "bg-slate-100 dark:bg-slate-800",
      text: "text-slate-600 dark:text-slate-300",
      dot: "bg-slate-400",
    }
  );
}

/** Role drives the color, except staff — who are colored by their position. */
function accentForUser(
  roleType: string,
  position: string | null,
): { bg: string; text: string; dot: string } {
  if (roleType.toLowerCase() === "staff") return positionAccent(position);
  return roleAccent(roleType);
}

export default function AccountManagementView({ data }: { data: AccountData }) {
  // Local copy so inline edits reflect immediately without a full reload.
  const [users, setUsers] = useState<AccountUser[]>(data.users);
  const [roleId, setRoleId] = useState<number | "all">("all");
  const [position, setPosition] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AccountUser | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setUsers(data.users);
  }, [data.users]);

  const handleCreated = (u: AccountUser) => {
    setUsers((prev) => [u, ...prev.filter((x) => x.user_id !== u.user_id)]);
    setAdding(false);
  };

  const patchUser = (userId: number, patch: Partial<AccountUser>) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, ...patch } : u)),
    );
    setEditing((cur) =>
      cur && cur.user_id === userId ? { ...cur, ...patch } : cur,
    );
  };

  // Distinct positions present in the data, for the Position filter dropdown.
  const positionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) {
      const p = u.position?.trim();
      if (p) set.add(p);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleId !== "all" && u.role_id !== roleId) return false;

      if (position !== "all" && (u.position?.trim() ?? "") !== position)
        return false;

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
  }, [users, roleId, position, query]);

  const handleRoleChange = (next: number | "all") => {
    setRoleId(next);
  };

  const hasActiveFilters =
    query.length > 0 || position !== "all" || roleId !== "all";

  const clearFilters = () => {
    setQuery("");
    setPosition("all");
    setRoleId("all");
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16 space-y-6">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-all duration-200 dark:hover:text-slate-100"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium dark:text-slate-100">Account Management</span>
        </nav>

        {/* Header — compact inline title with section tabs at the right */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">Account Management</h1>
          <AccessTabs />
        </div>

        {/* Table */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Toolbar — title, count, and filters live in the table header */}
          <div className="border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">User Accounts</h2>
              <div className="flex items-center gap-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {filtered.length} of {users.length} accounts shown
                </p>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all duration-200"
                >
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add User
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email, branch…"
                  className="h-10 w-full pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                />
              </div>

              <DropdownFilter
                icon={
                  <CircleUser className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                }
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

              <DropdownFilter
                icon={
                  <Briefcase className="w-4 h-4 text-indigo-500" aria-hidden="true" />
                }
                value={position}
                onChange={setPosition}
                options={[
                  { value: "all", label: "All Positions" },
                  ...positionOptions.map((p) => ({ value: p, label: p })),
                ]}
              />

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900 hover:text-rose-700 dark:hover:text-rose-300 transition-all duration-200"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <th className="text-left px-6 py-3 font-semibold">Account</th>
                  <th className="text-left px-6 py-3 font-semibold">Role</th>
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
                      roles={data.roles}
                      zebra={idx % 2 === 1}
                      onRolePatched={(roleIdNext, roleTypeNext) =>
                        patchUser(u.user_id, {
                          role_id: roleIdNext,
                          role_type: roleTypeNext,
                        })
                      }
                      onEdit={() => setEditing(u)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50">
            <KeyRound
              className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 dark:text-indigo-400"
              aria-hidden="true"
            />
            <span className="text-xs text-slate-600 dark:text-slate-300">
              Passwords are stored as bcrypt hashes and can never be viewed — editing
              only sets a new one. Role changes save the moment you pick them.
            </span>
          </div>
        </section>
      </div>

      {editing && (
        <EditAccountModal
          user={editing}
          roles={data.roles}
          branches={data.branches}
          departments={data.departments}
          onClose={() => setEditing(null)}
          onPatch={patchUser}
        />
      )}

      {adding && (
        <AddAccountModal
          roles={data.roles}
          branches={data.branches}
          departments={data.departments}
          onClose={() => setAdding(false)}
          onCreated={handleCreated}
        />
      )}
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
    <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200 dark:border-slate-500 dark:bg-slate-950 dark:focus-within:border-indigo-500 dark:focus-within:ring-indigo-900">
      {icon}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none pr-1 max-w-[180px] dark:text-slate-200"
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
  roles,
  zebra,
  onRolePatched,
  onEdit,
}: {
  user: AccountUser;
  roles: { role_id: number; role_type: string }[];
  zebra: boolean;
  onRolePatched: (roleId: number, roleType: string) => void;
  onEdit: () => void;
}) {
  const rowBg = zebra ? "bg-slate-50/50 dark:bg-slate-800/50" : "bg-white dark:bg-slate-900";
  return (
    <tr
      className={`${rowBg} hover:bg-slate-100 transition-colors duration-200 border-b border-slate-100 last:border-b-0 dark:hover:bg-slate-800 dark:border-slate-800`}
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full w-9 h-9 bg-indigo-100 text-indigo-700 font-semibold text-sm flex items-center justify-center shrink-0 dark:bg-indigo-900 dark:text-indigo-200">
            {initials(user.full_name, user.email)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate dark:text-slate-100">
              {user.full_name ?? "—"}
            </div>
            <div className="text-[12px] text-slate-500 truncate dark:text-slate-400">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <RoleSelect user={user} roles={roles} onPatched={onRolePatched} />
      </td>
      <td className="px-6 py-4 text-center">
        <BranchDeptCell
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
          <div
            className="font-medium text-slate-700 dark:text-slate-300 tabular-nums"
            suppressHydrationWarning
          >
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
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all duration-200"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          Actions
        </button>
      </td>
    </tr>
  );
}

/** Inline role picker that persists the moment a new role is chosen. */
function RoleSelect({
  user,
  roles,
  onPatched,
}: {
  user: AccountUser;
  roles: { role_id: number; role_type: string }[];
  onPatched: (roleId: number, roleType: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const accent = accentForUser(user.role_type, user.position);

  const handleChange = (nextId: number) => {
    if (nextId === user.role_id) return;
    const nextRole = roles.find((r) => r.role_id === nextId);
    if (!nextRole) return;
    const prevId = user.role_id;
    const prevType = user.role_type;
    // Optimistic — reflect the new role instantly, revert if the server rejects.
    onPatched(nextId, nextRole.role_type);
    setError(null);
    startTransition(async () => {
      const res = await updateAccountRole(user.user_id, nextId);
      if (!res.ok) {
        onPatched(prevId, prevType);
        setError(res.error ?? "Could not update role.");
      }
    });
  };

  const isStaff = user.role_type.toLowerCase() === "staff";
  return (
    <div className="inline-flex flex-col gap-1">
      <div
        title={
          isStaff && user.position ? `Position: ${user.position}` : undefined
        }
        className={`relative inline-flex items-center h-8 rounded-full pl-2.5 pr-7 ${accent.bg} ${accent.text} focus-within:ring-2 focus-within:ring-indigo-200 transition-all duration-200`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${accent.dot} mr-1.5`}
          aria-hidden="true"
        />
        <select
          value={user.role_id}
          disabled={pending}
          onChange={(e) => handleChange(Number(e.target.value))}
          aria-label={`Role for ${user.full_name ?? user.email}`}
          className="appearance-none bg-transparent text-xs font-semibold focus:outline-none cursor-pointer disabled:cursor-wait pr-0"
        >
          {roles.map((r) => (
            <option key={r.role_id} value={r.role_id}>
              {prettyRole(r.role_type)}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 inline-flex items-center">
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
          )}
        </span>
      </div>
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}

function BranchDeptCell({
  branchName,
  departmentName,
  position,
}: {
  branchName: string | null;
  departmentName: string | null;
  position: string | null;
}) {
  const deptLine = [departmentName, position].filter(Boolean).join(" · ");
  const hasAnything = branchName || deptLine;

  if (!hasAnything) {
    return <span className="text-slate-400 text-sm">—</span>;
  }

  return (
    <div className="text-sm">
      {branchName && (
        <div className="font-semibold text-slate-800 dark:text-slate-100">{branchName}</div>
      )}
      {deptLine && (
        <div className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{deptLine}</div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Active
      </span>
    );
  }
  if (lower === "inactive" || lower === "disabled") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" aria-hidden="true" />
        Inactive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {prettyRole(status)}
    </span>
  );
}

// ──────────────────────────────────────────────────────────
// Edit modal — role, email, password
// ──────────────────────────────────────────────────────────

function EditAccountModal({
  user,
  roles,
  branches,
  departments,
  onClose,
  onPatch,
}: {
  user: AccountUser;
  roles: { role_id: number; role_type: string }[];
  branches: { branch_id: number; branch_name: string }[];
  departments: { department_id: number; department_name: string }[];
  onClose: () => void;
  onPatch: (userId: number, patch: Partial<AccountUser>) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accent = accentForUser(user.role_type, user.position);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-account-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full w-11 h-11 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-center shrink-0">
              {initials(user.full_name, user.email)}
            </div>
            <div className="min-w-0">
              <h3
                id="edit-account-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                {user.full_name ?? user.email}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.bg} ${accent.text}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${accent.dot}`}
                    aria-hidden="true"
                  />
                  {prettyRole(user.role_type)}
                </span>
                <span className="text-[11px] text-slate-400 truncate">
                  {user.email}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <NameSection user={user} onPatch={onPatch} />
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <RoleSection user={user} roles={roles} onPatch={onPatch} />
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <OrgUnitSection
            user={user}
            branches={branches}
            departments={departments}
            onPatch={onPatch}
          />
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <EmailSection user={user} onPatch={onPatch} />
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <PasswordSection user={user} />
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-9 px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-600 transition-all duration-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionShell({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-500">{icon}</span>
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h4>
      </div>
      {hint && <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2.5">{hint}</p>}
      {children}
    </div>
  );
}

function Feedback({
  state,
}: {
  state: { kind: "ok" | "error"; msg: string } | null;
}) {
  if (!state) return null;
  if (state.kind === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600">
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
        {state.msg}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-rose-600">
      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
      {state.msg}
    </span>
  );
}

function NameSection({
  user,
  onPatch,
}: {
  user: AccountUser;
  onPatch: (userId: number, patch: Partial<AccountUser>) => void;
}) {
  const [value, setValue] = useState(user.full_name ?? "");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "ok" | "error"; msg: string } | null>(
    null,
  );

  useEffect(() => setValue(user.full_name ?? ""), [user.full_name]);
  const dirty = value.trim() !== (user.full_name ?? "").trim();

  const save = () => {
    setState(null);
    startTransition(async () => {
      const res = await updateAccountName(user.user_id, value);
      if (res.ok) {
        const next = value.trim();
        onPatch(user.user_id, { full_name: next });
        setValue(next);
        setState({ kind: "ok", msg: "Name updated" });
      } else {
        setState({ kind: "error", msg: res.error ?? "Could not update name." });
      }
    });
  };

  return (
    <SectionShell icon={<User className="w-4 h-4" />} title="Name">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Full name"
          autoComplete="off"
          className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
        />
        <SaveButton disabled={!dirty || !value.trim()} pending={pending} onClick={save} />
      </div>
      <div className="mt-2">
        <Feedback state={state} />
      </div>
    </SectionShell>
  );
}

function OrgUnitSection({
  user,
  branches,
  departments,
  onPatch,
}: {
  user: AccountUser;
  branches: { branch_id: number; branch_name: string }[];
  departments: { department_id: number; department_name: string }[];
  onPatch: (userId: number, patch: Partial<AccountUser>) => void;
}) {
  const currentValue =
    user.branch_id != null
      ? `branch:${user.branch_id}`
      : user.department_id != null
        ? `dept:${user.department_id}`
        : "";
  const [value, setValue] = useState(currentValue);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "ok" | "error"; msg: string } | null>(
    null,
  );

  useEffect(() => setValue(currentValue), [currentValue]);
  const dirty = value !== currentValue;

  const save = () => {
    setState(null);
    startTransition(async () => {
      const res = await updateAccountOrgUnit(user.user_id, value);
      if (res.ok) {
        let patch: Partial<AccountUser>;
        if (value.startsWith("branch:")) {
          const id = Number(value.slice("branch:".length));
          patch = {
            branch_id: id,
            branch_name: branches.find((b) => b.branch_id === id)?.branch_name ?? null,
            department_id: null,
            department_name: null,
          };
        } else if (value.startsWith("dept:")) {
          const id = Number(value.slice("dept:".length));
          patch = {
            department_id: id,
            department_name:
              departments.find((d) => d.department_id === id)?.department_name ?? null,
            branch_id: null,
            branch_name: null,
          };
        } else {
          patch = {
            branch_id: null,
            branch_name: null,
            department_id: null,
            department_name: null,
          };
        }
        onPatch(user.user_id, patch);
        setState({ kind: "ok", msg: "Branch / department updated" });
      } else {
        setState({
          kind: "error",
          msg: res.error ?? "Could not update branch/department.",
        });
      }
    });
  };

  return (
    <SectionShell
      icon={<MapPin className="w-4 h-4" />}
      title="Branch / Department"
      hint="Assign the account to one branch or one department."
    >
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-all duration-200"
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
        <SaveButton disabled={!dirty} pending={pending} onClick={save} />
      </div>
      <div className="mt-2">
        <Feedback state={state} />
      </div>
    </SectionShell>
  );
}

function RoleSection({
  user,
  roles,
  onPatch,
}: {
  user: AccountUser;
  roles: { role_id: number; role_type: string }[];
  onPatch: (userId: number, patch: Partial<AccountUser>) => void;
}) {
  const [value, setValue] = useState(user.role_id);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "ok" | "error"; msg: string } | null>(
    null,
  );

  useEffect(() => setValue(user.role_id), [user.role_id]);
  const dirty = value !== user.role_id;

  const save = () => {
    const nextRole = roles.find((r) => r.role_id === value);
    if (!nextRole) return;
    setState(null);
    startTransition(async () => {
      const res = await updateAccountRole(user.user_id, value);
      if (res.ok) {
        onPatch(user.user_id, {
          role_id: value,
          role_type: nextRole.role_type,
        });
        setState({ kind: "ok", msg: "Role updated" });
      } else {
        setState({ kind: "error", msg: res.error ?? "Could not update role." });
      }
    });
  };

  return (
    <SectionShell icon={<Shield className="w-4 h-4" />} title="Role">
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 text-sm font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
        >
          {roles.map((r) => (
            <option key={r.role_id} value={r.role_id}>
              {prettyRole(r.role_type)}
            </option>
          ))}
        </select>
        <SaveButton disabled={!dirty} pending={pending} onClick={save} />
      </div>
      <div className="mt-2">
        <Feedback state={state} />
      </div>
    </SectionShell>
  );
}

function EmailSection({
  user,
  onPatch,
}: {
  user: AccountUser;
  onPatch: (userId: number, patch: Partial<AccountUser>) => void;
}) {
  const [value, setValue] = useState(user.email);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "ok" | "error"; msg: string } | null>(
    null,
  );

  useEffect(() => setValue(user.email), [user.email]);
  const dirty = value.trim().toLowerCase() !== user.email.toLowerCase();

  const save = () => {
    setState(null);
    startTransition(async () => {
      const res = await updateAccountEmail(user.user_id, value);
      if (res.ok) {
        const next = value.trim().toLowerCase();
        onPatch(user.user_id, { email: next });
        setValue(next);
        setState({ kind: "ok", msg: "Email updated" });
      } else {
        setState({ kind: "error", msg: res.error ?? "Could not update email." });
      }
    });
  };

  return (
    <SectionShell
      icon={<Mail className="w-4 h-4" />}
      title="Email"
      hint="This is the address the user signs in with."
    >
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
        />
        <SaveButton disabled={!dirty} pending={pending} onClick={save} />
      </div>
      <div className="mt-2">
        <Feedback state={state} />
      </div>
    </SectionShell>
  );
}

function PasswordSection({ user }: { user: AccountUser }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<{ kind: "ok" | "error"; msg: string } | null>(
    null,
  );

  const canSave = pw.length >= 8 && pw === confirm;

  const save = () => {
    setState(null);
    if (pw.length < 8) {
      setState({ kind: "error", msg: "Password must be at least 8 characters." });
      return;
    }
    if (pw !== confirm) {
      setState({ kind: "error", msg: "Passwords do not match." });
      return;
    }
    startTransition(async () => {
      const res = await updateAccountPassword(user.user_id, pw);
      if (res.ok) {
        setPw("");
        setConfirm("");
        setState({ kind: "ok", msg: "Password updated" });
      } else {
        setState({ kind: "error", msg: res.error ?? "Could not update password." });
      }
    });
  };

  return (
    <SectionShell
      icon={<KeyRound className="w-4 h-4" />}
      title="Password"
      hint="Set a new password directly. The current one can't be viewed."
    >
      <div className="space-y-2">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password (min. 8 characters)"
          autoComplete="new-password"
          className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
        />
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            className="h-10 flex-1 rounded-xl border border-slate-200 dark:border-slate-500 bg-white dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
          />
          <SaveButton
            disabled={!canSave}
            pending={pending}
            onClick={save}
            label="Set"
          />
        </div>
      </div>
      <div className="mt-2">
        <Feedback state={state} />
      </div>
    </SectionShell>
  );
}

function SaveButton({
  disabled,
  pending,
  onClick,
  label = "Save",
}: {
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
    >
      {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
      {label}
    </button>
  );
}
