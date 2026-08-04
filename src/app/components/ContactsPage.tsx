"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Search, Plus, Download, Columns, Trash2, UserPlus,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Users, Phone, Mail, X, Check,
} from "lucide-react";

// ─── Server data shapes (from /api/crm/contacts, read-only ebright_crm) ────────

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  stage: { name: string; shortCode: string | null; color: string } | null;
  leadSource: { id: string; name: string } | null;
  assignedUser: { id: string; name: string | null } | null;
  tags: Array<{ id: string; name: string; color: string }>;
}
interface ContactsResponse { data: ContactRow[]; total: number; page: number; pageSize: number }
interface ContactsMeta {
  stages: Array<{ name: string; shortCode: string | null }>;
  leadSources: Array<{ id: string; name: string }>;
  assignedUsers: Array<{ id: string; name: string | null }>;
}

// ─── Reference data (used only by the non-persisting New Contact modal) ────────

const LEAD_SOURCES = [
  { id: "fb",     name: "Facebook"        },
  { id: "ig",     name: "Instagram"       },
  { id: "tt",     name: "TikTok"          },
  { id: "wi",     name: "Walk-in"         },
  { id: "ref",    name: "Referral"        },
  { id: "wa",     name: "WhatsApp"        },
  { id: "online", name: "Online Inquiry"  },
];

const BMS = [
  { id: "bm1", name: "Farah Hani"      },
  { id: "bm2", name: "Amir Fadzillah"  },
  { id: "bm3", name: "Nur Liyana"      },
  { id: "bm4", name: "Haziq Rahman"    },
  { id: "bm5", name: "Siti Aishah"     },
];

