"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  Home,
  ChevronRight,
  ChevronDown,
  Search,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Layers,
  X,
  CircleUser,
  CalendarClock,
  Info,
  Handshake,
} from "lucide-react";
import AccessTabs from "@/app/components/AccessTabs";

type Branch = { branch_id: number; branch_name: string };
type Department = { department_id: number; department_name: string };

type ModuleKey = "nexus" | "fa_system" | "pcm_system" | "manpower_planning";
type ScopeType = "branch" | "department";

type ScopeGrant = {
  id: string;
  scopeType: ScopeType;
  scopeId: number;
  scopeName: string;
  modules: ModuleKey[];
  expiresAt: string | null; // yyyy-mm-dd, null = no expiry
};

type AccountGrant = {
  id: string;
  email: string;
  position: string;
  scopes: ScopeGrant[];
};

// Grantable modules. CRM is branded "CNS" in-app ("Client Nexus System"); the
// spec calls it Nexus — we bridge both.
const MODULES: { key: ModuleKey; label: string; hint?: string }[] = [
  { key: "nexus", label: "Nexus", hint: "CNS / CRM" },
  { key: "fa_system", label: "FA System" },
  { key: "pcm_system", label: "PCM System" },
  { key: "manpower_planning", label: "Manpower Planning" },
];

// Employment-position vocabulary — source of truth is
// src/app/components/EmployeeForm.tsx ROLE_OPTIONS. The spec's "Branch Manager /
// Part Time / Full Time / Coach" are these positions, not role_type values.
const POSITION_OPTIONS = [
  "FT CEO",
  "FT HOD",
  "FT EXEC",
  "BM",
  "FT COACH",
  "PT COACH",
  "INTERN",
  "PROTEGE INTERN",
  "HQ INTERN",
];

const MODULE_LABEL: Record<ModuleKey, string> = {
  nexus: "Nexus",
  fa_system: "FA System",
  pcm_system: "PCM System",
  manpower_planning: "Manpower Planning",
};

/**
 * PLACEHOLDER role→module rule. There is no role-permission table in the repo
 * yet — confirm the real mapping before this gates anything server-side.
 * For now: Coach positions cannot receive Manpower Planning.
 */
function moduleAllowedForPosition(moduleKey: ModuleKey, position: string): boolean {
  const p = position.toUpperCase();
  if (moduleKey === "manpower_planning" && p.includes("COACH")) return false;
  return true;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  // end-of-day on the expiry date
  return new Date(`${expiresAt}T23:59:59`).getTime() < Date.now();
}

function prettyPosition(p: string): string {
  return p;
}

let idSeq = 1000;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

