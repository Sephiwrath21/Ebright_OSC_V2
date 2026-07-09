"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home, ChevronRight, Search, Plus, Pencil, X, Building2,
} from "lucide-react";

type Region = "A" | "B" | "C";

interface BranchRow {
  id: number;
  name: string;
  code: string;
  region: Region | "";
  address: string;
  phone: string;
  email: string;
}

const INITIAL_BRANCHES: BranchRow[] = [
  { id: 1,  name: "00 Ebright (OD)",             code: "OD",  region: "A", address: "OD HQ, Kuala Lumpur",             phone: "0123456789", email: "od@ebright.my" },
  { id: 2,  name: "01 Online",                    code: "ONL", region: "",  address: "",                                phone: "",           email: "" },
  { id: 3,  name: "02 Subang Taipan",             code: "ST",  region: "A", address: "USJ 10, Subang Jaya, Selangor",   phone: "0112345001", email: "taipan@ebright.my" },
  { id: 4,  name: "03 Setia Alam",                code: "SA",  region: "B", address: "Setia Alam, Shah Alam, Selangor", phone: "0112345002", email: "setiaalam@ebright.my" },
  { id: 5,  name: "04 Sri Petaling",              code: "SRP", region: "A", address: "Sri Petaling, Kuala Lumpur",      phone: "0112345003", email: "sripetaling@ebright.my" },
  { id: 6,  name: "05 Kota Damansara",            code: "KD",  region: "B", address: "Kota Damansara, Petaling Jaya",  phone: "0112345004", email: "kotadamansara@ebright.my" },
  { id: 7,  name: "06 Putrajaya",                 code: "PTJ", region: "C", address: "Presint 8, Putrajaya",            phone: "0112345005", email: "putrajaya@ebright.my" },
  { id: 8,  name: "07 Ampang",                    code: "AMP", region: "A", address: "Ampang, Selangor",                phone: "0112345006", email: "ampang@ebright.my" },
  { id: 9,  name: "08 Cyberjaya",                 code: "CYB", region: "C", address: "Cyberjaya, Selangor",             phone: "0112345007", email: "cyberjaya@ebright.my" },
  { id: 10, name: "09 Klang",                     code: "KLG", region: "B", address: "Klang, Selangor",                 phone: "0112345008", email: "klang@ebright.my" },
  { id: 11, name: "10 Denai Alam",                code: "DA",  region: "B", address: "Denai Alam, Shah Alam",           phone: "0112345009", email: "denaialam@ebright.my" },
  { id: 12, name: "11 Bandar Baru Bangi",         code: "BBB", region: "C", address: "Bandar Baru Bangi, Kajang",       phone: "0112345010", email: "bangi@ebright.my" },
  { id: 13, name: "12 Danau Kota",                code: "DK",  region: "A", address: "Danau Kota, Setapak, KL",         phone: "0112345011", email: "danaukota@ebright.my" },
  { id: 14, name: "13 Shah Alam",                 code: "SLA", region: "B", address: "Shah Alam, Selangor",             phone: "0112345012", email: "shahalam@ebright.my" },
  { id: 15, name: "14 Bandar Tun Hussein Onn",    code: "BTH", region: "A", address: "Cheras, Kuala Lumpur",            phone: "0112345013", email: "btho@ebright.my" },
  { id: 16, name: "15 Eco Grandeur",              code: "ECO", region: "B", address: "Eco Grandeur, Puncak Alam",       phone: "0112345014", email: "ecograndeur@ebright.my" },
  { id: 17, name: "16 Bandar Seri Putra",         code: "BSP", region: "C", address: "Bandar Seri Putra, Bangi",        phone: "0112345015", email: "bsp@ebright.my" },
  { id: 18, name: "17 Bandar Rimbayu",            code: "BRM", region: "A", address: "Bandar Rimbayu, Shah Alam",       phone: "0112345016", email: "rimbayu@ebright.my" },
  { id: 19, name: "18 Taman Sri Gombak",          code: "TSG", region: "B", address: "Sri Gombak, Selangor",            phone: "0112345017", email: "srigombak@ebright.my" },
  { id: 20, name: "19 Kota Warisan",              code: "KW",  region: "C", address: "Kota Warisan, Sepang",            phone: "0112345018", email: "kotawarisan@ebright.my" },
  { id: 21, name: "20 Kajang TTDI Grove",         code: "KJG", region: "A", address: "TTDI Grove, Kajang, Selangor",    phone: "0112345019", email: "kajang@ebright.my" },
  { id: 22, name: "21 Tropicana Sungai Buloh",    code: "TSB", region: "B", address: "Tropicana Sungai Buloh",          phone: "0112345020", email: "sungaibuloh@ebright.my" },
  { id: 23, name: "22 Puncak Jalil",              code: "PJL", region: "A", address: "Puncak Jalil, Kuala Lumpur",      phone: "0112345021", email: "puncakjalil@ebright.my" },
  { id: 24, name: "23 Dataran Puchong Utama",     code: "DPU", region: "B", address: "Puchong Utama, Selangor",         phone: "0112345022", email: "puchong@ebright.my" },
];

const REGION_BADGE: Record<string, string> = {
  A: "bg-rose-100 text-rose-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-emerald-100 text-emerald-700",
};

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function CrmBranchesPage() {
  const [rows, setRows]               = useState<BranchRow[]>(INITIAL_BRANCHES);
  const [search, setSearch]           = useState("");
  const [regionFilter, setRegionFilter] = useState<"" | Region>("");
  const [editTarget, setEditTarget]   = useState<BranchRow | null>(null);
  const [showAdd, setShowAdd]         = useState(false);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    const matchRegion = !regionFilter || r.region === regionFilter;
    return matchSearch && matchRegion;
  });

  function handleSave(b: BranchRow) {
    if (b.id === 0) {
      const newId = Math.max(...rows.map(r => r.id)) + 1;
      setRows(prev => [...prev, { ...b, id: newId }].sort((a, c) => a.name.localeCompare(c.name)));
    } else {
      setRows(prev => prev.map(r => r.id === b.id ? b : r));
    }
    setEditTarget(null);
    setShowAdd(false);
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10">

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
            <p className="text-sm text-slate-500 mt-0.5">{rows.length} branches total</p>
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
              {filtered.length === 0 ? (
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
          branch={editTarget ?? { id: 0, name: "", code: "", region: "", address: "", phone: "", email: "" }}
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
  const isCreate = branch.id === 0;
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
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={FLD} />
            </label>
          </div>
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
