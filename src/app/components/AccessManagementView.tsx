"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Home,
  ChevronRight,
  Check,
  Lock,
  Save,
  CircleUser,
  Tags,
  ChevronDown,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import AccessTabs from "@/app/components/AccessTabs";
import {
  FEATURES,
  ACTIONS,
  SCOPES,
  SCOPE_LABEL,
  featureApplies,
  isCeilingLocked,
  type PermAction,
  type Scope,
} from "@/lib/access/types";
import {
  loadMatrix,
  saveMatrix,
  type MatrixGrant,
} from "@/app/access-management/actions";

type Role = { role_id: number; role_type: string };
type Department = {
  department_id: number;
  department_code: string;
  department_name: string;
};

// featureKey -> action -> scope (presence = allowed).
type Grants = Record<string, Partial<Record<PermAction, Scope>>>;

const ACTION_LABEL: Record<PermAction, string> = {
  view: "View",
  add: "Add",
  update: "Update",
  delete: "Delete",
  export: "Export",
};

function prettyRole(roleType: string): string {
  return roleType
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Sensible starting scope when a cell is first switched on. */
function defaultScopeFor(roleType: string): Scope {
  switch (roleType.toLowerCase()) {
    case "department":
      return "global";
    case "regional manager":
      return "region";
    case "branch":
    case "branch manager":
      return "branch";
    case "hod":
      return "team";
    default:
      return "own";
  }
}

function normalize(g: Grants): string {
  const out: Grants = {};
  for (const fk of Object.keys(g).sort()) {
    const actions = g[fk];
    const kept: Partial<Record<PermAction, Scope>> = {};
    for (const a of Object.keys(actions).sort() as PermAction[]) {
      const s = actions[a];
      if (s) kept[a] = s;
    }
    if (Object.keys(kept).length) out[fk] = kept;
  }
  return JSON.stringify(out);
}

const GROUP_ORDER = [
  "HRMS",
  "Attendance",
  "Manpower",
  "CNS",
  "FA System",
  "PCM System",
  "SMS",
  "Self-service",
];

export default function AccessManagementView({
  roles,
  departments,
  positions,
  canEdit,
}: {
  roles: Role[];
  departments: Department[];
  positions: string[];
  canEdit: boolean;
}) {
  const [roleId, setRoleId] = useState<number>(roles[0]?.role_id ?? 0);
  const role = roles.find((r) => r.role_id === roleId);
  const roleType = role?.role_type.toLowerCase() ?? "";
  const isImplicit = roleType === "superadmin" || roleType === "ceo";

  const subtypeOptions = useMemo(
    () => subtypeOptionsFor(roleType, departments, positions),
    [roleType, departments, positions],
  );
  // Multiple sub-types can be selected to bulk-apply the same matrix. The FIRST
  // selected is the "primary" whose stored matrix is loaded for editing; Save
  // writes the edited matrix to every selected sub-type.
  const [subtypes, setSubtypes] = useState<string[]>([]);
  const primary = subtypes[0] ?? "";

  const [grants, setGrants] = useState<Grants>({});
  const [baseline, setBaseline] = useState<Grants>({});
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const [flash, setFlash] = useState<
    { kind: "ok" | "error"; msg: string } | null
  >(null);

  // Reset sub-type selection when the role changes (start with the first option).
  useEffect(() => {
    setSubtypes(subtypeOptions?.[0] ? [subtypeOptions[0].value] : []);
  }, [subtypeOptions]);

  // Load the stored matrix of the PRIMARY (first-selected) sub-type.
  useEffect(() => {
    if (isImplicit || roleId === 0) {
      setGrants({});
      setBaseline({});
      return;
    }
    setFlash(null);
    startLoad(async () => {
      const res = await loadMatrix(roleId, primary);
      if (res.ok) {
        const g: Grants = {};
        for (const row of res.grants) {
          (g[row.feature_key] ??= {})[row.action] = row.scope;
        }
        setGrants(g);
        setBaseline(structuredClone(g));
      } else {
        setFlash({ kind: "error", msg: res.error });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, primary, isImplicit]);

  const dirty = normalize(grants) !== normalize(baseline);

  const cellScope = (feature: string, action: PermAction): Scope | null =>
    grants[feature]?.[action] ?? null;

  const toggleCell = (feature: string, action: PermAction) => {
    if (!canEdit) return;
    setFlash(null);
    setGrants((prev) => {
      const fk = { ...(prev[feature] ?? {}) };
      if (fk[action]) delete fk[action];
      else fk[action] = defaultScopeFor(roleType);
      const next = { ...prev };
      if (Object.keys(fk).length) next[feature] = fk;
      else delete next[feature];
      return next;
    });
  };

  const setCellScope = (feature: string, action: PermAction, scope: Scope) => {
    if (!canEdit) return;
    setFlash(null);
    setGrants((prev) => ({
      ...prev,
      [feature]: { ...(prev[feature] ?? {}), [action]: scope },
    }));
  };

  const handleSave = () => {
    if (!canEdit || !dirty) return;
    const payload: MatrixGrant[] = [];
    for (const [feature, actions] of Object.entries(grants)) {
      for (const [action, scope] of Object.entries(actions)) {
        if (scope)
          payload.push({
            feature_key: feature,
            action: action as PermAction,
            scope,
          });
      }
    }
    const targets = subtypes.length ? subtypes : [""];
    setFlash(null);
    startSave(async () => {
      const results = await Promise.all(
        targets.map((st) => saveMatrix(roleId, st, payload)),
      );
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setFlash({ kind: "error", msg: failed.error ?? "Could not save." });
      } else {
        setBaseline(structuredClone(grants));
        setFlash({
          kind: "ok",
          msg:
            targets.length > 1
              ? `Permissions saved to ${targets.length} ${
                  roleType === "department" ? "departments" : "positions"
                }`
              : "Permissions saved",
        });
      }
    });
  };

  return (
    <Shell>
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <Picker
              icon={<CircleUser className="w-4 h-4 text-slate-500 dark:text-slate-400" />}
              label="Role"
              value={String(roleId)}
              onChange={(v) => setRoleId(Number(v))}
              options={roles.map((r) => ({
                value: String(r.role_id),
                label: prettyRole(r.role_type),
              }))}
            />
            {subtypeOptions && (
              <MultiPicker
                icon={<Tags className="w-4 h-4 text-indigo-500" />}
                label={roleType === "staff" ? "Position" : "Department"}
                selected={subtypes}
                onChange={setSubtypes}
                options={subtypeOptions}
                primary={primary}
              />
            )}
            {subtypeOptions && subtypes.length > 1 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                <Tags className="w-3.5 h-3.5" />
                Editing {subtypeOptions.find((o) => o.value === primary)?.label ?? "base"};
                Save applies to all {subtypes.length} selected
              </span>
            )}
            {roleType === "regional manager" && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Same rules for regions A / B / C
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {flash && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  flash.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {flash.kind === "ok" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {flash.msg}
              </span>
            )}
            {dirty && !flash && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
            {loading && (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            )}
            {canEdit && !isImplicit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-all duration-200"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save permissions
              </button>
            )}
          </div>
        </div>

        {isImplicit ? (
          <ImplicitBanner roleType={roleType} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <th className="text-left px-6 py-3 font-semibold sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 min-w-[240px]">
                    Module / Feature
                  </th>
                  {ACTIONS.map((a) => (
                    <th
                      key={a}
                      className="px-3 py-3 font-semibold text-center min-w-[104px]"
                    >
                      {ACTION_LABEL[a]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GROUP_ORDER.map((group) => {
                  const feats = FEATURES.filter((f) => f.group === group);
                  if (!feats.length) return null;
                  return (
                    <FeatureGroup
                      key={group}
                      group={group}
                      features={feats}
                      cellScope={cellScope}
                      canEdit={canEdit}
                      onToggle={toggleCell}
                      onScope={setCellScope}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Legend />
      </section>
    </Shell>
  );
}

// ──────────────────────────────────────────────────────────

function subtypeOptionsFor(
  roleType: string,
  departments: Department[],
  positions: string[],
): { value: string; label: string }[] | null {
  if (roleType === "superadmin" || roleType === "ceo") return null;
  if (roleType === "department") {
    return departments.map((d) => ({
      value: d.department_code,
      label: `${d.department_name} (${d.department_code})`,
    }));
  }
  if (roleType === "staff") {
    return [
      { value: "", label: "Base — all positions" },
      ...positions.map((p) => ({ value: p, label: p })),
    ];
  }
  return null; // single implicit subtype ""
}

function FeatureGroup({
  group,
  features,
  cellScope,
  canEdit,
  onToggle,
  onScope,
}: {
  group: string;
  features: typeof FEATURES;
  cellScope: (f: string, a: PermAction) => Scope | null;
  canEdit: boolean;
  onToggle: (f: string, a: PermAction) => void;
  onScope: (f: string, a: PermAction, s: Scope) => void;
}) {
  return (
    <>
      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
        <td
          colSpan={1 + ACTIONS.length}
          className="px-6 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-800"
        >
          {group}
        </td>
      </tr>
      {features.map((f) => (
        <tr
          key={f.key}
          className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors duration-150"
        >
          <td className="px-6 py-2.5 sticky left-0 bg-inherit z-10">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{f.label}</span>
          </td>
          {ACTIONS.map((a) => (
            <td key={a} className="px-3 py-2.5 text-center">
              <Cell
                applies={featureApplies(f.key, a)}
                locked={isCeilingLocked(f.key, a)}
                scope={cellScope(f.key, a)}
                canEdit={canEdit}
                onToggle={() => onToggle(f.key, a)}
                onScope={(s) => onScope(f.key, a, s)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({
  applies,
  locked,
  scope,
  canEdit,
  onToggle,
  onScope,
}: {
  applies: boolean;
  locked: boolean;
  scope: Scope | null;
  canEdit: boolean;
  onToggle: () => void;
  onScope: (s: Scope) => void;
}) {
  if (!applies)
    return (
      <span className="inline-block w-6 text-center text-slate-300 dark:text-slate-600 select-none">
        —
      </span>
    );
  if (locked)
    return (
      <span title="Superadmin only" className="inline-flex justify-center">
        <Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" />
      </span>
    );

  const allowed = scope !== null;
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canEdit}
        aria-pressed={allowed}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors duration-150 ${
          allowed
            ? "bg-emerald-500 text-white shadow-sm"
            : "border border-slate-300 bg-white hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-slate-500"
        } ${canEdit ? "cursor-pointer" : "cursor-default opacity-90"}`}
      >
        {allowed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      </button>
      {allowed && (
        <select
          value={scope}
          disabled={!canEdit}
          onChange={(e) => onScope(e.target.value as Scope)}
          className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-transparent border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-400 disabled:opacity-70"
        >
          {SCOPES.map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABEL[s]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ImplicitBanner({ roleType }: { roleType: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        <ShieldCheck className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {roleType === "superadmin"
          ? "Superadmin has full access to everything."
          : "CEO can view everything (read-only)."}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        This is fixed in code and can&apos;t be edited here.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500 text-white">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
        Allowed (pick a scope)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-5 h-5 rounded-md border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900" />
        Not allowed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-6 text-center text-slate-400 font-semibold">—</span>
        Not applicable
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Lock className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        Superadmin only
      </span>
      <span className="text-slate-400">
        Scope: Global · Region · Branch · Team · Own
      </span>
    </div>
  );
}

function Picker({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center h-10 rounded-xl border border-slate-200 bg-white px-3 gap-2 text-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 dark:border-slate-500 dark:bg-slate-950 dark:focus-within:ring-indigo-900/40 transition-all duration-200">
      {icon}
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none pr-1"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Checkbox multi-select for sub-types — tick several to bulk-apply the matrix. */
function MultiPicker({
  icon,
  label,
  options,
  selected,
  onChange,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  primary: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const summary =
    selected.length === 0
      ? "None selected"
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center h-10 rounded-xl border bg-white dark:bg-slate-950 px-3 gap-2 text-sm transition-all duration-200 ${
          open ? "border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-900/40" : "border-slate-200 hover:border-slate-300 dark:border-slate-500 dark:hover:border-slate-400"
        }`}
      >
        {icon}
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-800 dark:text-slate-100 max-w-[160px] truncate">{summary}</span>
        <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 dark:ring-1 dark:ring-white/10 shadow-lg py-1.5">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Tick to apply together
          </p>
          <div className="max-h-72 overflow-y-auto">
            {options.map((o) => {
              const checked = selected.includes(o.value);
              const isPrimary = checked && o.value === primary;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span
                    className={`w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 ${
                      checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300 dark:border-slate-600"
                    }`}
                  >
                    {checked && (
                      <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden="true" />
                    )}
                  </span>
                  <span className={`flex-1 ${checked ? "text-slate-900 dark:text-slate-100 font-medium" : "text-slate-700 dark:text-slate-300"}`}>
                    {o.label}
                  </span>
                  {isPrimary && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 shrink-0">
                      editing
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-16 space-y-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-all duration-200"
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Access Management</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">Access Management</h1>
          <AccessTabs />
        </div>

        {children}
      </div>
    </div>
  );
}