export default function BuddySystemView({
  branches,
  departments,
}: {
  branches: Branch[];
  departments: Department[];
}) {
  // Seed a few mock accounts so the table is meaningful. Uses real branch names
  // where available. NOT persisted — resets on reload.
  const [accounts, setAccounts] = useState<AccountGrant[]>(() =>
    seedAccounts(branches),
  );

  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ModalState | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (positionFilter !== "all" && a.position !== positionFilter) return false;
      if (q && !a.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [accounts, positionFilter, query]);

  const openCreate = () =>
    setModal({
      mode: "create",
      email: "",
      position: "BM",
      expiresAt: "",
      branchIds: new Set(),
      deptIds: new Set(),
      modules: new Set(),
    });

  const openEdit = (account: AccountGrant) => {
    const branchIds = new Set<number>();
    const deptIds = new Set<number>();
    for (const s of account.scopes) {
      if (s.scopeType === "branch") branchIds.add(s.scopeId);
      else deptIds.add(s.scopeId);
    }
    // Pre-fill modules from the union across scopes (edit applies uniformly).
    const modules = new Set<ModuleKey>();
    account.scopes.forEach((s) => s.modules.forEach((m) => modules.add(m)));
    const firstExpiry = account.scopes.find((s) => s.expiresAt)?.expiresAt ?? "";
    setModal({
      mode: "edit",
      editAccountId: account.id,
      email: account.email,
      position: account.position,
      expiresAt: firstExpiry,
      branchIds,
      deptIds,
      modules,
    });
  };

  const revokeScope = (accountId: string, scopeId: string) => {
    setAccounts((prev) =>
      prev
        .map((a) =>
          a.id === accountId
            ? { ...a, scopes: a.scopes.filter((s) => s.id !== scopeId) }
            : a,
        )
        .filter((a) => a.scopes.length > 0),
    );
  };

  const submitGrant = (m: ModalState) => {
    const email = m.email.trim().toLowerCase();
    const modules = [...m.modules].filter((mod) =>
      moduleAllowedForPosition(mod, m.position),
    );
    const expiresAt = m.expiresAt || null;

    const scopes: ScopeGrant[] = [];
    for (const bId of m.branchIds) {
      const b = branches.find((x) => x.branch_id === bId);
      if (!b) continue;
      scopes.push({
        id: nextId("scope"),
        scopeType: "branch",
        scopeId: bId,
        scopeName: b.branch_name,
        modules: [...modules],
        expiresAt,
      });
    }
    for (const dId of m.deptIds) {
      const d = departments.find((x) => x.department_id === dId);
      if (!d) continue;
      scopes.push({
        id: nextId("scope"),
        scopeType: "department",
        scopeId: dId,
        scopeName: d.department_name,
        modules: [...modules],
        expiresAt,
      });
    }

    setAccounts((prev) => {
      // Edit → replace that account's scopes wholesale (uniform modules).
      if (m.mode === "edit" && m.editAccountId) {
        return prev
          .map((a) =>
            a.id === m.editAccountId
              ? { ...a, email, position: m.position, scopes }
              : a,
          )
          .filter((a) => a.scopes.length > 0);
      }
      // Create → merge into existing account by email, else add new.
      const existing = prev.find((a) => a.email === email);
      if (existing) {
        return prev.map((a) =>
          a.id === existing.id
            ? { ...a, position: m.position, scopes: [...a.scopes, ...scopes] }
            : a,
        );
      }
      return [
        ...prev,
        { id: nextId("acct"), email, position: m.position, scopes },
      ];
    });
    setModal(null);
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
          <span className="text-slate-900 font-medium">Buddy System</span>
        </nav>

        {/* Header + tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Buddy System</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Grant an account temporary access to cover another branch — e.g.
              while that branch&apos;s manager is on leave.
            </p>
          </div>
          <AccessTabs />
        </div>

        {/* Card */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search account by email…"
                  className="h-10 w-full pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
                />
              </div>
              <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all duration-200">
                <CircleUser className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="bg-transparent text-sm font-semibold text-slate-800 focus:outline-none pr-1"
                >
                  <option value="all">All roles</option>
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {prettyPosition(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all duration-200"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Grant access
            </button>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <EmptyState onGrant={openCreate} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="text-left px-6 py-3 font-semibold">Account</th>
                    <th className="text-left px-6 py-3 font-semibold">
                      Accessible branches
                    </th>
                    <th className="text-left px-6 py-3 font-semibold">Modules</th>
                    <th className="text-right px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <AccountRows
                      key={a.id}
                      account={a}
                      open={expanded[a.id] ?? false}
                      onToggle={() =>
                        setExpanded((e) => ({ ...e, [a.id]: !(e[a.id] ?? false) }))
                      }
                      onEdit={() => openEdit(a)}
                      onRevokeScope={(scopeId) => revokeScope(a.id, scopeId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Not-persisted note */}
          <div className="flex items-center gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50/50">
            <Info className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" aria-hidden="true" />
            <span className="text-xs text-slate-600">
              Interface preview — grants are held in the page only and are not saved
              to the database yet.
            </span>
          </div>
        </section>
      </div>

      {modal && (
        <GrantModal
          state={modal}
          branches={branches}
          departments={departments}
          onChange={setModal}
          onClose={() => setModal(null)}
          onSubmit={submitGrant}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Rows
// ──────────────────────────────────────────────────────────

function modulesUniform(scopes: ScopeGrant[]): boolean {
  if (scopes.length <= 1) return true;
  const key = (s: ScopeGrant) => [...s.modules].sort().join(",");
  const first = key(scopes[0]);
  return scopes.every((s) => key(s) === first);
}

function AccountRows({
  account,
  open,
  onToggle,
  onEdit,
  onRevokeScope,
}: {
  account: AccountGrant;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRevokeScope: (scopeId: string) => void;
}) {
  const multi = account.scopes.length > 1;
  const uniform = modulesUniform(account.scopes);
  const expandable = multi && !uniform;

  return (
    <>
      <tr className="bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors duration-150 align-top">
        <td className="px-6 py-4">
          <div className="flex items-start gap-2">
            {expandable ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-label={open ? "Collapse" : "Expand"}
                className="mt-0.5 text-slate-400 hover:text-slate-700"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    open ? "" : "-rotate-90"
                  }`}
                  aria-hidden="true"
                />
              </button>
            ) : (
              <span className="w-4" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">
                {account.email}
              </div>
              <span className="inline-flex items-center mt-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px] font-semibold">
                {account.position}
              </span>
            </div>
          </div>
        </td>

        <td className="px-6 py-4">
          <div className="flex flex-wrap gap-1.5">
            {account.scopes.map((s) => (
              <ScopeChip key={s.id} scope={s} />
            ))}
          </div>
        </td>

        <td className="px-6 py-4">
          {expandable ? (
            <span className="text-xs font-medium text-slate-500">
              Varies by branch — expand to view
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {account.scopes[0]?.modules.length ? (
                account.scopes[0].modules.map((m) => (
                  <ModuleChip key={m} moduleKey={m} />
                ))
              ) : (
                <span className="text-slate-400 text-sm">—</span>
              )}
            </div>
          )}
        </td>

        <td className="px-6 py-4 text-right">
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all duration-200"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Edit
            </button>
            {!expandable && (
              <button
                type="button"
                onClick={() => onRevokeScope(account.scopes[0].id)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition-all duration-200"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                {multi ? "Revoke all" : "Revoke"}
              </button>
            )}
          </div>
        </td>
      </tr>

      {expandable &&
        open &&
        account.scopes.map((s) => (
          <tr
            key={s.id}
            className="bg-slate-50/50 border-b border-slate-100"
          >
            <td className="px-6 py-3">
              <span className="pl-6 text-xs font-medium text-slate-400">
                ↳ scope
              </span>
            </td>
            <td className="px-6 py-3">
              <ScopeChip scope={s} />
            </td>
            <td className="px-6 py-3">
              <div className="flex flex-wrap gap-1.5">
                {s.modules.length ? (
                  s.modules.map((m) => <ModuleChip key={m} moduleKey={m} />)
                ) : (
                  <span className="text-slate-400 text-sm">—</span>
                )}
              </div>
            </td>
            <td className="px-6 py-3 text-right">
              <button
                type="button"
                onClick={() => onRevokeScope(s.id)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 transition-all duration-200"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Revoke
              </button>
            </td>
          </tr>
        ))}
    </>
  );
}

function ScopeChip({ scope }: { scope: ScopeGrant }) {
  const expired = isExpired(scope.expiresAt);
  const isBranch = scope.scopeType === "branch";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        expired
          ? "bg-slate-100 text-slate-400 line-through"
          : isBranch
            ? "bg-indigo-50 text-indigo-700"
            : "bg-violet-50 text-violet-700"
      }`}
      title={
        scope.expiresAt
          ? `${expired ? "Expired" : "Expires"} ${DATE_FMT.format(new Date(scope.expiresAt))}`
          : "No expiry"
      }
    >
      {isBranch ? (
        <Building2 className="w-3 h-3" aria-hidden="true" />
      ) : (
        <Layers className="w-3 h-3" aria-hidden="true" />
      )}
      {scope.scopeName}
      {scope.expiresAt && (
        <CalendarClock className="w-3 h-3 opacity-70" aria-hidden="true" />
      )}
    </span>
  );
}

function ModuleChip({ moduleKey }: { moduleKey: ModuleKey }) {
  const palette: Record<ModuleKey, string> = {
    nexus: "bg-sky-50 text-sky-700",
    fa_system: "bg-amber-50 text-amber-700",
    pcm_system: "bg-emerald-50 text-emerald-700",
    manpower_planning: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${palette[moduleKey]}`}
    >
      {MODULE_LABEL[moduleKey]}
    </span>
  );
}

function EmptyState({ onGrant }: { onGrant: () => void }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Handshake className="w-6 h-6 text-slate-400" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-slate-600">
        No accounts have branch access yet.
      </p>
      <button
        type="button"
        onClick={onGrant}
        className="mt-5 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all duration-200"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        Grant access
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Grant modal
// ──────────────────────────────────────────────────────────

type ModalState = {
  mode: "create" | "edit";
  editAccountId?: string;
  email: string;
  position: string;
  expiresAt: string;
  branchIds: Set<number>;
  deptIds: Set<number>;
  modules: Set<ModuleKey>;
};

function GrantModal({
  state,
  branches,
  departments,
  onChange,
  onClose,
  onSubmit,
}: {
  state: ModalState;
  branches: Branch[];
  departments: Department[];
  onChange: (s: ModalState) => void;
  onClose: () => void;
  onSubmit: (s: ModalState) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const scopeCount = state.branchIds.size + state.deptIds.size;
  const allowedModuleCount = [...state.modules].filter((m) =>
    moduleAllowedForPosition(m, state.position),
  ).length;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim());
  const canSubmit = emailValid && scopeCount > 0 && allowedModuleCount > 0;

  const toggleBranch = (id: number) => {
    const next = new Set(state.branchIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...state, branchIds: next });
  };
  const toggleDept = (id: number) => {
    const next = new Set(state.deptIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...state, deptIds: next });
  };
  const toggleModule = (key: ModuleKey) => {
    if (!moduleAllowedForPosition(key, state.position)) return;
    const next = new Set(state.modules);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ ...state, modules: next });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grant-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
          <h3 id="grant-title" className="text-base font-semibold text-slate-900">
            {state.mode === "edit" ? "Edit branch access" : "Grant branch access"}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            All selected branches receive the same role and module access.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Account email */}
          <Field label="Account email">
            <input
              type="email"
              value={state.email}
              disabled={state.mode === "edit"}
              onChange={(e) => onChange({ ...state, email: e.target.value })}
              placeholder="person@ebright.my"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500 transition-all duration-200"
            />
          </Field>

          {/* Role */}
          <Field label="Role">
            <select
              value={state.position}
              onChange={(e) => onChange({ ...state, position: e.target.value })}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
            >
              {POSITION_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {prettyPosition(p)}
                </option>
              ))}
            </select>
          </Field>

          {/* Access ends */}
          <Field
            label="Access ends"
            hint="Optional — leave blank for permanent access. Set a date for temporary leave-cover grants."
          >
            <input
              type="date"
              value={state.expiresAt}
              onChange={(e) => onChange({ ...state, expiresAt: e.target.value })}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all duration-200"
            />
          </Field>

          {/* Branches & departments */}
          <Field label="Branches & departments">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {branches.map((b) => (
                <CheckRow
                  key={`b-${b.branch_id}`}
                  checked={state.branchIds.has(b.branch_id)}
                  onToggle={() => toggleBranch(b.branch_id)}
                  icon={<Building2 className="w-3.5 h-3.5 text-slate-400" />}
                  label={b.branch_name}
                />
              ))}
              {departments.map((d) => (
                <CheckRow
                  key={`d-${d.department_id}`}
                  checked={state.deptIds.has(d.department_id)}
                  onToggle={() => toggleDept(d.department_id)}
                  icon={<Layers className="w-3.5 h-3.5 text-slate-400" />}
                  label={d.department_name}
                />
              ))}
            </div>
          </Field>

          {/* Modules */}
          <Field label="Modules">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {MODULES.map((mod) => {
                const allowed = moduleAllowedForPosition(mod.key, state.position);
                return (
                  <CheckRow
                    key={mod.key}
                    checked={allowed && state.modules.has(mod.key)}
                    disabled={!allowed}
                    onToggle={() => toggleModule(mod.key)}
                    label={mod.label}
                    hint={mod.hint}
                    note={
                      !allowed
                        ? `${mod.label} — not available for this role`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(state)}
            disabled={!canSubmit}
            className="inline-flex items-center h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
          >
            {state.mode === "edit" ? "Save" : "Grant access"} to {scopeCount}{" "}
            {scopeCount === 1 ? "branch" : "branches"}, {allowedModuleCount}{" "}
            {allowedModuleCount === 1 ? "module" : "modules"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800 mb-1.5">
        {label}
      </label>
      {hint && <p className="text-[12px] text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

function CheckRow({
  checked,
  disabled,
  onToggle,
  icon,
  label,
  hint,
  note,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  note?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 px-3 py-2.5 text-sm ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-slate-50"
      } transition-colors duration-150`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 disabled:cursor-not-allowed"
      />
      {icon}
      <span
        className={`font-medium ${disabled ? "text-slate-400" : "text-slate-700"}`}
      >
        {label}
      </span>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      {note && (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
          <Info className="w-3 h-3" aria-hidden="true" />
          {note}
        </span>
      )}
    </label>
  );
}

// ──────────────────────────────────────────────────────────
// Mock seed
// ──────────────────────────────────────────────────────────

function seedAccounts(branches: Branch[]): AccountGrant[] {
  if (branches.length === 0) return [];
  const b = (i: number) => branches[i % branches.length];
  const b0 = b(0);
  const b1 = b(1);
  const b2 = b(2);

  return [
    {
      id: "acct_1",
      email: "ebrightampang@gmail.com",
      position: "BM",
      scopes: [
        {
          id: "scope_1",
          scopeType: "branch",
          scopeId: b0.branch_id,
          scopeName: b0.branch_name,
          modules: ["fa_system", "pcm_system", "nexus"],
          expiresAt: null,
        },
        {
          id: "scope_2",
          scopeType: "branch",
          scopeId: b1.branch_id,
          scopeName: b1.branch_name,
          modules: ["nexus"],
          expiresAt: null,
        },
      ],
    },
    {
      id: "acct_2",
      email: "ebrightklang@gmail.com",
      position: "FT COACH",
      scopes: [
        {
          id: "scope_3",
          scopeType: "branch",
          scopeId: b2.branch_id,
          scopeName: b2.branch_name,
          modules: ["fa_system", "pcm_system"],
          expiresAt: "2026-08-15",
        },
      ],
    },
  ];
}
