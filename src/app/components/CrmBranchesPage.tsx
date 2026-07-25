"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home, ChevronRight, Search, Plus, Pencil, X, Building2,
} from "lucide-react";

type Region = "A" | "B" | "C";

interface BranchRow {
  id: string;          // crm_branch.id (uuid); "" for the local "add" draft
  name: string;
  code: string;
  region: Region | "";
  address: string;
  phone: string;
  email: string;       // branch email or the branch manager's email
}

const REGION_BADGE: Record<string, string> = {
  A: "bg-rose-100 text-rose-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-emerald-100 text-emerald-700",
};

// ─── Main ──────────────────────────────────────────────────────────────────────

interface ApiBranch { id: string; name: string; code: string | null; region: string | null; address: string | null; phone: string | null; email: string | null }

export default function CrmBranchesPage() {
  const [rows, setRows]               = useState<BranchRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [regionFilter, setRegionFilter] = useState<"" | Region>("");
  const [editTarget, setEditTarget]   = useState<BranchRow | null>(null);
  const [showAdd, setShowAdd]         = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetch("/api/crm/branches", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<{ branches: ApiBranch[] }>;
      })
      .then((d) => {
        if (ignore) return;
        setRows(d.branches.map((b) => ({
          id: b.id,
          name: b.name,
          code: b.code ?? "",
          region: b.region === "A" || b.region === "B" || b.region === "C" ? b.region : "",
          address: b.address ?? "",
          phone: b.phone ?? "",
          email: b.email ?? "",
        })));
        setError(null);
      })
      .catch((e) => { if (!ignore) setError(e instanceof Error ? e.message : "Failed to load branches"); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    const matchRegion = !regionFilter || r.region === regionFilter;
    return matchSearch && matchRegion;
  });

  // Read-only view: Add/Edit stay in local state only (never written back to the CRM).
  function handleSave(b: BranchRow) {
    if (b.id === "") {
      setRows(prev => [...prev, { ...b, id: `local-${prev.length + 1}` }].sort((a, c) => a.name.localeCompare(c.name)));
    } else {
      setRows(prev => prev.map(r => r.id === b.id ? b : r));
    }
    setEditTarget(null);
    setShowAdd(false);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 transition-colors rounded">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Branches</span>
        </nav>

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Branches</h1>
            <p className="text-sm text-slate-500 mt-0.5">{loading ? "Loading…" : `${rows.length} branches total`}</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Branch
          </button>
        </div>

        {/* Filter toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-60 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or code…"
                className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {(["", "A", "B", "C"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRegionFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    regionFilter === r
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {r === "" ? "All Regions" : `Region ${r}`}
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs text-slate-400">
              {filtered.length} of {rows.length} branches
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {["Name", "Code", "Region", "Address", "Phone", "Email", "Actions"].map(h => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                      h === "Actions" ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <div className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                    <p className="text-sm text-slate-400">Loading branches…</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <p className="text-sm text-red-500">Couldn&apos;t load branches: {error}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <Building2 className="mx-auto mb-2 w-8 h-8 text-slate-300" />
                    <p className="text-sm text-slate-400">No branches match this filter.</p>
                  </td>
                </tr>
              ) : (
                filtered.map(b => (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{b.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {b.code || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {b.region ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${REGION_BADGE[b.region]}`}>
                          {b.region}
                        </span>
                      ) : (
                        <span className="italic text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[180px] truncate">
                      {b.address || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {b.phone || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {b.email || <span className="italic text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditTarget(b)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      {(showAdd || editTarget !== null) && (
        <BranchModal
          branch={editTarget ?? { id: "", name: "", code: "", region: "", address: "", phone: "", email: "" }}
          onClose={() => { setShowAdd(false); setEditTarget(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ─── Add / Edit modal ──────────────────────────────────────────────────────────

function BranchModal({
  branch,
  onClose,
  onSave,
}: {
  branch: BranchRow;
  onClose: () => void;
  onSave: (b: BranchRow) => void;
}) {
  const isCreate = branch.id === "";
  const [name,    setName]    = useState(branch.name);
  const [code,    setCode]    = useState(branch.code);
  const [region,  setRegion]  = useState<Region | "">(branch.region);
  const [address, setAddress] = useState(branch.address);
  const [phone,   setPhone]   = useState(branch.phone);
  const [email,   setEmail]   = useState(branch.email);

  const FLD = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors bg-white";
  const LBL = "block text-xs font-medium uppercase tracking-wider text-slate-500";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: branch.id,
      name: name.trim(),
      code: code.trim(),
      region,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isCreate ? "Add Branch" : "Edit Branch"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isCreate
                ? "Auto-creates the kanban pipeline + ticket-module branch row."
                : `Editing ${branch.name}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4 max-h-[60vh] overflow-y-auto">
          <label className="block">
            <span className={LBL}>Name *</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 24 Ebright (NewPlace)"
              className={FLD}
              required
            />
            <span className="mt-1 block text-[10px] italic text-slate-400">
              Format: "NN Ebright (Place)" — leading two digits become the ticket-module branch_number.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LBL}>Code</span>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="AMP"
                maxLength={10}
                className={FLD}
              />
            </label>
            <label className="block">
              <span className={LBL}>Region</span>
              <select
                value={region}
                onChange={e => setRegion(e.target.value as Region | "")}
                className={FLD}
              >
                <option value="">— None —</option>
                <option value="A">Region A</option>
                <option value="B">Region B</option>
                <option value="C">Region C</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className={LBL}>Address</span>
            <input value={address} onChange={e => setAddress(e.target.value)} className={FLD} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LBL}>Phone</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className={FLD} />
            </label>
            <label className="block">
              <span className={LBL}>Email</span>
              <input
                value={email}
                readOnly
                disabled
                type="email"
                placeholder="—"
                className={FLD + " cursor-not-allowed bg-slate-50 text-slate-500"}
              />
            </label>
          </div>
          <p className="text-[10px] italic text-slate-400 leading-relaxed">
            Branch email is derived from the branch&apos;s account (role_id = 4), linked via that
            account&apos;s <span className="font-medium">Assigned Branch</span> in its profile. It isn&apos;t
            stored on the branch and can&apos;t be edited here.
          </p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isCreate ? "Create Branch" : "Save Changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
