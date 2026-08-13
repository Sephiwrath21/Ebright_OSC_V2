"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Home, ChevronRight, CheckCircle2 } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

interface Child {
  name: string;
  age: string;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const INPUT  = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ED1C24] focus:border-[#ED1C24] transition-colors dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100";
const LABEL  = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5";
const BTN_P  = "w-full h-12 rounded-xl bg-[#ED1C24] text-white text-sm font-semibold tracking-widest uppercase hover:bg-[#d41920] active:scale-[0.98] transition-all";
const BTN_S  = "w-full h-12 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium tracking-wide uppercase hover:bg-slate-200 active:scale-[0.98] transition-all dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";
const REQ    = <span className="text-red-500 dark:text-red-400 ml-0.5">*</span>;

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CrmFormsPage() {
  const [step,        setStep]        = useState(1);
  const [parentName,  setParentName]  = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [numChildren, setNumChildren] = useState(0);
  const [children,    setChildren]    = useState<Child[]>([]);
  const [branch,      setBranch]      = useState("");   // selected branch_id
  const [remarks,     setRemarks]     = useState("");
  const [branches,    setBranches]    = useState<Array<{ id: string; name: string }>>([]);

  // Load real branches for the dropdown (branch_id → name). Read-only.
  useEffect(() => {
    let ignore = false;
    fetch("/api/crm/branches", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { branches: Array<{ id: string; name: string }> } | null) => {
        if (!ignore && d?.branches) setBranches(d.branches.map((b) => ({ id: b.id, name: b.name })));
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  const progress = step >= 5 ? 100 : ((step - 1) / 4) * 100;

  function selectN(n: number) {
    setNumChildren(n);
    setChildren(Array.from({ length: n }, () => ({ name: "", age: "" })));
  }

  function updateChild(i: number, field: keyof Child, val: string) {
    setChildren(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  }

  function next() {
    if (step === 1 && (!parentName || !parentPhone || !parentEmail || !parentEmail.includes("@"))) return;
    if (step === 2 && numChildren === 0) return;
    if (step === 3 && children.some(c => !c.name || !c.age)) return;
    if (step === 4 && !branch) return;
    setStep(s => s + 1);
  }

  function reset() {
    setStep(1);
    setParentName(""); setParentPhone(""); setParentEmail("");
    setNumChildren(0); setChildren([]); setBranch(""); setRemarks("");
  }

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/crm" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors rounded">CNS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-700 dark:text-slate-300">Lead</span>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Forms</span>
        </nav>

        {/* Form card — max 520px, centered */}
        <div className="w-full max-w-[520px] mx-auto">

          {/* Card header with gradient + progress bar */}
          <div className="rounded-t-2xl px-6 pt-6 pb-5" style={{ background: "linear-gradient(135deg, #ED1C24 0%, #ff3d3d 100%)" }}>
            <h1 className="text-4xl font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.2)] leading-tight">
              Trial Class
            </h1>
            <p className="text-red-100 text-base mt-0.5">Registration</p>
            <div className="mt-4 h-[7px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-white/90 transition-[width] duration-500 ease-in-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Step body */}
          <div className="bg-white border border-t-0 border-slate-200 rounded-b-2xl px-6 py-6 space-y-4 shadow-sm dark:bg-slate-900 dark:border-slate-800">

            {/* ── Step 1 — Parent details ─────────────────────────────────── */}
            {step === 1 && (
              <>
                <div>
                  <label className={LABEL}>Parent&apos;s Name {REQ}</label>
                  <input
                    value={parentName}
                    onChange={e => setParentName(e.target.value)}
                    className={INPUT}
                    placeholder="Example: Jonathan Tan, Sara Yahya, Muthu"
                  />
                </div>
                <div>
                  <label className={LABEL}>Parent&apos;s Contact {REQ}</label>
                  <input
                    value={parentPhone}
                    onChange={e => setParentPhone(e.target.value)}
                    type="tel"
                    className={INPUT}
                    placeholder="0123456789"
                  />
                  <p className="text-xs text-slate-400 italic mt-2 leading-relaxed">
                    Reminders will be sent via WhatsApp. Please make sure your number has WhatsApp.
                  </p>
                </div>
                <div>
                  <label className={LABEL}>Parent&apos;s Email {REQ}</label>
                  <input
                    value={parentEmail}
                    onChange={e => setParentEmail(e.target.value)}
                    type="email"
                    className={INPUT}
                    placeholder="Example: Ebright@gmail.com"
                  />
                </div>
                <button onClick={next} className={BTN_P}>Next</button>
              </>
            )}

            {/* ── Step 2 — Number of children ────────────────────────────── */}
            {step === 2 && (
              <>
                <div>
                  <label className={LABEL}>How many children are joining? {REQ}</label>
                  <div className="grid grid-cols-4 gap-3 mt-2">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => selectN(n)}
                        className={`h-16 rounded-xl text-2xl font-bold border-2 transition-all duration-150 ${
                          numChildren === n
                            ? "text-white shadow-md scale-[1.02]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-700 dark:hover:bg-red-900"
                        }`}
                        style={numChildren === n ? { borderColor: "#ED1C24", backgroundColor: "#ED1C24" } : {}}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {numChildren > 0 && <button onClick={next} className={BTN_P}>Next</button>}
                <button onClick={() => setStep(1)} className={BTN_S}>Back</button>
              </>
            )}

            {/* ── Step 3 — Children details ───────────────────────────────── */}
            {step === 3 && (
              <>
                {children.map((child, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-4 dark:bg-slate-800 dark:border-slate-700">
                    <p className="text-sm font-semibold mb-3" style={{ color: "#ED1C24" }}>Child {i + 1}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL}>Child&apos;s Name {REQ}</label>
                        <input
                          value={child.name}
                          onChange={e => updateChild(i, "name", e.target.value)}
                          className={INPUT}
                          placeholder="Example: Adam Bin Nik"
                        />
                      </div>
                      <div>
                        <label className={LABEL}>Child&apos;s Age {REQ}</label>
                        <input
                          value={child.age}
                          onChange={e => updateChild(i, "age", e.target.value)}
                          type="number"
                          min={4}
                          max={18}
                          className={INPUT}
                          placeholder="Example: 8"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={next} className={BTN_P}>Next</button>
                <button onClick={() => setStep(2)} className={BTN_S}>Back</button>
              </>
            )}

            {/* ── Step 4 — Branch + remarks ───────────────────────────────── */}
            {step === 4 && (
              <>
                <div>
                  <label className={LABEL}>Preferred branch near you {REQ}</label>
                  <select
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    className={INPUT + " cursor-pointer appearance-none"}
                  >
                    <option value="">Please select</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>
                    Remarks{" "}
                    <span className="text-slate-400 font-normal">[If any]</span>
                  </label>
                  <textarea
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    rows={3}
                    className={INPUT + " resize-none"}
                    placeholder="Special needs (e.g. ADHD, autism)"
                  />
                </div>
                <button onClick={next} className={BTN_P}>Submit</button>
                <button onClick={() => setStep(3)} className={BTN_S}>Back</button>
              </>
            )}

            {/* ── Step 5 — Success ────────────────────────────────────────── */}
            {step === 5 && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="w-24 h-24 text-green-500 mb-4" strokeWidth={1.5} />
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Registration Successful!</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xs">
                  A new lead has been added to Opportunities → New Lead. We will contact the parent shortly via WhatsApp to confirm the trial class schedule.
                </p>
                <button onClick={reset} className={BTN_P + " mt-6 max-w-[200px]"}>
                  Submit Another
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
