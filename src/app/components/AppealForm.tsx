"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Home as HomeIcon,
  ChevronRight,
  Megaphone,
  AlertTriangle,
  FileText,
  TrendingUp,
  Eye,
  Download,
  X,
  CircleAlert,
} from "lucide-react";
import { jsPDF } from "jspdf";

interface AppealRequest {
  id: string;
  type: string;
  date: string;
  status: "Pending" | "Approved" | "Rejected";
  reason: string;
  letterContent?: string;
}

const APPEAL_TYPES = [
  {
    id: "warning-letter",
    name: "Warning Letter",
    description: "Appeal against a warning letter issued",
    Icon: AlertTriangle,
    accent: "amber" as const,
  },
  {
    id: "show-cause-letter",
    name: "Show Cause Letter",
    description: "Appeal against a show cause letter",
    Icon: FileText,
    accent: "indigo" as const,
  },
  {
    id: "pip",
    name: "PIP",
    description: "Appeal against Personal Improvement Plan",
    Icon: TrendingUp,
    accent: "rose" as const,
  },
] as const;

type AppealTypeId = (typeof APPEAL_TYPES)[number]["id"];

const ACCENT_STYLES: Record<
  (typeof APPEAL_TYPES)[number]["accent"],
  { tile: string; icon: string; ring: string; selectedBorder: string }
> = {
  amber: {
    tile: "bg-amber-50 dark:bg-amber-900",
    icon: "text-amber-600 dark:text-amber-300",
    ring: "ring-amber-400",
    selectedBorder: "border-amber-500",
  },
  indigo: {
    tile: "bg-indigo-50 dark:bg-indigo-900",
    icon: "text-indigo-600 dark:text-indigo-300",
    ring: "ring-indigo-400",
    selectedBorder: "border-indigo-500",
  },
  rose: {
    tile: "bg-rose-50 dark:bg-rose-900",
    icon: "text-rose-600 dark:text-rose-300",
    ring: "ring-rose-400",
    selectedBorder: "border-rose-500",
  },
};

const STATUS_STYLES: Record<AppealRequest["status"], string> = {
  Pending: "bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-900 dark:text-amber-300 dark:ring-amber-400/30",
  Approved: "bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900 dark:text-emerald-300 dark:ring-emerald-400/30",
  Rejected: "bg-rose-100 text-rose-700 ring-rose-600/20 dark:bg-rose-900 dark:text-rose-300 dark:ring-rose-400/30",
};

const INITIAL_FORM = {
  employeeName: "",
  employeeId: "",
  department: "",
  position: "",
  letterDate: "",
  offense: "",
  reason: "",
  responseDeadline: "",
  managerName: "",
  managerTitle: "",
  improvementGoals: "",
  reviewDate: "",
  supportProvided: "",
};

const SAMPLE_HISTORY: AppealRequest[] = [
  {
    id: "1",
    type: "Warning Letter",
    date: "15/03/2026",
    status: "Pending",
    reason: "I believe the warning was issued in error",
    letterContent: makeWarningLetter({
      ...INITIAL_FORM,
      letterDate: "15/03/2026",
      employeeName: "John Doe",
      employeeId: "EMP001",
      department: "IT",
      position: "Software Developer",
      offense: "Late attendance and poor time management",
      reason:
        "Multiple instances of arriving late to work without proper notification or justification.",
      managerName: "Mr. Ahmad",
      managerTitle: "HR Manager",
    }),
  },
  {
    id: "2",
    type: "Show Cause Letter",
    date: "10/03/2026",
    status: "Approved",
    reason: "Request for review and reconsideration",
    letterContent: makeShowCauseLetter({
      ...INITIAL_FORM,
      letterDate: "10/03/2026",
      employeeName: "Jane Smith",
      employeeId: "EMP002",
      department: "Finance",
      position: "Accountant",
      offense: "Financial discrepancy and mishandling of company funds",
      reason:
        "An audit revealed inconsistencies in expense claims submitted during the month of February 2026.",
      responseDeadline: "7",
      managerName: "Mr. Ahmad",
      managerTitle: "HR Manager",
    }),
  },
];

// ─── Letter templates ────────────────────────────────────────────────────────

