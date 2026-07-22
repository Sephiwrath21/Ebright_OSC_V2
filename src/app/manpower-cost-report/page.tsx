"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Home as HomeIcon, ChevronRight, Search, Calendar, Download, ChevronDown, Wallet, FileDown, Eye, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AppShell from "@/app/components/AppShell";

const REGIONS = [
  {
    value: "region-a",
    label: "Region A",
    branches: ["Rimbayu", "Klang", "Shah Alam", "Setia Alam", "Denai Alam", "Eco Grandeur", "Subang Taipan"],
  },
  {
    value: "region-b",
    label: "Region B",
    branches: ["Danau Kota", "Kota Damansara", "Ampang", "Sri Petaling", "Bandar Tun Hussein Onn", "Kajang TTDI Groove", "Taman Sri Gombak"],
  },
  {
    value: "region-c",
    label: "Region C",
    branches: ["Putrajaya", "Kota Warisan", "Bandar Baru Bangi", "Cyberjaya", "Bandar Seri Putra", "Dataran Puchong Utama", "Online"],
  },
];

// Generate the last 12 months as options.
function getAvailableMonths() {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
}
const AVAILABLE_MONTHS = getAvailableMonths();

interface StaffRow {
  name: string;
  nickName: string | null;
  employeeId: string | null;
  branch: string;
  position: string | null;
  isPT: boolean;
  coachHrs: number;
  execHrs: number;
  totalHrs: number;
  rate: number | null;
  totalPay: number;
  days: { date: string; day: string; coachHrs: number; execHrs: number; totalHrs: number; scheduleBranch?: string }[];
}

interface ApiTotals {
  totalStaff: number;
  ptCount: number;
  ftCount: number;
  totalCoachHrs: number;
  totalExecHrs: number;
  totalHrs: number;
  totalPay: number;
  executiveRate: number;
}

interface Viewer {
  name: string;
  position: string | null;
  employeeId: string | null;
  branch: string;
  isPT: boolean;
  rate: number | null;
}