const TAGS = [
  { id: "t1", name: "Hot Lead",   color: "#EF4444" },
  { id: "t2", name: "Follow Up",  color: "#3B82F6" },
  { id: "t3", name: "Pending",    color: "#F59E0B" },
  { id: "t4", name: "Callback",   color: "#8B5CF6" },
  { id: "t5", name: "Cold",       color: "#94A3B8" },
  { id: "t6", name: "Interested", color: "#10B981" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initials(firstName: string, lastName: string | null): string {
  const parts = [firstName, lastName ?? ""].join(" ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

// Soft gradient pill styles per canonical colour (full literal strings so
// Tailwind keeps them — no dynamic interpolation).
const BADGE_STYLE: Record<string, string> = {
  blue:    "bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200/70",
  violet:  "bg-gradient-to-br from-violet-50 to-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200/70",
  purple:  "bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 ring-1 ring-inset ring-purple-200/70",
  amber:   "bg-gradient-to-br from-amber-50 to-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200/70",
  yellow:  "bg-gradient-to-br from-yellow-50 to-yellow-100 text-yellow-700 ring-1 ring-inset ring-yellow-200/70",
  orange:  "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200/70",
  emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200/70",
  green:   "bg-gradient-to-br from-green-50 to-green-100 text-green-700 ring-1 ring-inset ring-green-200/70",
  cyan:    "bg-gradient-to-br from-cyan-50 to-cyan-100 text-cyan-700 ring-1 ring-inset ring-cyan-200/70",
  sky:     "bg-gradient-to-br from-sky-50 to-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200/70",
  indigo:  "bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200/70",
  rose:    "bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200/70",
  red:     "bg-gradient-to-br from-red-50 to-red-100 text-red-700 ring-1 ring-inset ring-red-200/70",
  slate:   "bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/70",
};

// Stage → colour keyed by shortCode (branch-independent) so every "New Lead" is
// blue, "Confirmed for Trial" purple, etc., regardless of the per-branch DB colour.
const STAGE_COLOR_BY_CODE: Record<string, string> = {
  NL: "blue", CT: "violet", SU: "amber", ENR: "emerald",
  SNE: "yellow", CNS: "orange", CL: "slate", DND: "red", RSD: "cyan",
  FU1: "sky", FU2: "sky", FU3: "sky", FU3M: "sky",
  URW1: "rose", URW2: "rose", URW3: "rose",
  SG: "indigo", BOD: "indigo", ENRB: "cyan", CTB: "cyan",
};

function stageBadgeClass(shortCode: string | null, dbColor?: string): string {
  const code = (shortCode ?? "").toUpperCase().replace(/[-_]/g, "");
  const canonical = STAGE_COLOR_BY_CODE[code] ?? dbColor ?? "slate";
  return BADGE_STYLE[canonical] ?? BADGE_STYLE.slate;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Column definitions ───────────────────────────────────────────────────────

type SortKey = "name" | "createdAt";

const ALL_COLS = [
  { id: "phone",        label: "Phone"       },
  { id: "email",        label: "Email"       },
  { id: "stage",        label: "Stage"       },
  { id: "leadSource",   label: "Lead Source" },
  { id: "assignedBM",   label: "Assigned BM" },
  { id: "tags",         label: "Tags"        },
] as const;

type ColId = typeof ALL_COLS[number]["id"];

// ─── New Contact Modal ────────────────────────────────────────────────────────

const TRIAL_DAYS = ["WED", "THU", "FRI", "SAT", "SUN"] as const;

function NewContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"basic" | "child" | "prefs" | "tags">("basic");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    leadSourceId: "", bmId: "",
    child1Name: "", child1Age: "", child2Name: "", child2Age: "",
    child3Name: "", child3Age: "", child4Name: "", child4Age: "",
    preferredBranchId: "", trialDay: "", enrolledPackage: "",
  });

  const patch = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (!open) return null;

  const TABS = [
    { id: "basic", label: "Basic Info"  },
    { id: "child", label: "Child Info"  },
    { id: "prefs", label: "Preferences" },
    { id: "tags",  label: "Tags"        },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Contact</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200 px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === "basic" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name *">
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => patch("firstName", e.target.value)}
                    placeholder="First name"
                    className={input}
                  />
                </Field>
                <Field label="Last Name">
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => patch("lastName", e.target.value)}
                    placeholder="Last name"
                    className={input}
                  />
                </Field>
              </div>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => patch("email", e.target.value)}
                  placeholder="email@example.com"
                  className={input}
                />
              </Field>
              <Field label="Phone">
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
                    +60
                  </span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => patch("phone", e.target.value)}
                    placeholder="11 2345 6789"
                    className={`${input} rounded-l-none`}
                  />
                </div>
              </Field>
              <Field label="Lead Source">
                <select
                  value={form.leadSourceId}
                  onChange={(e) => patch("leadSourceId", e.target.value)}
                  className={input}
                >
                  <option value="">Select source…</option>
                  {LEAD_SOURCES.map((ls) => (
                    <option key={ls.id} value={ls.id}>{ls.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Assigned To">
                <select
                  value={form.bmId}
                  onChange={(e) => patch("bmId", e.target.value)}
                  className={input}
                >
                  <option value="">Unassigned</option>
                  {BMS.map((bm) => (
                    <option key={bm.id} value={bm.id}>{bm.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {tab === "child" && (
            <div className="space-y-4">
              {([1, 2, 3, 4] as const).map((n) => (
                <div key={n} className="grid grid-cols-[1fr_100px] gap-3">
                  <Field label={`Child ${n} Name`}>
                    <input
                      type="text"
                      value={form[`child${n}Name` as keyof typeof form]}
                      onChange={(e) => patch(`child${n}Name` as keyof typeof form, e.target.value)}
                      placeholder={`Child ${n} name`}
                      className={input}
                    />
                  </Field>
                  <Field label="Age">
                    <input
                      type="text"
                      value={form[`child${n}Age` as keyof typeof form]}
                      onChange={(e) => patch(`child${n}Age` as keyof typeof form, e.target.value)}
                      placeholder="e.g. 5"
                      className={input}
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}

          {tab === "prefs" && (
            <div className="space-y-4">
              <Field label="Preferred Trial Day">
                <select
                  value={form.trialDay}
                  onChange={(e) => patch("trialDay", e.target.value)}
                  className={input}
                >
                  <option value="">No preference</option>
                  {TRIAL_DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
              <Field label="Enrolled Package">
                <input
                  type="text"
                  value={form.enrolledPackage}
                  onChange={(e) => patch("enrolledPackage", e.target.value)}
                  placeholder="e.g. Starter, Premium…"
                  className={input}
                />
              </Field>
            </div>
          )}

          {tab === "tags" && (
            <div>
              <p className="mb-3 text-xs text-slate-500">
                Click tags to add or remove.
              </p>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => {
                  const active = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setSelectedTagIds((ids) =>
                          ids.includes(tag.id)
                            ? ids.filter((id) => id !== tag.id)
                            : [...ids, tag.id]
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all border"
                      style={
                        active
                          ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                          : { backgroundColor: "#f8fafc", borderColor: "#e2e8f0", color: "#64748b" }
                      }
                    >
                      {active && <Check className="h-3 w-3" />}
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Create Contact
          </button>
        </div>
      </div>
    </div>
  );
}

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

// ─── Column visibility dropdown ───────────────────────────────────────────────

function ColsDropdown({
  visible,
  onChange,
}: {
  visible: Set<ColId>;
  onChange: (id: ColId, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
  }, []);

  return (
    <div ref={ref} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Columns className="h-4 w-4" />
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Toggle columns
          </p>
          {ALL_COLS.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={visible.has(c.id)}
                onChange={(e) => onChange(c.id, e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-400 accent-blue-600"
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export default function ContactsPage() {
  const [search, setSearch]               = useState("");
  const [stageFilter, setStageFilter]     = useState("");
  const [sourceFilter, setSourceFilter]   = useState("");
  const [bmFilter, setBmFilter]           = useState("");
  const [page, setPage]                   = useState(1);
  const [pageSize, setPageSize]           = useState<10 | 25 | 50>(25);
  const [sortKey, setSortKey]             = useState<SortKey>("createdAt");
  const [sortDesc, setSortDesc]           = useState(true);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols]     = useState<Set<ColId>>(
    new Set(ALL_COLS.map((c) => c.id)),
  );
  const [modalOpen, setModalOpen]         = useState(false);
  const [assignBM, setAssignBM]           = useState("");
  const [showAssign, setShowAssign]       = useState(false);
  const [showDelete, setShowDelete]       = useState(false);

  // Server data (read-only, from ebright_crm via /api/crm/contacts).
  const [paginated, setPaginated] = useState<ContactRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // Filter reference data for the dropdowns.
  const [meta, setMeta] = useState<ContactsMeta>({ stages: [], leadSources: [], assignedUsers: [] });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val.trim());
      setPage(1);
    }, 300);
  };

  // Load filter reference data once.
  useEffect(() => {
    let ignore = false;
    fetch("/api/crm/contacts/meta", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: ContactsMeta | null) => { if (!ignore && m) setMeta(m); })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  // Fetch the current page whenever a query input changes (server-side filter,
  // sort and pagination — matches v1's getContactsByTenant).
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy: sortKey,
        sortDir: sortDesc ? "desc" : "asc",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (stageFilter) params.set("stageName", stageFilter);
      if (sourceFilter) params.set("leadSourceId", sourceFilter);
      if (bmFilter) params.set("assignedUserId", bmFilter);
      const res = await fetch(`/api/crm/contacts?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as ContactsResponse;
      setPaginated(data.data);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts");
      setPaginated([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortKey, sortDesc, debouncedSearch, stageFilter, sourceFilter, bmFilter]);

  useEffect(() => { void load(); }, [load]);

  const totalPages   = Math.max(1, Math.ceil(total / pageSize));
  const safeP        = Math.min(page, totalPages);
  const allSelected  = paginated.length > 0 && paginated.every((c) => selected.has(c.id));
  const someSelected = paginated.some((c) => selected.has(c.id));
  const selectedIds  = [...selected];

  const toggleAll = () => {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); paginated.forEach((c) => n.delete(c.id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); paginated.forEach((c) => n.add(c.id)); return n; });
    }
  };
  const toggleOne = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
    setPage(1);
  };

  const toggleCol = (id: ColId, checked: boolean) => {
    setVisibleCols((v) => { const n = new Set(v); checked ? n.add(id) : n.delete(id); return n; });
  };

  // Export the CURRENT page (server-side pagination — never pulls the full set).
  const exportCsv = () => {
    const headers = ["Name", "Email", "Phone", "Stage", "Lead Source", "Assigned BM", "Tags", "Created"];
    const csvRows = paginated.map((c) => [
      `"${`${c.firstName} ${c.lastName ?? ""}`.trim()}"`,
      c.email ?? "",
      c.phone ?? "",
      c.stage?.name ?? "",
      c.leadSource?.name ?? "",
      c.assignedUser?.name ?? "",
      `"${c.tags.map((t) => t.name).join("; ")}"`,
      formatDate(c.createdAt),
    ].join(","));
    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (
      sortDesc
        ? <ChevronDown className="h-3.5 w-3.5 text-blue-600 ml-1" />
        : <ChevronUp   className="h-3.5 w-3.5 text-blue-600 ml-1" />
    ) : (
      <span className="ml-1 flex flex-col">
        <ChevronUp   className="h-2.5 w-2.5 text-slate-300 -mb-0.5" />
        <ChevronDown className="h-2.5 w-2.5 text-slate-300" />
      </span>
    );

  const filterLabel = `${input} h-9`;

  return (
    <>
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">

          {/* ── Page heading ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contacts</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {loading ? "Loading…" : `${total.toLocaleString()} contact${total !== 1 ? "s" : ""}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              New Contact
            </button>
          </div>

          {/* ── Toolbar ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-52 shrink-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search contacts…"
                className="h-9 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Stage filter */}
            <select
              value={stageFilter}
              onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
              className={filterLabel}
            >
              <option value="">All stages</option>
              {meta.stages.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>

            {/* Lead source filter */}
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className={filterLabel}
            >
              <option value="">All sources</option>
              {meta.leadSources.map((ls) => (
                <option key={ls.id} value={ls.id}>{ls.name}</option>
              ))}
            </select>

            {/* Assigned BM filter */}
            <select
              value={bmFilter}
              onChange={(e) => { setBmFilter(e.target.value); setPage(1); }}
              className={filterLabel}
            >
              <option value="">All users</option>
              {meta.assignedUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? "—"}</option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-2">
              <ColsDropdown visible={visibleCols} onChange={toggleCol} />
              <button
                type="button"
                onClick={exportCsv}
                disabled={paginated.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>

          {/* ── Bulk action bar ─────────────────────────────────────────────── */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
              <span className="text-sm font-medium text-blue-700">
                {selectedIds.length} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssign(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  Assign to…
                </button>
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* ── Error banner ────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t load contacts: {error}
              <button
                type="button"
                onClick={() => void load()}
                className="ml-3 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Table ──────────────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {/* Checkbox */}
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-slate-400 accent-blue-600"
                      />
                    </th>
                    {/* Contact name */}
                    <th className="px-4 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("name")}
                        className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                      >
                        Contact name
                        <SortIcon col="name" />
                      </button>
                    </th>
                    {visibleCols.has("phone") && (
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Phone
                      </th>
                    )}
                    {visibleCols.has("email") && (
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Email
                      </th>
                    )}
                    {visibleCols.has("stage") && (
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Stage
                      </th>
                    )}
                    {visibleCols.has("leadSource") && (
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Lead Source
                      </th>
                    )}
                    {visibleCols.has("assignedBM") && (
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Assigned BM
                      </th>
                    )}
                    {visibleCols.has("tags") && (
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Tags
                      </th>
                    )}
                    {/* Created — always shown, sortable */}
                    <th className="px-4 py-3 text-left">
                      <button
                        type="button"
                        onClick={() => toggleSort("createdAt")}
                        className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                      >
                        Created
                        <SortIcon col="createdAt" />
                      </button>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={20} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                          <p className="text-xs text-slate-500">Loading contacts…</p>
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                            <Users className="h-7 w-7 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">No contacts found</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Try adjusting your search or filters.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((c) => {
                      const stage  = c.stage;
                      const source = c.leadSource;
                      const bm     = c.assignedUser;
                      const tags   = c.tags;
                      const fullName = `${c.firstName} ${c.lastName ?? ""}`.trim();
                      const isSelected = selected.has(c.id);

                      return (
                        <tr
                          key={c.id}
                          className={[
                            "transition-colors hover:bg-slate-50",
                            isSelected && "bg-blue-50",
                          ].filter(Boolean).join(" ")}
                        >
                          {/* Checkbox */}
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(c.id)}
                              className="h-3.5 w-3.5 rounded border-slate-400 accent-blue-600"
                            />
                          </td>

                          {/* Name + avatar */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarColor(c.id)}`}
                              >
                                {initials(c.firstName, c.lastName)}
                              </span>
                              <Link
                                href={`/crm/contacts/${c.id}`}
                                className="truncate font-semibold text-blue-700 hover:underline"
                              >
                                {fullName}
                              </Link>
                            </div>
                          </td>

                          {/* Phone */}
                          {visibleCols.has("phone") && (
                            <td className="px-4 py-3">
                              {c.phone ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                  <Phone className="h-3 w-3 text-slate-400" />
                                  <span className="font-mono">{c.phone}</span>
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          )}

                          {/* Email */}
                          {visibleCols.has("email") && (
                            <td className="px-4 py-3">
                              {c.email ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                  <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                                  <span className="max-w-44 truncate">{c.email}</span>
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          )}

                          {/* Stage */}
                          {visibleCols.has("stage") && (
                            <td className="px-4 py-3">
                              {stage ? (
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${stageBadgeClass(stage.shortCode, stage.color)}`}
                                >
                                  {stage.name}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          )}

                          {/* Lead source */}
                          {visibleCols.has("leadSource") && (
                            <td className="px-4 py-3">
                              <span className="text-xs text-slate-500">{source?.name ?? "—"}</span>
                            </td>
                          )}

                          {/* Assigned BM */}
                          {visibleCols.has("assignedBM") && (
                            <td className="px-4 py-3">
                              {bm && bm.name ? (
                                <div className="flex items-center gap-2">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                                    {bm.name.slice(0, 2).toUpperCase()}
                                  </span>
                                  <span className="truncate text-xs text-slate-700">{bm.name}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          )}

                          {/* Tags */}
                          {visibleCols.has("tags") && (
                            <td className="px-4 py-3">
                              {tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag.id}
                                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                                      style={{ backgroundColor: tag.color }}
                                    >
                                      {tag.name}
                                    </span>
                                  ))}
                                  {tags.length > 3 && (
                                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                      +{tags.length - 3}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          )}

                          {/* Created */}
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-500">{formatDate(c.createdAt)}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
                <p className="text-xs text-slate-500">
                  Showing{" "}
                  <span className="font-medium">{(safeP - 1) * pageSize + 1}</span>
                  {" "}to{" "}
                  <span className="font-medium">{Math.min(safeP * pageSize, total)}</span>
                  {" "}of{" "}
                  <span className="font-medium">{total.toLocaleString()}</span>{" "}contacts
                </p>

                <div className="flex items-center gap-2">
                  {/* Page size */}
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value) as 10 | 25 | 50); setPage(1); }}
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>

                  {/* Prev */}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safeP <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <span className="text-xs text-slate-600 tabular-nums">
                    {safeP} / {totalPages}
                  </span>

                  {/* Next */}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeP >= totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── New Contact modal ─────────────────────────────────────────────── */}
      <NewContactModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* ── Assign modal ──────────────────────────────────────────────────── */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowAssign(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Assign {selectedIds.length} contact{selectedIds.length !== 1 ? "s" : ""}
            </h2>
            <p className="mb-4 text-xs text-slate-500">Choose a user to assign these contacts to.</p>
            <select
              value={assignBM}
              onChange={(e) => setAssignBM(e.target.value)}
              className="mb-4 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a user…</option>
              {BMS.map((bm) => (
                <option key={bm.id} value={bm.id}>{bm.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAssign(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => { setSelected(new Set()); setShowAssign(false); }} disabled={!assignBM} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ───────────────────────────────────────────── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowDelete(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Delete {selectedIds.length} contact{selectedIds.length !== 1 ? "s" : ""}?
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              This will remove the selected contacts. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDelete(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => { setSelected(new Set()); setShowDelete(false); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