function makeWarningLetter(f: typeof INITIAL_FORM): string {
  return `EBRIGHT HOLDINGS SDN BHD
Warning Letter

Date: ${f.letterDate}

To: ${f.employeeName}
Employee ID: ${f.employeeId}
Department: ${f.department}
Position: ${f.position}

RE: FORMAL WARNING LETTER

Dear ${f.employeeName},

This letter serves as a formal warning regarding your conduct/performance at Ebright Holdings SDN BHD.

REASON FOR WARNING:
${f.offense}

DETAILS OF THE INCIDENT:
${f.reason}

EXPECTED IMPROVEMENT:
You are expected to rectify this matter immediately and ensure compliance with company policies going forward.

CONSEQUENCES:
Further violations of company policy may result in disciplinary action, up to and including termination of employment.

This warning will remain on your employment record for [12 months] from the date of this letter.

If you wish to appeal this warning, please submit a written appeal within [7 days] of receiving this letter.

Yours faithfully,

${f.managerName}
${f.managerTitle}
Ebright Holdings SDN BHD`;
}

function makeShowCauseLetter(f: typeof INITIAL_FORM): string {
  return `EBRIGHT HOLDINGS SDN BHD
Show Cause Letter

Date: ${f.letterDate}

To: ${f.employeeName}
Employee ID: ${f.employeeId}
Department: ${f.department}
Position: ${f.position}

RE: SHOW CAUSE NOTICE

Dear ${f.employeeName},

You are hereby required to show cause why disciplinary action should not be taken against you for the following reason(s):

ALLEGED MISCONDUCT/OFFENSE:
${f.offense}

DETAILS:
${f.reason}

REQUIRED ACTION:
You are required to submit a written explanation/response to this letter within [${f.responseDeadline}] working days from the date of this letter.

Your response should include:
1. Your account of the incident
2. Any mitigating circumstances
3. Evidence or documents supporting your position
4. Any witnesses who can corroborate your account

SUBMISSION:
Please submit your response to ${f.managerName} at HR Department.

IMPORTANT:
Failure to respond within the stipulated time may result in disciplinary action being taken without your input.

Yours faithfully,

${f.managerName}
${f.managerTitle}
Ebright Holdings SDN BHD`;
}

function makePipLetter(f: typeof INITIAL_FORM): string {
  return `EBRIGHT HOLDINGS SDN BHD
Personal Improvement Plan (PIP)

Date: ${f.letterDate}

To: ${f.employeeName}
Employee ID: ${f.employeeId}
Department: ${f.department}
Position: ${f.position}

RE: PERSONAL IMPROVEMENT PLAN

Dear ${f.employeeName},

This Personal Improvement Plan (PIP) has been issued to address performance concerns and to provide you with a structured opportunity to meet the expectations required for your role at Ebright Holdings SDN BHD.

AREAS REQUIRING IMPROVEMENT:
${f.offense}

DETAILS / PERFORMANCE CONCERNS:
${f.reason}

IMPROVEMENT GOALS & TARGETS:
${f.improvementGoals}

SUPPORT PROVIDED BY MANAGEMENT:
${f.supportProvided}

REVIEW DATE:
Your progress will be formally reviewed on: ${f.reviewDate}

EXPECTATIONS:
You are expected to demonstrate consistent and measurable improvement in the areas identified above by the review date. Failure to meet the targets outlined in this plan may result in further disciplinary action, up to and including termination of employment.

Please acknowledge receipt of this PIP by signing a copy and returning it to your manager. Your signature indicates receipt, not necessarily agreement.

Yours faithfully,

${f.managerName}
${f.managerTitle}
Ebright Holdings SDN BHD`;
}