interface ApiResponse {
  success: boolean;
  staff: StaffRow[];
  totals: ApiTotals;
  availableWeeks: { start: string; end: string }[];
  isEmployeeView?: boolean;
  viewer?: Viewer | null;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHrs(h: number): string {
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  return `${hrs}h ${min.toString().padStart(2, "0")}m`;
}

// Build a zero-data StaffRow from the viewer profile so the employee view can
// render its full layout (profile card + KPIs + daily breakdown) even when
// there are no finalized schedules for the selected month.
function makeEmptyRow(viewer: Viewer | null): StaffRow {
  return {
    name: viewer?.name ?? "",
    nickName: null,
    employeeId: viewer?.employeeId ?? null,
    branch: viewer?.branch ?? "",
    position: viewer?.position ?? null,
    isPT: viewer?.isPT ?? false,
    coachHrs: 0,
    execHrs: 0,
    totalHrs: 0,
    rate: viewer?.rate ?? null,
    totalPay: 0,
    days: [],
  };
}

// ─── Page Content ─────────────────────────────────────────────────────────────

type ViewTab = "all" | "pt" | "ft";

function ManpowerCostReportContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewTab, setViewTab] = useState<ViewTab>("all");
  const [selectedMonth, setSelectedMonth] = useState(AVAILABLE_MONTHS[0].value);
  const [weekFilter, setWeekFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Resolved week boundaries (used by employee daily breakdown)
  const [weekStart, weekEnd] = weekFilter ? weekFilter.split(":::") : ["", ""];

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<{ start: string; end: string }[]>([]);
  const [execRate, setExecRate] = useState(11);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEmployeeView, setIsEmployeeView] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  // Fetch on month change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/manpower-cost?month=${selectedMonth}`);
        const data: ApiResponse = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.success) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setStaff(data.staff);
        setAvailableWeeks(data.availableWeeks);
        setExecRate(data.totals.executiveRate);
        setIsEmployeeView(!!data.isEmployeeView);
        setViewer(data.viewer ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMonth]);

  const branchOptions = useMemo(() => {
    if (!regionFilter) return [];
    return REGIONS.find(r => r.value === regionFilter)?.branches ?? [];
  }, [regionFilter]);

  const filteredStaff = useMemo(() => {
    let weekStart = "";
    let weekEnd = "";
    if (weekFilter) {
      const [s, e] = weekFilter.split(":::");
      weekStart = s;
      weekEnd = e;
    }

    return staff
      .map(s => {
        if (!weekFilter) return s;
        // Recompute hours/pay restricted to days within the selected week
        const days = s.days.filter(d => d.date >= weekStart && d.date <= weekEnd);
        const coachHrs = days.reduce((a, d) => a + d.coachHrs, 0);
        const execHrs  = days.reduce((a, d) => a + d.execHrs, 0);
        const totalHrs = coachHrs + execHrs;
        const hasRate = s.rate !== null && s.rate > 0;
        const coachPay = s.isPT && hasRate ? coachHrs * (s.rate ?? 0) : 0;
        const execPay  = s.isPT && hasRate ? execHrs * execRate : 0;
        return { ...s, coachHrs, execHrs, totalHrs, totalPay: coachPay + execPay, days };
      })
      .filter(s => {
        if (weekFilter && s.totalHrs === 0) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchesName = s.name.toLowerCase().includes(q);
          const matchesNick = s.nickName?.toLowerCase().includes(q) ?? false;
          if (!matchesName && !matchesNick) return false;
        }
        if (viewTab === "pt" && !s.isPT) return false;
        if (viewTab === "ft" && s.isPT) return false;
        if (regionFilter) {
          const region = REGIONS.find(r => r.value === regionFilter);
          if (region && !region.branches.includes(s.branch)) return false;
        }
        if (branchFilter && s.branch !== branchFilter) return false;
        return true;
      });
  }, [staff, searchQuery, viewTab, regionFilter, branchFilter, weekFilter, execRate]);

  const totals = useMemo(() => {
    const totalStaff = filteredStaff.length;
    const ptCount = filteredStaff.filter(s => s.isPT).length;
    const ftCount = totalStaff - ptCount;
    const totalCoachHrs = filteredStaff.reduce((a, s) => a + s.coachHrs, 0);
    const totalExecHrs  = filteredStaff.reduce((a, s) => a + s.execHrs, 0);
    const totalHrs      = totalCoachHrs + totalExecHrs;
    const totalPay      = filteredStaff.reduce((a, s) => a + s.totalPay, 0);
    return { totalStaff, ptCount, ftCount, totalCoachHrs, totalExecHrs, totalHrs, totalPay };
  }, [filteredStaff]);

  const monthLabel = AVAILABLE_MONTHS.find(m => m.value === selectedMonth)?.label ?? selectedMonth;
  const hasActiveFilters = !!(searchQuery || viewTab !== "all" || weekFilter || regionFilter || branchFilter);

  function clearFilters() {
    setSearchQuery("");
    setViewTab("all");
    setWeekFilter("");
    setRegionFilter("");
    setBranchFilter("");
  }

  function handleRegionChange(v: string) {
    setRegionFilter(v);
    setBranchFilter("");
  }

  // PDF export — opens the generated PDF in a new tab so the user can save
  // or print from the browser's PDF viewer. Branches between the employee
  // view (single profile + daily breakdown) and the finance view (summary
  // + multi-staff table). Ported from the v1 project.
  async function generatePDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Try to load logo
    let logoImg: string | null = null;
    try {
      const resp = await fetch("/ebright-font.png");
      if (resp.ok) {
        const blob = await resp.blob();
        logoImg = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }
    } catch { /* no logo available */ }

    // Header bar
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageW, 28, "F");

    let headerX = 14;
    if (logoImg) {
      // ebright-font.png is 2172x724 (~3:1) — width derived from that ratio
      // so the mark isn't stretched; 3mm top/bottom margin centers it in the
      // 28mm header bar.
      doc.addImage(logoImg, "PNG", 14, 3, 66, 22);
      headerX = 88;
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("MANPOWER COST REPORT", headerX, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const periodLabel = weekFilter
      ? `Week: ${weekStart} to ${weekEnd}`
      : `Period: ${monthLabel}`;
    const filterLabels = [periodLabel];
    if (regionFilter) filterLabels.push(`Region: ${REGIONS.find(r => r.value === regionFilter)?.label || regionFilter}`);
    if (branchFilter) filterLabels.push(`Branch: ${branchFilter}`);
    if (viewTab !== "all") filterLabels.push(`Type: ${viewTab.toUpperCase()}`);
    doc.text(filterLabels.join("  |  "), headerX, 21);

    // Generated date on right
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-MY")}`, pageW - 14, 21, { align: "right" });

    let y = 36;

    if (isEmployeeView) {
      // Employee PDF: profile info + daily breakdown.
      // Use the synthesized empty row when no schedules exist so the export
      // still produces a complete, recognisable document.
      const s = filteredStaff[0] ?? makeEmptyRow(viewer);
      const eRate = execRate;
      const isPT = s.isPT;

      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(s.name || "—", 14, y);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      y += 5;
      const infoLine = [s.branch || "—", isPT ? "Part-Time" : "Full-Time"];
      if (isPT && s.rate) infoLine.push(`Coach: RM${s.rate}/hr`, `Exec: RM${eRate}/hr`);
      doc.text(infoLine.join("  |  "), 14, y);
      y += 9;

      const [pyr, pmn] = selectedMonth.split("-").map(Number);
      const dow = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const numD = new Date(pyr, pmn, 0).getDate();
      const allD = Array.from({ length: numD }, (_, i) => {
        const d = i + 1;
        const ds = `${pyr}-${String(pmn).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        return { dayNum: d, date: ds, day: dow[new Date(pyr, pmn - 1, d).getDay()] };
      });
      const showDays = weekFilter
        ? allD.filter(d => d.date >= weekStart && d.date <= weekEnd)
        : allD;
      const wMap: Record<string, StaffRow["days"][number]> = {};
      s.days.forEach(d => { wMap[d.date] = d; });

      const dHead = isPT
        ? [["No.", "Day", "Date", "Coach Hr", "Rate", "Total", "Exec Hr", "Rate", "Total", "Total Hr", "Total Pay"]]
        : [["No.", "Day", "Date", "Coach Hr", "Exec Hr", "Total Hr"]];

      const dBody: string[][] = showDays.map(row => {
        const e = wMap[row.date];
        const worked = !!e;
        if (isPT) {
          const cp = worked ? e.coachHrs * (s.rate || 0) : 0;
          const ep = worked ? e.execHrs * eRate : 0;
          return [
            String(row.dayNum), row.day.slice(0, 3), row.date,
            worked ? fmtHrs(e.coachHrs) : "-",
            worked && e.coachHrs > 0 ? `RM${s.rate}` : "-",
            worked && cp > 0 ? `RM ${cp.toFixed(2)}` : "-",
            worked ? fmtHrs(e.execHrs) : "-",
            worked && e.execHrs > 0 ? `RM${eRate}` : "-",
            worked && ep > 0 ? `RM ${ep.toFixed(2)}` : "-",
            worked ? fmtHrs(e.totalHrs) : "-",
            worked ? `RM ${(cp + ep).toFixed(2)}` : "-",
          ];
        }
        return [
          String(row.dayNum), row.day.slice(0, 3), row.date,
          worked ? fmtHrs(e.coachHrs) : "-",
          worked ? fmtHrs(e.execHrs) : "-",
          worked ? fmtHrs(e.totalHrs) : "-",
        ];
      });

      const coachPay = isPT && s.rate ? s.coachHrs * s.rate : 0;
      const execPay = isPT ? s.execHrs * eRate : 0;
      const dFooter: string[] = isPT
        ? [
            "Total", "", `${s.days.length} days`,
            fmtHrs(s.coachHrs), "", `RM ${coachPay.toFixed(2)}`,
            fmtHrs(s.execHrs), "", `RM ${execPay.toFixed(2)}`,
            fmtHrs(s.totalHrs), `RM ${s.totalPay.toFixed(2)}`,
          ]
        : ["Total", "", `${s.days.length} days`, fmtHrs(s.coachHrs), fmtHrs(s.execHrs), fmtHrs(s.totalHrs)];
      dBody.push(dFooter);

      autoTable(doc, {
        startY: y, head: dHead, body: dBody, theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.row.index === dBody.length - 1) {
            hookData.cell.styles.fillColor = [30, 41, 59];
            hookData.cell.styles.textColor = 255;
            hookData.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: 14, right: 14 },
      });
    } else {
      // Finance PDF: summary + staff table.
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("SUMMARY", 14, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const summaryLines = [
        `Staff: ${totals.totalStaff} (PT: ${totals.ptCount} | FT: ${totals.ftCount})`,
        `Total Hours: ${fmtHrs(totals.totalHrs)}    Coach Hours: ${fmtHrs(totals.totalCoachHrs)}    Exec Hours: ${fmtHrs(totals.totalExecHrs)}`,
        `PT Cost: RM ${totals.totalPay.toFixed(2)}    Avg/PT: RM ${totals.ptCount > 0 ? (totals.totalPay / totals.ptCount).toFixed(2) : "0.00"}`,
      ];
      summaryLines.forEach(line => {
        doc.text(line, 14, y);
        y += 5;
      });
      y += 4;

      const tableHead = viewTab === "ft"
        ? [["Name", "Branch", "Type", "Coach Hrs", "Class", "Exec Hrs", "Total Hrs"]]
        : [["Name", "Branch", "Type", "Coach Hrs", "Class", "Exec Hrs", "Total Hrs", "Rate", "Total Pay"]];

      const tableBody: string[][] = filteredStaff.map(s => {
        const classes = Math.round(s.coachHrs / 1.25);
        const row = [s.name, s.branch, s.isPT ? "PT" : "FT", fmtHrs(s.coachHrs), classes > 0 ? `${classes} class${classes !== 1 ? "es" : ""}` : "-", fmtHrs(s.execHrs), fmtHrs(s.totalHrs)];
        if (viewTab !== "ft") {
          row.push(s.isPT && s.rate ? `RM${s.rate}` : "-");
          row.push(s.isPT ? `RM ${s.totalPay.toFixed(2)}` : "-");
        }
        return row;
      });

      const footerRow: string[] = [
        `Total (${totals.totalStaff})`, "", "",
        fmtHrs(totals.totalCoachHrs), "", fmtHrs(totals.totalExecHrs), fmtHrs(totals.totalHrs),
      ];
      if (viewTab !== "ft") {
        footerRow.push("");
        footerRow.push(`RM ${totals.totalPay.toFixed(2)}`);
      }
      tableBody.push(footerRow);

      autoTable(doc, {
        startY: y, head: tableHead, body: tableBody, theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (hookData) => {
          if (hookData.section === "body" && hookData.row.index === tableBody.length - 1) {
            hookData.cell.styles.fillColor = [30, 41, 59];
            hookData.cell.styles.textColor = 255;
            hookData.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: 14, right: 14 },
      });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text("Ebright HRMS — Confidential", 14, pageH - 6);
      doc.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 6, { align: "right" });
    }

    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500 mb-6"
        >
          <Link
            href="/home"
            className="flex items-center gap-1 hover:text-slate-900 transition-colors"
          >
            <HomeIcon className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">
            HRMS
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">Manpower Cost Report</span>
        </nav>

        {/* Page heading */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {isEmployeeView ? "My Manpower Report" : "Manpower Cost Report"}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 max-w-lg">
            {isEmployeeView
              ? `Your hours and pay for ${monthLabel}.${viewer?.position ? ` Position: ${viewer.position}.` : ""}`
              : "Breakdown of labor costs across branches, with per-staff hours and pay."}
          </p>
        </header>

        {isEmployeeView ? (
          loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 font-medium">Loading your manpower data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          ) : (
            <EmployeeBreakdown
              s={filteredStaff[0] ?? makeEmptyRow(viewer)}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              monthLabel={monthLabel}
              weekFilter={weekFilter}
              setWeekFilter={setWeekFilter}
              weekStart={weekStart}
              weekEnd={weekEnd}
              execRate={execRate}
              availableWeeks={availableWeeks}
              onPdf={generatePDF}
            />
          )
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="rounded-2xl p-4 bg-white border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Staff</p>
            <p className="text-2xl font-black text-slate-700">{totals.totalStaff}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">PT: {totals.ptCount} | FT: {totals.ftCount}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Hours</p>
            <p className="text-xl font-black text-blue-600">{fmtHrs(totals.totalHrs)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-orange-50 border border-orange-200">
            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">Coach Hours</p>
            <p className="text-xl font-black text-orange-600">{fmtHrs(totals.totalCoachHrs)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-indigo-50 border border-indigo-200">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Exec Hours</p>
            <p className="text-xl font-black text-indigo-600">{fmtHrs(totals.totalExecHrs)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
            <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">PT Cost</p>
            <p className="text-xl font-black text-green-600">
              RM {totals.totalPay.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-slate-200">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avg / PT</p>
            <p className="text-xl font-black text-slate-600">
              RM {totals.ptCount > 0 ? (totals.totalPay / totals.ptCount).toFixed(0) : "0"}
            </p>
          </div>
        </div>

        {/* Rate info bar + PDF */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 mb-6 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-500">
            <span className="font-bold text-slate-700">Exec Rate:</span> RM {execRate}/hr (fixed)
            <span className="mx-3 text-slate-300">|</span>
            <span className="font-bold text-slate-700">Coach Rate:</span> per employee profile (PT only)
            <span className="mx-3 text-slate-300">|</span>
            <span className="font-bold text-slate-700">Period:</span> {monthLabel}
            <span className="mx-3 text-slate-300">|</span>
            <span className="font-bold text-slate-700">FT:</span> hours only (fixed salary)
          </p>
          <button
            type="button"
            onClick={generatePDF}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>

        {/* Toolbar — admin view only. */}
        {!isEmployeeView && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name..."
                className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all w-[180px]"
              />
            </div>

            <ToolbarSelect
              value={viewTab}
              onChange={v => setViewTab(v as ViewTab)}
              options={[
                { value: "all", label: "All Staff" },
                { value: "pt",  label: "Part-Time" },
                { value: "ft",  label: "Full-Time" },
              ]}
            />

            <ToolbarSelect
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={AVAILABLE_MONTHS}
              icon={<Calendar className="w-4 h-4" />}
            />

            {availableWeeks.length > 0 && (
              <ToolbarSelect
                value={weekFilter}
                onChange={setWeekFilter}
                options={[
                  { value: "", label: "Full Month" },
                  ...availableWeeks.map((w, i) => {
                    const sd = new Date(w.start + "T00:00:00").getDate();
                    const ed = new Date(w.end + "T00:00:00").getDate();
                    const mn = new Date(w.start + "T00:00:00").toLocaleString(
                      "en-US", { month: "short" },
                    );
                    return {
                      value: `${w.start}:::${w.end}`,
                      label: `Wk${i + 1} (${sd}-${ed} ${mn})`,
                    };
                  }),
                ]}
                icon={<Calendar className="w-4 h-4" />}
              />
            )}

            <ToolbarSelect
              value={regionFilter}
              onChange={handleRegionChange}
              options={[
                { value: "", label: "All Regions" },
                ...REGIONS.map(r => ({ value: r.value, label: r.label })),
              ]}
            />

            {regionFilter && branchOptions.length > 0 && (
              <ToolbarSelect
                value={branchFilter}
                onChange={setBranchFilter}
                options={[
                  { value: "", label: "All Branches" },
                  ...branchOptions.map(b => ({ value: b, label: b })),
                ]}
              />
            )}

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Staff table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                  <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Type</th>
                  <th className="px-5 py-4 text-xs font-bold text-orange-500 uppercase tracking-wider text-center">Coach Hrs</th>
                  <th className="px-5 py-4 text-xs font-bold text-pink-500 uppercase tracking-wider text-center">Class</th>
                  <th className="px-5 py-4 text-xs font-bold text-indigo-500 uppercase tracking-wider text-center">Exec Hrs</th>
                  <th className="px-5 py-4 text-xs font-bold text-blue-500 uppercase tracking-wider text-center">Total Hrs</th>
                  {viewTab !== "ft" && (
                    <>
                      <th className="px-5 py-4 text-xs font-bold text-orange-500 uppercase tracking-wider text-center">Rate</th>
                      <th className="px-5 py-4 text-xs font-bold text-green-600 uppercase tracking-wider text-right">Total Pay</th>
                    </>
                  )}
                  <th className="px-5 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">Loading manpower cost data...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center">
                      <p className="text-red-600 font-medium">{error}</p>
                    </td>
                  </tr>
                ) : filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center">
                      <p className="text-slate-400 font-medium">No staff data found for {monthLabel}.</p>
                      <p className="text-slate-300 text-sm mt-1">Make sure schedules are finalized for this month.</p>
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map(s => {
                    const rowKey = `${s.name}:::${s.branch}`;
                    const isExpanded = expandedRow === rowKey;
                    return (
                      <Row
                        key={rowKey}
                        s={s}
                        onView={() => setExpandedRow(isExpanded ? null : rowKey)}
                        showPay={viewTab !== "ft"}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Daily Breakdown Modal */}
        {expandedRow && (
          <DailyBreakdownModal
            s={filteredStaff.find(st => `${st.name}:::${st.branch}` === expandedRow)!}
            monthLabel={monthLabel}
            execRate={totals?.executiveRate || 0}
            onClose={() => setExpandedRow(null)}
          />
        )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Employee daily breakdown view (no expand/collapse) ───────────────────────

function EmployeeBreakdown({
  s,
  selectedMonth,
  setSelectedMonth,
  monthLabel,
  weekFilter,
  setWeekFilter,
  weekStart,
  weekEnd,
  execRate,
  availableWeeks,
  onPdf,
}: {
  s: StaffRow;
  selectedMonth: string;
  setSelectedMonth: (v: string) => void;
  monthLabel: string;
  weekFilter: string;
  setWeekFilter: (v: string) => void;
  weekStart: string;
  weekEnd: string;
  execRate: number;
  availableWeeks: { start: string; end: string }[];
  onPdf: () => void;
}) {
  const [yr, mn] = selectedMonth.split("-").map(Number);
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const numDays = new Date(yr, mn, 0).getDate();
  const allDaysRaw = Array.from({ length: numDays }, (_, i) => {
    const d = i + 1;
    const dateStr = `${yr}-${String(mn).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayName = daysOfWeek[new Date(yr, mn - 1, d).getDay()];
    return { dayNum: d, date: dateStr, day: dayName };
  });
  const displayDays = weekFilter
    ? allDaysRaw.filter(d => d.date >= weekStart && d.date <= weekEnd)
    : allDaysRaw;
  const workedMap: Record<string, { coachHrs: number; execHrs: number; totalHrs: number; scheduleBranch?: string }> = {};
  s.days.forEach(d => { workedMap[d.date] = d; });

  const initials = s.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const coachPay = s.isPT && s.rate ? s.coachHrs * s.rate : 0;
  const execPay  = s.isPT ? s.execHrs * execRate : 0;

  return (
    <>
      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-lg font-black text-white shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-slate-800">{s.name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-sm text-slate-500 font-medium">{s.branch}</span>
              <span className="text-slate-300">|</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                s.isPT
                  ? "bg-purple-100 text-purple-700 border border-purple-200"
                  : "bg-blue-100 text-blue-700 border border-blue-200"
              }`}>
                {s.isPT ? "Part-Time" : "Full-Time"}
              </span>
              {s.isPT && s.rate && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="text-sm font-bold text-orange-600">Coach Rate: RM {s.rate}/hr</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-sm font-bold text-indigo-600">Exec Rate: RM {execRate}/hr</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <ToolbarSelect
              value={selectedMonth}
              onChange={setSelectedMonth}
              options={AVAILABLE_MONTHS}
              icon={<Calendar className="w-4 h-4" />}
            />
            {availableWeeks.length > 0 && (
              <ToolbarSelect
                value={weekFilter}
                onChange={setWeekFilter}
                options={[
                  { value: "", label: "Full Month" },
                  ...availableWeeks.map((w, i) => {
                    const sd = new Date(w.start + "T00:00:00").getDate();
                    const ed = new Date(w.end + "T00:00:00").getDate();
                    const mn = new Date(w.start + "T00:00:00").toLocaleString(
                      "en-US", { month: "short" },
                    );
                    return {
                      value: `${w.start}:::${w.end}`,
                      label: `Wk${i + 1} (${sd}-${ed} ${mn})`,
                    };
                  }),
                ]}
                icon={<Calendar className="w-4 h-4" />}
              />
            )}
            <button
              type="button"
              onClick={onPdf}
              aria-label="Export PDF"
              title="Export PDF"
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/30"
            >
              <FileDown className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards (3 for FT, 4 for PT) */}
      <div className={`grid grid-cols-2 ${s.isPT ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4 mb-6`}>
        <div className="rounded-2xl p-4 bg-white border border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Hours</p>
          <p className="text-xl font-black text-blue-600">{fmtHrs(s.totalHrs)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-orange-50 border border-orange-200">
          <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider mb-1">Coach Hours</p>
          <p className="text-xl font-black text-orange-600">{fmtHrs(s.coachHrs)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-indigo-50 border border-indigo-200">
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Exec Hours</p>
          <p className="text-xl font-black text-indigo-600">{fmtHrs(s.execHrs)}</p>
        </div>
        {s.isPT && (
          <div className="rounded-2xl p-4 bg-green-50 border border-green-200">
            <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-1">Total Pay</p>
            <p className="text-xl font-black text-green-600">
              RM {s.totalPay.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
      </div>

      {/* Daily Breakdown (shown directly, no expand) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between bg-slate-50 border-b border-slate-200">
          <p className="text-sm font-bold text-slate-700">
            Daily Breakdown — <span className="text-blue-600">{weekFilter ? `${weekStart} to ${weekEnd}` : monthLabel}</span>
          </p>
          <p className="text-xs text-slate-500 font-medium">
            {s.days.length} day{s.days.length !== 1 ? "s" : ""} worked
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              {s.isPT ? (
                <tr className="text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-3 text-slate-400 w-10">No.</th>
                  <th className="px-3 py-3 text-slate-400">Day</th>
                  <th className="px-3 py-3 text-slate-400">Date</th>
                  <th className="px-3 py-3 text-orange-400 text-center">Coach Hr</th>
                  <th className="px-3 py-3 text-orange-400 text-center">Rate</th>
                  <th className="px-3 py-3 text-orange-500 text-center">Total</th>
                  <th className="px-3 py-3 text-indigo-400 text-center">Exec Hr</th>
                  <th className="px-3 py-3 text-indigo-400 text-center">Rate</th>
                  <th className="px-3 py-3 text-indigo-500 text-center">Total</th>
                  <th className="px-3 py-3 text-green-600 text-right">Total Pay</th>
                </tr>
              ) : (
                <tr className="text-xs font-bold uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-slate-400 w-12">No.</th>
                  <th className="px-4 py-3 text-slate-400">Day</th>
                  <th className="px-4 py-3 text-slate-400">Date</th>
                  <th className="px-4 py-3 text-orange-400 text-center">Coach Hr</th>
                  <th className="px-4 py-3 text-indigo-400 text-center">Exec Hr</th>
                  <th className="px-4 py-3 text-blue-400 text-center">Total Hr</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayDays.map(row => {
                const entry = workedMap[row.date];
                const isWeekend = row.day === "Saturday" || row.day === "Sunday";
                const worked = !!entry;
                const coachPayDay = worked ? entry.coachHrs * (s.rate || 0) : 0;
                const execPayDay  = worked ? entry.execHrs * execRate : 0;
                const dayPay = coachPayDay + execPayDay;
                const isReplacement = worked && entry.scheduleBranch;
                const rowCls = `transition-colors ${
                  !worked ? "bg-slate-50/50 text-slate-300"
                  : isReplacement ? "bg-amber-50/50 hover:bg-amber-50/80"
                  : isWeekend ? "bg-blue-50/30 hover:bg-blue-50/50"
                  : "hover:bg-slate-50/50"
                }`;

                return s.isPT ? (
                  <tr key={row.date} className={rowCls}>
                    <td className="px-3 py-2 text-xs font-medium text-slate-400">{row.dayNum}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold ${!worked ? "text-slate-300" : isWeekend ? "text-blue-600" : "text-slate-600"}`}>
                        {row.day.slice(0, 3)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {row.date}
                      {isReplacement && (
                        <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                          @ {entry.scheduleBranch}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold">
                      <span className={worked ? "text-orange-600" : "text-slate-300"}>
                        {worked ? fmtHrs(entry.coachHrs) : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-slate-400">
                      {worked && entry.coachHrs > 0 ? `RM${s.rate}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold">
                      <span className={worked && coachPayDay > 0 ? "text-orange-700" : "text-slate-300"}>
                        {worked && coachPayDay > 0 ? `RM ${coachPayDay.toFixed(2)}` : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold">
                      <span className={worked ? "text-indigo-600" : "text-slate-300"}>
                        {worked ? fmtHrs(entry.execHrs) : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-slate-400">
                      {worked && entry.execHrs > 0 ? `RM${execRate}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold">
                      <span className={worked && execPayDay > 0 ? "text-indigo-700" : "text-slate-300"}>
                        {worked && execPayDay > 0 ? `RM ${execPayDay.toFixed(2)}` : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-black">
                      <span className={worked ? "text-green-600" : "text-slate-300"}>
                        {worked ? `RM ${dayPay.toFixed(2)}` : "-"}
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={row.date} className={rowCls}>
                    <td className="px-4 py-2 text-xs font-medium text-slate-400">{row.dayNum}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold ${!worked ? "text-slate-300" : isWeekend ? "text-blue-600" : "text-slate-600"}`}>
                        {row.day.slice(0, 3)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {row.date}
                      {isReplacement && (
                        <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                          @ {entry.scheduleBranch}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-bold">
                      <span className={worked ? "text-orange-600" : "text-slate-300"}>
                        {worked ? fmtHrs(entry.coachHrs) : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-bold">
                      <span className={worked ? "text-indigo-600" : "text-slate-300"}>
                        {worked ? fmtHrs(entry.execHrs) : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center text-xs font-black">
                      <span className={worked ? "text-blue-600" : "text-slate-300"}>
                        {worked ? fmtHrs(entry.totalHrs) : "-"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {s.isPT ? (
                <tr className="bg-slate-900 text-white">
                  <td colSpan={3} className="px-3 py-3 text-xs font-black uppercase">
                    Total ({s.days.length} day{s.days.length !== 1 ? "s" : ""})
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-black text-orange-300">{fmtHrs(s.coachHrs)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-center text-xs font-black text-orange-300">RM {coachPay.toFixed(2)}</td>
                  <td className="px-3 py-3 text-center text-xs font-black text-indigo-300">{fmtHrs(s.execHrs)}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-center text-xs font-black text-indigo-300">RM {execPay.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right text-sm font-black text-green-400">RM {s.totalPay.toFixed(2)}</td>
                </tr>
              ) : (
                <tr className="bg-slate-900 text-white">
                  <td colSpan={3} className="px-4 py-3 text-xs font-black uppercase">
                    Monthly Total ({s.days.length} day{s.days.length !== 1 ? "s" : ""} worked)
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-black text-orange-300">{fmtHrs(s.coachHrs)}</td>
                  <td className="px-4 py-3 text-center text-xs font-black text-indigo-300">{fmtHrs(s.execHrs)}</td>
                  <td className="px-4 py-3 text-center text-xs font-black text-blue-300">{fmtHrs(s.totalHrs)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Row (with expandable daily breakdown placeholder) ────────────────────────

function Row({
  s,
  onView,
  showPay,
}: {
  s: StaffRow;
  onView: () => void;
  showPay: boolean;
}) {
  const initials = s.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
              {initials}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{s.name}</p>
              <p className="text-[10px] text-slate-400">{s.employeeId}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4 text-sm text-slate-600 font-medium">{s.branch}</td>
        <td className="px-5 py-4 text-center">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
              s.isPT
                ? "bg-purple-100 text-purple-700 border border-purple-200"
                : "bg-blue-100 text-blue-700 border border-blue-200"
            }`}
          >
            {s.isPT ? "PT" : "FT"}
          </span>
        </td>
        <td className="px-5 py-4 text-center text-sm font-bold text-orange-600">{fmtHrs(s.coachHrs)}</td>
        <td className="px-5 py-4 text-center">
          {s.coachHrs > 0 ? (
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-50 text-pink-600 border border-pink-200">
              {Math.round(s.coachHrs / 1.25)}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
        <td className="px-5 py-4 text-center text-sm font-bold text-indigo-600">{fmtHrs(s.execHrs)}</td>
        <td className="px-5 py-4 text-center text-sm font-black text-blue-600">{fmtHrs(s.totalHrs)}</td>
        {showPay && (
          <>
            <td className="px-5 py-4 text-center text-sm text-slate-500">
              {s.isPT && s.rate ? `RM${s.rate}` : "-"}
            </td>
            <td className="px-5 py-4 text-right text-sm font-black text-green-600">
              {s.isPT ? `RM ${s.totalPay.toFixed(2)}` : "-"}
            </td>
          </>
        )}
        <td className="px-5 py-4 text-center">
          <button
            onClick={onView}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
            title="View Daily Breakdown"
          >
            <Eye className="w-4 h-4" />
          </button>
        </td>
      </tr>
    </>
  );
}

// ─── Toolbar select ───────────────────────────────────────────────────────────

interface ToolbarSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  icon?: React.ReactNode;
}

function ToolbarSelect({ value, onChange, options, icon }: ToolbarSelectProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none ${icon ? "pl-9" : "pl-4"} pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all cursor-pointer`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Page (with AppShell + auth) ──────────────────────────────────────────────

export default function ManpowerCostReportPage() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      redirect("/login");
    },
  });

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full text-blue-600 font-semibold text-lg">
          Loading...
        </div>
      </AppShell>
    );
  }

  const userEmail = session?.user?.email ?? "";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "USER";
  const userName = session?.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <ManpowerCostReportContent />
    </AppShell>
  );
}

// ─── Daily Breakdown Modal ──────────────────────────────────────────────────

function DailyBreakdownModal({
  s,
  monthLabel,
  execRate,
  onClose,
}: {
  s: StaffRow;
  monthLabel: string;
  execRate: number;
  onClose: () => void;
}) {
  const [yr, mn] = monthLabel ? [new Date(monthLabel).getFullYear(), new Date(monthLabel).getMonth() + 1] : [new Date().getFullYear(), new Date().getMonth() + 1];
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const numDays = new Date(yr, mn, 0).getDate();
  const allDays = Array.from({ length: numDays }, (_, i) => {
    const d = i + 1;
    const dateStr = `${yr}-${String(mn).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayName = daysOfWeek[new Date(yr, mn - 1, d).getDay()];
    return { dayNum: d, date: dateStr, day: dayName };
  });
  
  const workedMap: Record<string, { coachHrs: number; execHrs: number; totalHrs: number; scheduleBranch?: string }> = {};
  s.days.forEach(d => { workedMap[d.date] = d; });

  const handlePdf = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Daily Breakdown: ${s.name}`, 14, 20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Month: ${monthLabel} | Branch: ${s.branch}`, 14, 27);
    
    const tableData = allDays.map(row => {
      const entry = workedMap[row.date];
      if (!entry) return [row.dayNum.toString(), row.day.slice(0, 3), row.date, "-", "-", "-", "-", "-"];
      const classes = Math.round(entry.coachHrs / 1.25);
      const coachPayDay = entry.coachHrs * (s.rate || 0);
      const execPayDay = entry.execHrs * execRate;
      return [
        row.dayNum.toString(),
        row.day.slice(0, 3),
        row.date,
        fmtHrs(entry.coachHrs),
        classes > 0 ? classes.toString() : "-",
        fmtHrs(entry.execHrs),
        fmtHrs(entry.totalHrs),
        s.isPT ? `RM ${(coachPayDay + execPayDay).toFixed(2)}` : "-",
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [["NO.", "DAY", "DATE", "COACH HR", "CLASS", "EXEC HR", "TOTAL HR", "PAY (RM)"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [248, 250, 252], textColor: [100, 116, 139], fontStyle: "bold" },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        3: { halign: "center", textColor: [234, 88, 12] },
        4: { halign: "center", textColor: [249, 115, 22] },
        5: { halign: "center", textColor: [79, 70, 229] },
        6: { halign: "center", textColor: [37, 99, 235] },
        7: { halign: "right", fontStyle: "bold" },
      }
    });

    doc.save(`daily_breakdown_${s.name.replace(/\s+/g, "_")}_${monthLabel}.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] border border-slate-200">
        <div className="flex items-start justify-between p-5 border-b border-slate-200 gap-4 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Daily Breakdown: <span className="text-blue-600 uppercase">{s.name}</span>
              <span className="text-slate-400 font-normal ml-2 text-xs">
                ({s.branch} | Coach {s.isPT && s.rate ? `RM${s.rate}/hr` : "N/A"}, Exec RM{execRate}/hr)
              </span>
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              {s.days.length} day{s.days.length === 1 ? "" : "s"} worked
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handlePdf}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
            >
              <FileDown className="w-4 h-4" /> PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-0">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-white sticky top-0 shadow-sm z-10 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">No.</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Day</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-center font-bold text-orange-500 uppercase tracking-wider">Coach Hr</th>
                <th className="px-4 py-3 text-center font-bold text-pink-500 uppercase tracking-wider">Class</th>
                <th className="px-4 py-3 text-center font-bold text-indigo-400 uppercase tracking-wider">Exec Hr</th>
                <th className="px-4 py-3 text-center font-bold text-blue-500 uppercase tracking-wider">Total Hr</th>
                <th className="px-4 py-3 text-right font-bold text-green-600 uppercase tracking-wider">Pay (RM)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allDays.map(row => {
                const entry = workedMap[row.date];
                const isWeekend = row.day === "Saturday" || row.day === "Sunday";
                const worked = !!entry;
                const coachPayDay = worked ? entry.coachHrs * (s.rate || 0) : 0;
                const execPayDay = worked ? entry.execHrs * execRate : 0;
                const dayPay = coachPayDay + execPayDay;
                const classes = worked ? Math.round(entry.coachHrs / 1.25) : 0;
                
                return (
                  <tr key={row.date} className={`hover:bg-slate-50/50 transition-colors ${!worked ? "text-slate-300" : ""}`}>
                    <td className="px-4 py-2 font-medium text-slate-400">{row.dayNum}</td>
                    <td className={`px-4 py-2 font-bold ${!worked ? "text-slate-300" : isWeekend ? "text-blue-500" : "text-slate-500"}`}>
                      {row.day.slice(0, 3)}
                    </td>
                    <td className={`px-4 py-2 ${!worked ? "text-slate-300" : "text-slate-600"}`}>
                      {row.date}
                      {worked && entry.scheduleBranch && (
                        <span className="ml-2 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-wider">
                          Training / Replacement
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2 text-center font-bold ${worked ? "text-orange-500" : "text-slate-200"}`}>
                      {worked ? fmtHrs(entry.coachHrs) : "-"}
                    </td>
                    <td className={`px-4 py-2 text-center font-bold ${worked && classes > 0 ? "text-pink-500" : "text-slate-200"}`}>
                      {worked && classes > 0 ? classes : "-"}
                    </td>
                    <td className={`px-4 py-2 text-center font-bold ${worked ? "text-indigo-500" : "text-slate-200"}`}>
                      {worked ? fmtHrs(entry.execHrs) : "-"}
                    </td>
                    <td className={`px-4 py-2 text-center font-black ${worked ? "text-blue-600" : "text-slate-200"}`}>
                      {worked ? fmtHrs(entry.totalHrs) : "-"}
                    </td>
                    <td className={`px-4 py-2 text-right font-black ${worked && dayPay > 0 ? "text-green-600" : "text-slate-200"}`}>
                      {worked && s.isPT ? `RM ${dayPay.toFixed(2)}` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
