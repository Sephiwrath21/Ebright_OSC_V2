"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitClaim } from "@/app/claim/actions";
import {
  type ClaimType,
  usesMultiDoc,
  MAX_CLAIM_DOCS,
  requiresAttachment,
} from "@/app/claim/claim-types";
import {
  Home,
  ChevronRight,
  TrendingUp,
  HeartPulse,
  Car,
  X,
  CalendarDays,
  Banknote,
  Route,
  FileText,
  Upload,
  Clock,
  CheckCircle2,
  Paperclip,
  Info,
  UserPlus,
  RefreshCw,
  Timer,
  Trophy,
  Sparkles,
  GraduationCap,
  Megaphone,
  Store,
  Backpack,
  Hourglass,
  Crown,
  Presentation,
  Share2,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ClaimFormType = ClaimType;

interface Theme {
  label: string;
  subtitle: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentRing: string;
  accentBorder: string;
  accentText: string;
  Icon: LucideIcon;
}

const THEMES: Record<ClaimFormType, Theme> = {
  sales: {
    label: "Sales Claim",
    subtitle: "Process your sales reimbursements",
    accent: "#2563EB",
    accentDark: "#1d4fd8",
    accentSoft: "#EFF6FF",
    accentRing: "#DBEAFE",
    accentBorder: "#BFDBFE",
    accentText: "#1D4ED8",
    Icon: TrendingUp,
  },
  health: {
    label: "Health Claim",
    subtitle: "Medical, dental & healthcare reimbursements",
    accent: "#059669",
    accentDark: "#047857",
    accentSoft: "#ECFDF5",
    accentRing: "#D1FAE5",
    accentBorder: "#A7F3D0",
    accentText: "#047857",
    Icon: HeartPulse,
  },
  transport: {
    label: "Transport Claim",
    subtitle: "Daily mileage reimbursement",
    accent: "#EA580C",
    accentDark: "#C2410C",
    accentSoft: "#FFF7ED",
    accentRing: "#FFEDD5",
    accentBorder: "#FED7AA",
    accentText: "#C2410C",
    Icon: Car,
  },
  sales_incentive: {
    label: "Salesperson Incentive",
    subtitle: "Incentive for new business won",
    accent: "#4F46E5",
    accentDark: "#4338CA",
    accentSoft: "#EEF2FF",
    accentRing: "#E0E7FF",
    accentBorder: "#C7D2FE",
    accentText: "#4338CA",
    Icon: UserPlus,
  },
  renewal_incentive: {
    label: "Renewal Incentive",
    subtitle: "Incentive for renewed policies",
    accent: "#0891B2",
    accentDark: "#0E7490",
    accentSoft: "#ECFEFF",
    accentRing: "#CFFAFE",
    accentBorder: "#A5F3FC",
    accentText: "#0E7490",
    Icon: RefreshCw,
  },
  ot: {
    label: "Overtime (OT)",
    subtitle: "Overtime pay reimbursement",
    accent: "#7C3AED",
    accentDark: "#6D28D9",
    accentSoft: "#F5F3FF",
    accentRing: "#EDE9FE",
    accentBorder: "#DDD6FE",
    accentText: "#6D28D9",
    Icon: Timer,
  },
  branch_rank_reward: {
    label: "Branch Ranking Reward",
    subtitle: "Reward for branch performance ranking",
    accent: "#E11D48",
    accentDark: "#BE123C",
    accentSoft: "#FFF1F2",
    accentRing: "#FFE4E6",
    accentBorder: "#FECDD3",
    accentText: "#BE123C",
    Icon: Trophy,
  },
  jackpot: {
    label: "Jackpot",
    subtitle: "Jackpot reward payout",
    accent: "#D97706",
    accentDark: "#B45309",
    accentSoft: "#FFFBEB",
    accentRing: "#FEF3C7",
    accentBorder: "#FDE68A",
    accentText: "#B45309",
    Icon: Sparkles,
  },
  class: {
    label: "Class Claim",
    subtitle: "For coaches & executives",
    accent: "#6366F1",
    accentDark: "#4F46E5",
    accentSoft: "#EEF2FF",
    accentRing: "#E0E7FF",
    accentBorder: "#C7D2FE",
    accentText: "#4338CA",
    Icon: GraduationCap,
  },
  roadshow: {
    label: "Roadshow Claim",
    subtitle: "Marketing roadshow expenses",
    accent: "#D946EF",
    accentDark: "#C026D3",
    accentSoft: "#FDF4FF",
    accentRing: "#FAE8FF",
    accentBorder: "#F5D0FE",
    accentText: "#A21CAF",
    Icon: Megaphone,
  },
  showcase: {
    label: "Showcase Claim",
    subtitle: "Marketing showcase expenses",
    accent: "#0EA5E9",
    accentDark: "#0284C7",
    accentSoft: "#F0F9FF",
    accentRing: "#E0F2FE",
    accentBorder: "#BAE6FD",
    accentText: "#0369A1",
    Icon: Store,
  },
  internship: {
    label: "Internship Claim",
    subtitle: "For interns",
    accent: "#84CC16",
    accentDark: "#65A30D",
    accentSoft: "#F7FEE7",
    accentRing: "#ECFCCB",
    accentBorder: "#D9F99D",
    accentText: "#4D7C0F",
    Icon: Backpack,
  },
  part_time: {
    label: "Part Time Claim",
    subtitle: "Part-time work reimbursement",
    accent: "#06B6D4",
    accentDark: "#0891B2",
    accentSoft: "#ECFEFF",
    accentRing: "#CFFAFE",
    accentBorder: "#A5F3FC",
    accentText: "#0E7490",
    Icon: Hourglass,
  },
  rm_incentive: {
    label: "Regional Manager Incentive",
    subtitle: "Incentive for regional managers",
    accent: "#7C3AED",
    accentDark: "#6D28D9",
    accentSoft: "#F5F3FF",
    accentRing: "#EDE9FE",
    accentBorder: "#DDD6FE",
    accentText: "#6D28D9",
    Icon: Crown,
  },
  trainer: {
    label: "Trainer Claim",
    subtitle: "For trainers",
    accent: "#F43F5E",
    accentDark: "#E11D48",
    accentSoft: "#FFF1F2",
    accentRing: "#FFE4E6",
    accentBorder: "#FECDD3",
    accentText: "#BE123C",
    Icon: Presentation,
  },
  referral: {
    label: "Referral Claim",
    subtitle: "Referral reward claim",
    accent: "#16A34A",
    accentDark: "#15803D",
    accentSoft: "#F0FDF4",
    accentRing: "#DCFCE7",
    accentBorder: "#BBF7D0",
    accentText: "#15803D",
    Icon: Share2,
  },
};

const TRANSPORT_RATE = 0.7;
const TRANSPORT_ROUND_TRIP = 2;
const HEALTH_ANNUAL_CAP = 500;
const ACCENT_RED = "#E3172E";

export default function ClaimFormView({
  type,
  healthUsed = 0,
}: {
  type: ClaimFormType;
  healthUsed?: number;
}) {
  const theme = THEMES[type];
  const isMultiDoc = usesMultiDoc(type);
  const isStudentClaim = type === "sales_incentive";
  const attachmentRequired = requiresAttachment(type);

  // Claim date window: today through the end of the current month — no backdating.
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const nowForBounds = new Date();
  const minDate = fmtDate(nowForBounds);
  const maxDate = fmtDate(
    new Date(nowForBounds.getFullYear(), nowForBounds.getMonth() + 1, 0),
  );

  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [distance, setDistance] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [students, setStudents] = useState<string[]>([""]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAmount, setSubmittedAmount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isImageFile = !!file && file.type.startsWith("image/");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  const typedAmount = useMemo(() => {
    const n = parseFloat(amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);
  const projectedUsed = healthUsed + typedAmount;
  const projectedRemaining = HEALTH_ANNUAL_CAP - projectedUsed;
  const projectedPct = Math.min(100, (projectedUsed / HEALTH_ANNUAL_CAP) * 100);
  const healthOverCap = type === "health" && projectedUsed > HEALTH_ANNUAL_CAP;
  const healthNearCap =
    type === "health" && !healthOverCap && projectedPct >= 80;

  const transportTotal = useMemo(() => {
    const d = parseFloat(distance || "0");
    if (Number.isNaN(d)) return 0;
    return d * TRANSPORT_RATE * TRANSPORT_ROUND_TRIP;
  }, [distance]);

  // Student names (Salesperson Incentive) — warn on duplicates within the form.
  const duplicateStudentIdx = useMemo(() => {
    const seen = new Map<string, number>();
    const dups = new Set<number>();
    students.forEach((s, i) => {
      const key = s.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) {
        dups.add(i);
        dups.add(seen.get(key)!);
      } else {
        seen.set(key, i);
      }
    });
    return dups;
  }, [students]);
  const hasDuplicateStudents = duplicateStudentIdx.size > 0;
  const filledStudents = useMemo(
    () => students.map((s) => s.trim()).filter(Boolean),
    [students],
  );

  const setStudent = (i: number, val: string) =>
    setStudents((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  const addStudent = () =>
    setStudents((prev) => (prev.length >= 20 ? prev : [...prev, ""]));
  const removeStudent = (i: number) =>
    setStudents((prev) =>
      prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i),
    );

  const primaryFieldValid =
    type === "transport" ? !!distance && parseFloat(distance) > 0 : !!amount;
  const studentsValid =
    !isStudentClaim || (filledStudents.length > 0 && !hasDuplicateStudents);
  const attachmentValid =
    !attachmentRequired || docFiles.length > 0 || !!file;
  const canSubmit =
    !!date && primaryFieldValid && !healthOverCap && studentsValid && attachmentValid;

  const handleFile = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setFile(incoming[0]);
  };

  const removeFile = () => setFile(null);

  const addDocs = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);
    setDocFiles((prev) => {
      const merged = [...prev];
      for (const f of Array.from(incoming)) {
        // Skip exact duplicates (same name + size) already queued.
        if (merged.some((m) => m.name === f.name && m.size === f.size)) continue;
        merged.push(f);
      }
      if (merged.length > MAX_CLAIM_DOCS) {
        setErrorMsg(`You can attach at most ${MAX_CLAIM_DOCS} documents.`);
        return merged.slice(0, MAX_CLAIM_DOCS);
      }
      return merged;
    });
  };

  const removeDoc = (index: number) =>
    setDocFiles((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isPending) return;
    setErrorMsg(null);

    const fd = new FormData();
    fd.append("claim_type", type);
    fd.append("claim_date", date);
    // Persist student names alongside the description for Salesperson Incentive.
    const finalDescription =
      isStudentClaim && filledStudents.length > 0
        ? [`Students: ${filledStudents.join(", ")}`, description].filter(Boolean).join("\n")
        : description;
    fd.append("description", finalDescription);
    if (type === "transport") {
      fd.append("distance", distance);
    } else {
      fd.append("amount", amount);
    }
    if (isMultiDoc) {
      docFiles.forEach((f) => fd.append("attachment_file", f));
    } else if (file) {
      fd.append("attachment_file", file);
    }

    startTransition(async () => {
      const result = await submitClaim(null, fd);
      if (!result.ok) {
        setErrorMsg(result.error ?? "Failed to submit claim.");
        return;
      }
      setSubmittedAmount(result.amount ?? 0);
      setSubmitted(true);
      router.refresh();
    });
  };

  if (submitted) {
    return (
      <SuccessScreen
        theme={theme}
        type={type}
        date={date}
        displayAmount={submittedAmount}
        distance={distance}
        onAnother={() => {
          setSubmitted(false);
          setDate("");
          setAmount("");
          setDistance("");
          setDescription("");
          setFile(null);
          setDocFiles([]);
          setStudents([""]);
          setErrorMsg(null);
        }}
      />
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "44px",
    padding: "0 16px",
    borderRadius: "10px",
    border: "1px solid #E5E7EB",
    background: "#fff",
    fontSize: "14px",
    color: "#171717",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = theme.accent;
    e.currentTarget.style.boxShadow = `0 0 0 4px ${theme.accentRing}`;
  };
  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "#E5E7EB";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAFAFA" }}>
      <div style={{ maxWidth: "820px", margin: "0 auto", padding: "24px 24px 56px" }}>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "6px",
            fontSize: "13px",
            color: "#737373",
            marginBottom: "24px",
          }}
        >
          <Link href="/home" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <Home size={13} strokeWidth={2} aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight size={12} style={{ color: "#D4D4D4" }} aria-hidden="true" />
          <Link href="/dashboards/hrms">HRMS</Link>
          <ChevronRight size={12} style={{ color: "#D4D4D4" }} aria-hidden="true" />
          <Link href="/claim">Claims</Link>
          <ChevronRight size={12} style={{ color: "#D4D4D4" }} aria-hidden="true" />
          <Link href="/claim/new">New</Link>
          <ChevronRight size={12} style={{ color: "#D4D4D4" }} aria-hidden="true" />
          <span style={{ color: "#171717", fontWeight: 500 }}>{theme.label}</span>
        </nav>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              position: "relative",
              padding: "28px 32px 24px",
              background: `linear-gradient(135deg, ${theme.accentSoft} 0%, #fff 60%)`,
              borderBottom: "1px solid #F3F4F6",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "14px",
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: "#fff",
                  border: `1px solid ${theme.accentBorder}`,
                  boxShadow: `0 4px 12px ${theme.accentRing}`,
                }}
              >
                <theme.Icon
                  size={26}
                  strokeWidth={2}
                  style={{ color: theme.accent }}
                  aria-hidden="true"
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "#171717",
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {theme.label}
                </h1>
                <p style={{ fontSize: "13.5px", color: "#737373", marginTop: "4px" }}>
                  {theme.subtitle}
                </p>
              </div>
              <Link
                href="/claim/new"
                aria-label="Close"
                style={{
                  width: "36px",
                  height: "36px",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "10px",
                  color: "#A3A3A3",
                }}
                className="hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "24px",
              padding: "28px 32px",
            }}
          >
            {/* Date + Amount/Distance row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "20px",
                alignItems: "start",
              }}
            >
              <FieldBlock
                icon={<CalendarDays size={13} strokeWidth={2.5} />}
                label="Claim Date"
                required
                hint={
                  <>
                    <Clock size={11} strokeWidth={2} aria-hidden="true" />
                    Today or later — no backdating
                  </>
                }
              >
                <input
                  type="date"
                  required
                  min={minDate}
                  max={maxDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </FieldBlock>

              {type === "transport" ? (
                <FieldBlock
                  icon={<Route size={13} strokeWidth={2.5} />}
                  label="Distance (One Way)"
                  required
                  hint={<>Distance from home to workplace</>}
                >
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      required
                      placeholder="0.0"
                      value={distance}
                      onChange={(e) => setDistance(e.target.value)}
                      style={{ ...inputStyle, paddingRight: "52px" }}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                    <span
                      style={{
                        position: "absolute",
                        right: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.15em",
                        color: "#A3A3A3",
                        pointerEvents: "none",
                      }}
                    >
                      KM
                    </span>
                  </div>
                </FieldBlock>
              ) : (
                <FieldBlock
                  icon={<Banknote size={13} strokeWidth={2.5} />}
                  label="Total Amount"
                  required
                  hint={
                    type === "health"
                      ? "Within your annual limit"
                      : "Enter the receipt total"
                  }
                >
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: "16px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#737373",
                        pointerEvents: "none",
                      }}
                    >
                      RM
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      style={{ ...inputStyle, paddingLeft: "46px" }}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                </FieldBlock>
              )}
            </div>

            {/* Student names — Salesperson Incentive */}
            {isStudentClaim && (
              <FieldBlock
                icon={<Users size={13} strokeWidth={2.5} />}
                label="Student Name(s)"
                required
                hint="Each student can only be claimed once"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {students.map((s, i) => {
                    const isDup = duplicateStudentIdx.has(i);
                    return (
                      <div
                        key={i}
                        style={{ display: "flex", gap: "8px", alignItems: "center" }}
                      >
                        <div style={{ position: "relative", flex: 1 }}>
                          <input
                            type="text"
                            value={s}
                            onChange={(e) => setStudent(i, e.target.value)}
                            placeholder={`Student ${i + 1} full name`}
                            style={{
                              ...inputStyle,
                              borderColor: isDup ? ACCENT_RED : "#E5E7EB",
                              paddingRight: isDup ? "104px" : "16px",
                            }}
                            onFocus={handleFocus}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = isDup
                                ? ACCENT_RED
                                : "#E5E7EB";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          />
                          {isDup && (
                            <span
                              style={{
                                position: "absolute",
                                right: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: ACCENT_RED,
                                pointerEvents: "none",
                              }}
                            >
                              Duplicate
                            </span>
                          )}
                        </div>
                        {students.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStudent(i)}
                            aria-label={`Remove student ${i + 1}`}
                            style={{
                              width: "44px",
                              height: "44px",
                              flexShrink: 0,
                              display: "grid",
                              placeItems: "center",
                              borderRadius: "10px",
                              border: "1px solid #E5E7EB",
                              backgroundColor: "#fff",
                              color: "#A3A3A3",
                              cursor: "pointer",
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <button
                      type="button"
                      onClick={addStudent}
                      disabled={students.length >= 20}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        color: students.length >= 20 ? "#A3A3A3" : theme.accentText,
                        background: "transparent",
                        border: "none",
                        cursor: students.length >= 20 ? "not-allowed" : "pointer",
                        padding: 0,
                      }}
                    >
                      + Add student
                    </button>
                    {hasDuplicateStudents && (
                      <span style={{ fontSize: "12px", fontWeight: 600, color: ACCENT_RED }}>
                        Duplicate student name — each student can only be claimed once.
                      </span>
                    )}
                  </div>
                </div>
              </FieldBlock>
            )}

            {/* Health annual cap */}
            {type === "health" && (() => {
              const stateColor = healthOverCap
                ? { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", bar: "#DC2626" }
                : healthNearCap
                  ? { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", bar: "#D97706" }
                  : {
                      bg: theme.accentSoft,
                      border: theme.accentBorder,
                      text: theme.accentText,
                      bar: theme.accent,
                    };
              const baselinePct = Math.min(100, (healthUsed / HEALTH_ANNUAL_CAP) * 100);
              const typedPct = Math.max(0, projectedPct - baselinePct);
              return (
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "18px 20px",
                    backgroundColor: stateColor.bg,
                    border: `1px solid ${stateColor.border}`,
                    transition: "background-color 0.2s, border-color 0.2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "12.5px",
                      marginBottom: "10px",
                    }}
                  >
                    <span style={{ fontWeight: 600, color: stateColor.text }}>
                      Annual limit · RM {HEALTH_ANNUAL_CAP}
                    </span>
                    <span style={{ fontWeight: 700, color: stateColor.text }}>
                      {healthOverCap
                        ? `Over by RM ${Math.abs(projectedRemaining).toFixed(2)}`
                        : `RM ${projectedRemaining.toFixed(2)} remaining`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "8px",
                      borderRadius: "9999px",
                      backgroundColor: "#fff",
                      overflow: "hidden",
                      border: `1px solid ${stateColor.border}`,
                      display: "flex",
                    }}
                  >
                    <div
                      style={{
                        width: `${baselinePct}%`,
                        height: "100%",
                        backgroundColor: stateColor.bar,
                        opacity: 0.55,
                        transition: "width 0.25s, background-color 0.2s",
                      }}
                    />
                    <div
                      style={{
                        width: `${typedPct}%`,
                        height: "100%",
                        backgroundColor: stateColor.bar,
                        transition: "width 0.25s, background-color 0.2s",
                      }}
                    />
                  </div>
                  <p
                    style={{
                      marginTop: "10px",
                      fontSize: "11.5px",
                      color: stateColor.text,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px 10px",
                    }}
                  >
                    <span>
                      Used this year: <b>RM {healthUsed.toFixed(2)}</b>
                    </span>
                    {typedAmount > 0 && (
                      <span>
                        · Claiming now: <b>RM {typedAmount.toFixed(2)}</b>
                      </span>
                    )}
                    <span>· {new Date().getFullYear()}</span>
                  </p>
                </div>
              );
            })()}

            {/* Transport calculation */}
            {type === "transport" && (
              <div
                style={{
                  borderRadius: "14px",
                  padding: "20px",
                  backgroundColor: theme.accentSoft,
                  border: `1px solid ${theme.accentBorder}`,
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: theme.accentText,
                    marginBottom: "14px",
                  }}
                >
                  Calculation Breakdown
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "10px",
                  }}
                >
                  <CalcCell
                    label="Distance"
                    value={`${parseFloat(distance || "0").toFixed(1)} km`}
                  />
                  <CalcCell label="Rate" value={`RM ${TRANSPORT_RATE.toFixed(2)}/km`} />
                  <CalcCell label="Round Trip" value={`× ${TRANSPORT_ROUND_TRIP}`} />
                </div>
                <div
                  style={{
                    marginTop: "14px",
                    paddingTop: "12px",
                    borderTop: `1px dashed ${theme.accentBorder}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "12px", color: theme.accentText }}>
                    {parseFloat(distance || "0").toFixed(1)} km × RM{" "}
                    {TRANSPORT_RATE.toFixed(2)} × {TRANSPORT_ROUND_TRIP}
                  </span>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: theme.accentText,
                    }}
                  >
                    RM {transportTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <Divider />

            {/* Description */}
            <FieldBlock icon={<FileText size={13} strokeWidth={2.5} />} label="Description">
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide full context — purpose of claim, dates, references..."
                style={{
                  ...inputStyle,
                  height: "auto",
                  padding: "12px 16px",
                  resize: "none",
                  lineHeight: 1.55,
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </FieldBlock>

            <Divider />

            {/* Supporting Documents */}
            <FieldBlock
              icon={<Paperclip size={13} strokeWidth={2.5} />}
              label={isMultiDoc ? "Documents & Evidence" : "Supporting Documents"}
              required={attachmentRequired}
              hint={
                attachmentRequired && !attachmentValid ? (
                  <span style={{ color: ACCENT_RED, fontWeight: 600 }}>
                    At least one document is required to submit this claim.
                  </span>
                ) : undefined
              }
            >
              {isMultiDoc ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div
                    onClick={() => docsRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      addDocs(e.dataTransfer.files);
                    }}
                    style={{
                      cursor: "pointer",
                      borderRadius: "14px",
                      border: `2px dashed ${dragOver ? theme.accent : "#E5E7EB"}`,
                      padding: "32px",
                      textAlign: "center",
                      transition: "all 0.2s",
                      backgroundColor: dragOver ? theme.accentSoft : "#FAFAFA",
                    }}
                  >
                    <input
                      ref={docsRef}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        addDocs(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <div
                      style={{
                        margin: "0 auto 12px",
                        width: "44px",
                        height: "44px",
                        borderRadius: "9999px",
                        display: "grid",
                        placeItems: "center",
                        backgroundColor: dragOver ? theme.accentRing : "#F5F5F5",
                      }}
                    >
                      <Upload
                        size={18}
                        strokeWidth={1.75}
                        style={{ color: dragOver ? theme.accent : "#737373" }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: "13.5px",
                        color: "#404040",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      Click to upload{" "}
                      <span style={{ color: theme.accent }}>documents and evidences</span>
                    </p>
                    <p style={{ fontSize: "11.5px", color: "#A3A3A3" }}>
                      PDF, JPG or PNG · Up to {MAX_CLAIM_DOCS} files · Max 5MB each
                    </p>
                  </div>

                  {docFiles.length > 0 && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#737373" }}>
                          {docFiles.length} of {MAX_CLAIM_DOCS} file
                          {docFiles.length === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDocFiles([])}
                          style={{
                            fontSize: "11.5px",
                            fontWeight: 600,
                            color: theme.accentText,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Clear all
                        </button>
                      </div>
                      <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {docFiles.map((f, i) => (
                          <li
                            key={`${f.name}-${f.size}-${i}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 12px",
                              borderRadius: "10px",
                              border: `1px solid ${theme.accentBorder}`,
                              backgroundColor: theme.accentSoft,
                            }}
                          >
                            <div
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                display: "grid",
                                placeItems: "center",
                                backgroundColor: "#fff",
                                color: theme.accent,
                                flexShrink: 0,
                              }}
                            >
                              <Paperclip size={15} strokeWidth={2} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  color: "#262626",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {f.name}
                              </p>
                              <p style={{ fontSize: "11px", color: "#737373" }}>
                                {(f.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDoc(i)}
                              aria-label={`Remove ${f.name}`}
                              style={{
                                width: "30px",
                                height: "30px",
                                display: "grid",
                                placeItems: "center",
                                borderRadius: "8px",
                                color: "#A3A3A3",
                                border: "1px solid transparent",
                                background: "transparent",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              <X size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ) : !file ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files);
                  }}
                  style={{
                    cursor: "pointer",
                    borderRadius: "14px",
                    border: `2px dashed ${dragOver ? theme.accent : "#E5E7EB"}`,
                    padding: "32px",
                    textAlign: "center",
                    transition: "all 0.2s",
                    backgroundColor: dragOver ? theme.accentSoft : "#FAFAFA",
                  }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files)}
                  />
                  <div
                    style={{
                      margin: "0 auto 12px",
                      width: "44px",
                      height: "44px",
                      borderRadius: "9999px",
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: dragOver ? theme.accentRing : "#F5F5F5",
                    }}
                  >
                    <Upload
                      size={18}
                      strokeWidth={1.75}
                      style={{ color: dragOver ? theme.accent : "#737373" }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: "13.5px",
                      color: "#404040",
                      fontWeight: 500,
                      marginBottom: "4px",
                    }}
                  >
                    Click to upload{" "}
                    <span style={{ color: theme.accent }}>Receipt or MC</span>
                  </p>
                  <p style={{ fontSize: "11.5px", color: "#A3A3A3" }}>
                    PDF, JPG or PNG · Max 5MB
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: `1px solid ${theme.accentBorder}`,
                    backgroundColor: theme.accentSoft,
                  }}
                >
                  {isImageFile && previewUrl ? (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      aria-label="Preview image"
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "10px",
                        overflow: "hidden",
                        flexShrink: 0,
                        padding: 0,
                        border: `1px solid ${theme.accentBorder}`,
                        backgroundColor: "#fff",
                        cursor: "zoom-in",
                        display: "block",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt={file.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </button>
                  ) : (
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        display: "grid",
                        placeItems: "center",
                        backgroundColor: "#fff",
                        color: theme.accent,
                        flexShrink: 0,
                      }}
                    >
                      <Paperclip size={16} strokeWidth={2} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 500,
                        color: "#262626",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </p>
                    <p style={{ fontSize: "11.5px", color: "#737373" }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    style={{
                      height: "32px",
                      padding: "0 12px",
                      borderRadius: "8px",
                      border: `1px solid ${theme.accentBorder}`,
                      backgroundColor: "#fff",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: theme.accentText,
                      cursor: "pointer",
                    }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={removeFile}
                    style={{
                      width: "32px",
                      height: "32px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "8px",
                      color: "#A3A3A3",
                      border: "1px solid transparent",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                    aria-label="Remove file"
                  >
                    <X size={14} />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: "none" }}
                    onChange={(e) => handleFile(e.target.files)}
                  />
                </div>
              )}
            </FieldBlock>

            {/* Deadline notice */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
                borderRadius: "12px",
                backgroundColor: "#FFFBEB",
                border: "1px solid #FDE68A",
                padding: "14px 16px",
              }}
            >
              <Clock
                size={17}
                strokeWidth={2}
                style={{ color: "#D97706", marginTop: "2px", flexShrink: 0 }}
                aria-hidden="true"
              />
              <div>
                <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#78350F", marginBottom: "2px" }}>
                  Submission Deadline
                </p>
                <p style={{ fontSize: "12px", color: "#92400E", lineHeight: 1.55 }}>
                  Submit by the <b>2nd</b> of each month. Late submissions roll into the
                  next cycle.
                </p>
              </div>
            </div>

            {/* Type-specific info */}
            {type === "health" && (
              <InfoNotice theme={theme} title="Health Claim Cap">
                Maximum <b>RM {HEALTH_ANNUAL_CAP}</b> per year. You have used{" "}
                <b>RM {healthUsed.toFixed(2)}</b> so far in {new Date().getFullYear()}.
                {healthOverCap ? (
                  <>
                    {" "}This claim of <b>RM {typedAmount.toFixed(2)}</b> exceeds your
                    remaining cap by <b>RM {Math.abs(projectedRemaining).toFixed(2)}</b>.
                  </>
                ) : (
                  <>
                    {" "}After this claim,{" "}
                    <b>RM {Math.max(0, projectedRemaining).toFixed(2)}</b> would remain.
                  </>
                )}
              </InfoNotice>
            )}
            {type === "transport" && (
              <InfoNotice theme={theme} title="Transport Claim">
                Claimed per day. Formula:{" "}
                <b>
                  Distance (km) × RM {TRANSPORT_RATE.toFixed(2)} × {TRANSPORT_ROUND_TRIP}{" "}
                  (round trip)
                </b>
                . Submit one claim per working day.
              </InfoNotice>
            )}
            {type === "internship" && (
              <InfoNotice theme={theme} title="How to calculate an internship claim">
                Internship claims are prorated by your start date. Formula:{" "}
                <b>(days worked in the month ÷ total days in the month) × monthly allowance</b>.
                <br />
                Example: starting on the 21st of May (May has 31 days) →{" "}
                <b>(12 / 31) × RM750 = RM290.32</b>.
                <br />
                Enter the calculated amount in the <b>Total Amount</b> field above.
              </InfoNotice>
            )}
            {type === "referral" && (
              <InfoNotice theme={theme} title="Required attachment">
                You <b>must attach a screenshot from the manpower schedule</b> showing
                your training starting date before submitting this referral claim.
              </InfoNotice>
            )}
            {(type === "sales_incentive" || type === "renewal_incentive") && (
              <InfoNotice theme={theme} title="Required attachments">
                You <b>must upload the invoice and the WhatsApp screenshot</b> before
                submitting this claim.
              </InfoNotice>
            )}

            {errorMsg && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  borderRadius: "12px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "9999px",
                    backgroundColor: "#DC2626",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "11px",
                    fontWeight: 700,
                    marginTop: "2px",
                    flexShrink: 0,
                  }}
                >
                  !
                </div>
                <div>
                  <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#7F1D1D" }}>
                    Could not submit claim
                  </p>
                  <p style={{ fontSize: "12px", color: "#991B1B", lineHeight: 1.55 }}>
                    {errorMsg}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div
            style={{
              padding: "18px 32px",
              borderTop: "1px solid #F3F4F6",
              backgroundColor: "#FAFAFA",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            <Link
              href="/claim/new"
              style={{
                height: "44px",
                display: "inline-flex",
                alignItems: "center",
                padding: "0 20px",
                borderRadius: "10px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#fff",
                fontSize: "13.5px",
                fontWeight: 500,
                color: "#404040",
              }}
              className="hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!canSubmit || isPending}
              style={{
                height: "44px",
                padding: "0 24px",
                borderRadius: "10px",
                backgroundColor: canSubmit && !isPending ? theme.accent : "#D4D4D4",
                color: "#fff",
                fontSize: "13.5px",
                fontWeight: 600,
                cursor: canSubmit && !isPending ? "pointer" : "not-allowed",
                boxShadow:
                  canSubmit && !isPending ? `0 4px 12px ${theme.accentRing}` : "none",
                transition: "background-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!canSubmit || isPending) return;
                e.currentTarget.style.backgroundColor = theme.accentDark;
              }}
              onMouseLeave={(e) => {
                if (!canSubmit || isPending) return;
                e.currentTarget.style.backgroundColor = theme.accent;
              }}
            >
              {isPending ? "Submitting…" : "Submit Claim"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; cursor: pointer; }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
      `}</style>

      {lightboxOpen && previewUrl && file && (
        <div
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Attachment preview"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.82)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px",
            cursor: "zoom-out",
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
            aria-label="Close preview"
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              width: "40px",
              height: "40px",
              borderRadius: "9999px",
              border: "none",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={file.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(1100px, 92vw)",
              maxHeight: "88vh",
              objectFit: "contain",
              borderRadius: "12px",
              boxShadow: "0 25px 80px rgba(0,0,0,0.4)",
              cursor: "default",
            }}
          />
        </div>
      )}
    </div>
  );
}

function FieldBlock({
  icon,
  label,
  required,
  hint,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "11.5px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#737373",
        }}
      >
        {icon}
        {label}
        {required && (
          <span style={{ marginLeft: "2px", fontWeight: 700, color: ACCENT_RED }}>*</span>
        )}
      </label>
      {children}
      {hint && (
        <p
          style={{
            fontSize: "11.5px",
            color: "#A3A3A3",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: "1px", backgroundColor: "#F3F4F6" }} />;
}

function CalcCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "10px",
        padding: "12px",
        textAlign: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <p
        style={{
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#A3A3A3",
          marginBottom: "4px",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: "14px", fontWeight: 700, color: "#262626" }}>{value}</p>
    </div>
  );
}

function InfoNotice({
  theme,
  title,
  children,
}: {
  theme: Theme;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        borderRadius: "12px",
        padding: "14px 16px",
        backgroundColor: theme.accentSoft,
        border: `1px solid ${theme.accentBorder}`,
      }}
    >
      <Info
        size={17}
        strokeWidth={2}
        style={{ color: theme.accent, marginTop: "2px", flexShrink: 0 }}
        aria-hidden="true"
      />
      <div>
        <p
          style={{
            fontSize: "13.5px",
            fontWeight: 600,
            marginBottom: "2px",
            color: theme.accentText,
          }}
        >
          {title}
        </p>
        <p style={{ fontSize: "12px", lineHeight: 1.55, color: theme.accentText }}>
          {children}
        </p>
      </div>
    </div>
  );
}

function SuccessScreen({
  theme,
  type,
  date,
  displayAmount,
  distance,
  onAnother,
}: {
  theme: Theme;
  type: ClaimFormType;
  date: string;
  displayAmount: number;
  distance: string;
  onAnother: () => void;
}) {
  const amountLabel =
    type === "transport"
      ? `RM ${displayAmount.toFixed(2)} (${parseFloat(distance || "0").toFixed(1)} km)`
      : `RM ${displayAmount.toFixed(2)}`;

  return (
    <div
      style={{
        minHeight: "100%",
        backgroundColor: "#FAFAFA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "400px" }}>
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "9999px",
            backgroundColor: "#ECFDF5",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 20px",
          }}
        >
          <CheckCircle2 size={32} strokeWidth={1.75} style={{ color: "#10B981" }} />
        </div>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#171717",
            marginBottom: "8px",
          }}
        >
          Claim Submitted
        </h2>
        <p
          style={{
            fontSize: "13.5px",
            color: "#737373",
            lineHeight: 1.55,
            marginBottom: "4px",
          }}
        >
          Your {theme.label.toLowerCase()} of{" "}
          <span style={{ fontWeight: 600, color: "#262626" }}>{amountLabel}</span> for{" "}
          <span style={{ fontWeight: 600, color: "#262626" }}>{date}</span> has been sent
          for approval.
        </p>
        <p style={{ fontSize: "12px", color: "#A3A3A3", marginBottom: "32px" }}>
          You&apos;ll receive a notification once it&apos;s reviewed.
        </p>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}
        >
          <Link
            href="/claim"
            style={{
              height: "44px",
              display: "inline-flex",
              alignItems: "center",
              padding: "0 20px",
              borderRadius: "10px",
              border: "1px solid #E5E7EB",
              backgroundColor: "#fff",
              fontSize: "13.5px",
              fontWeight: 500,
              color: "#404040",
            }}
          >
            Back to Claims
          </Link>
          <button
            onClick={onAnother}
            style={{
              height: "44px",
              padding: "0 24px",
              borderRadius: "10px",
              backgroundColor: theme.accent,
              color: "#fff",
              fontSize: "13.5px",
              fontWeight: 600,
              boxShadow: `0 4px 12px ${theme.accentRing}`,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = theme.accentDark)
            }
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.accent)}
          >
            Submit Another
          </button>
        </div>
      </div>
    </div>
  );
}