function buildLetterContent(type: AppealTypeId, f: typeof INITIAL_FORM): string {
  if (type === "warning-letter") return makeWarningLetter(f);
  if (type === "show-cause-letter") return makeShowCauseLetter(f);
  return makePipLetter(f);
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

function buildPdf(content: string, title: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const usableW = pageW - margin * 2;

  // Header bar
  doc.setFillColor(30, 41, 59); // slate-800 — matches v2 brand on PDFs
  doc.rect(0, 0, pageW, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("EBRIGHT HOLDINGS SDN BHD", margin, 12);
  doc.setFontSize(9);
  doc.text(title, pageW - margin, 12, { align: "right" });

  // Body
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  // The content already includes the company name; strip it so we don't print it twice.
  const bodyText = content.replace(/^EBRIGHT HOLDINGS SDN BHD\n/, "").trimStart();
  const lines = doc.splitTextToSize(bodyText, usableW);

  let y = 28;
  const lineH = 5.5;
  for (const line of lines) {
    if (y + lineH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    if (/^[A-Z\s/()&]+:$/.test(line.trim())) {
      doc.setFont("helvetica", "bold");
      doc.text(line, margin, y);
      doc.setFont("helvetica", "normal");
    } else {
      doc.text(line, margin, y);
    }
    y += lineH;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" })} — Ebright Holdings SDN BHD`,
    pageW / 2,
    pageH - 10,
    { align: "center" },
  );

  return doc;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AppealForm() {
  const [selectedType, setSelectedType] = useState<AppealTypeId | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [appeals, setAppeals] = useState<AppealRequest[]>(SAMPLE_HISTORY);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [viewingAppeal, setViewingAppeal] = useState<AppealRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadPdf = useCallback((content: string, filename: string) => {
    const title = filename.replace(/_/g, " ").replace(".pdf", "");
    const doc = buildPdf(content, title);
    doc.save(filename);
  }, []);

  const openPdfPreview = useCallback((content: string, title: string) => {
    const doc = buildPdf(content, title);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedType || !form.reason || !form.employeeName) {
      setError("Please fill in the required fields (employee name, reason).");
      return;
    }

    const typeObj = APPEAL_TYPES.find((t) => t.id === selectedType);
    const letterContent = buildLetterContent(selectedType, form);

    const newAppeal: AppealRequest = {
      id: String(appeals.length + 1),
      type: typeObj?.name ?? "",
      date: new Date().toLocaleDateString("en-GB"),
      status: "Pending",
      reason: form.reason,
      letterContent,
    };

    setAppeals([newAppeal, ...appeals]);
    setForm(INITIAL_FORM);
    setSelectedType(null);
    setPdfPreviewUrl(null);
  };

  const selectedTypeObj = selectedType ? APPEAL_TYPES.find((t) => t.id === selectedType) : null;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-12">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-6">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <HomeIcon className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/attendance" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">Attendance</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 dark:text-slate-100 font-medium">Appeal</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT: heading + type cards + history */}
          <div className="lg:col-span-2 space-y-6">
            {/* Page heading */}
            <header className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">File an Appeal</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Compose a warning letter, show-cause letter, or PIP, preview the PDF, and submit the appeal for HR review.</p>
            </header>

            {/* Appeal Categories */}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Appeal Categories
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {APPEAL_TYPES.map((t) => {
                  const accent = ACCENT_STYLES[t.accent];
                  const isSelected = selectedType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t.id)}
                      aria-pressed={isSelected}
                      className={`text-left bg-white dark:bg-slate-900 border-2 rounded-2xl p-5 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 focus-visible:${accent.ring} ${
                        isSelected
                          ? `${accent.selectedBorder} shadow-md`
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className={`w-11 h-11 rounded-xl ${accent.tile} flex items-center justify-center mb-3`}>
                        <t.Icon className={`w-5 h-5 ${accent.icon}`} aria-hidden="true" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">{t.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{t.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* History */}
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Appeal History</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">{appeals.length} record{appeals.length === 1 ? "" : "s"}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Reason</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {appeals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                          No appeals filed yet.
                        </td>
                      </tr>
                    ) : (
                      appeals.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800 transition-colors">
                          <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">{a.type}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-300 tabular-nums">{a.date}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">{a.reason}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[a.status]}`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {a.letterContent && (
                              <button
                                type="button"
                                onClick={() => setViewingAppeal(a)}
                                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                              >
                                <Eye className="w-4 h-4" aria-hidden="true" />
                                View
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* RIGHT: form */}
          <div className="lg:col-span-1">
            <form
              onSubmit={handleSubmit}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedType ? "Letter Details" : "Submit Appeal"}
                </h3>
                {selectedTypeObj && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedTypeObj.name}</p>
                )}
              </div>

              <div className="p-6 space-y-4">
                {!selectedType ? (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Appeal Type
                      </label>
                      <div className="px-3 py-2.5 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-500 dark:text-slate-400">
                        Select a type from the cards on the left.
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                        Reason for Appeal
                      </label>
                      <textarea
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        placeholder="Explain your reason for filing this appeal…"
                        rows={6}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Employee Name *">
                      <input
                        type="text"
                        value={form.employeeName}
                        onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                        placeholder="Full name"
                        className={fieldCls}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Employee ID">
                        <input
                          type="text"
                          value={form.employeeId}
                          onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                          placeholder="EMP001"
                          className={fieldCls}
                        />
                      </Field>
                      <Field label="Letter Date">
                        <input
                          type="date"
                          value={form.letterDate}
                          onChange={(e) => setForm({ ...form, letterDate: e.target.value })}
                          className={fieldCls}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Department">
                        <input
                          type="text"
                          value={form.department}
                          onChange={(e) => setForm({ ...form, department: e.target.value })}
                          placeholder="IT, HR, …"
                          className={fieldCls}
                        />
                      </Field>
                      <Field label="Position">
                        <input
                          type="text"
                          value={form.position}
                          onChange={(e) => setForm({ ...form, position: e.target.value })}
                          placeholder="Job title"
                          className={fieldCls}
                        />
                      </Field>
                    </div>

                    <Field label="Offense / Misconduct *">
                      <textarea
                        value={form.offense}
                        onChange={(e) => setForm({ ...form, offense: e.target.value })}
                        placeholder="Describe the offense or misconduct"
                        rows={2}
                        className={fieldCls}
                      />
                    </Field>

                    <Field label="Details / Incident Description *">
                      <textarea
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        placeholder="Provide details of the incident"
                        rows={3}
                        className={fieldCls}
                      />
                    </Field>

                    {selectedType === "show-cause-letter" && (
                      <Field label="Response Deadline (days)">
                        <input
                          type="number"
                          value={form.responseDeadline}
                          onChange={(e) => setForm({ ...form, responseDeadline: e.target.value })}
                          placeholder="e.g. 7"
                          className={fieldCls}
                        />
                      </Field>
                    )}

                    {selectedType === "pip" && (
                      <>
                        <Field label="Improvement Goals & Targets *">
                          <textarea
                            value={form.improvementGoals}
                            onChange={(e) => setForm({ ...form, improvementGoals: e.target.value })}
                            placeholder="Specific, measurable goals"
                            rows={3}
                            className={fieldCls}
                          />
                        </Field>
                        <Field label="Support Provided by Management *">
                          <textarea
                            value={form.supportProvided}
                            onChange={(e) => setForm({ ...form, supportProvided: e.target.value })}
                            placeholder="e.g. weekly check-ins, training, mentoring"
                            rows={2}
                            className={fieldCls}
                          />
                        </Field>
                        <Field label="Review Date *">
                          <input
                            type="date"
                            value={form.reviewDate}
                            onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
                            className={fieldCls}
                          />
                        </Field>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Manager Name">
                        <input
                          type="text"
                          value={form.managerName}
                          onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                          placeholder="Manager"
                          className={fieldCls}
                        />
                      </Field>
                      <Field label="Manager Title">
                        <input
                          type="text"
                          value={form.managerTitle}
                          onChange={(e) => setForm({ ...form, managerTitle: e.target.value })}
                          placeholder="HR Manager"
                          className={fieldCls}
                        />
                      </Field>
                    </div>
                  </>
                )}

                {error && (
                  <div role="alert" className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm py-2 px-3 rounded-lg dark:bg-rose-900 dark:border-rose-700 dark:text-rose-300">
                    <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-2">
                {selectedType && selectedTypeObj && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openPdfPreview(buildLetterContent(selectedType, form), selectedTypeObj.name)}
                      className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-4 h-4" aria-hidden="true" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const filename =
                          selectedType === "warning-letter" ? "Warning_Letter.pdf"
                          : selectedType === "show-cause-letter" ? "Show_Cause_Letter.pdf"
                          : "PIP_Letter.pdf";
                        downloadPdf(buildLetterContent(selectedType, form), filename);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      Download
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!selectedType}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Submit Appeal
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {pdfPreviewUrl && (
        <Modal
          title="Letter Preview"
          onClose={() => {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
          }}
        >
          <iframe src={pdfPreviewUrl} title="Letter Preview" className="flex-1 w-full" />
        </Modal>
      )}

      {/* View Letter Modal (from history) */}
      {viewingAppeal && (
        <Modal
          title={viewingAppeal.type}
          onClose={() => setViewingAppeal(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() =>
                  downloadPdf(
                    viewingAppeal.letterContent ?? "",
                    `${viewingAppeal.type.replace(/\s+/g, "_")}_${viewingAppeal.date.replace(/\//g, "-")}.pdf`,
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setViewingAppeal(null)}
                className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </>
          }
        >
          <iframe
            src={(() => {
              const doc = buildPdf(viewingAppeal.letterContent ?? "", viewingAppeal.type);
              return doc.output("bloburl") as unknown as string;
            })()}
            title={viewingAppeal.type}
            className="flex-1 w-full"
          />
        </Modal>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fieldCls =
  "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-950 dark:border-slate-500 dark:text-slate-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl flex flex-col" style={{ height: "90vh" }}>
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
