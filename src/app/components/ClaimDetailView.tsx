"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Home,
  ChevronRight,
  ArrowLeft,
  TrendingUp,
  HeartPulse,
  Car,
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
  User,
  Mail,
  Phone,
  Building2,
  Badge,
  Briefcase,
  Calendar,
  FileText,
  Paperclip,
  Clock,
  Receipt,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Download,
  ExternalLink,
  FileType2,
  type LucideIcon,
} from "lucide-react";
import { reviewClaim, advanceClaim } from "@/app/claim/actions";

interface ClaimInfo {
  claimId: number;
  displayId: string;
  claimType: string;
  description: string | null;
  amount: number;
  approvedAmount: number | null;
  claimDate: string;
  status: string;
  attachments: { url: string | null; exists: boolean; name: string }[];
  remarks: string | null;
  submittedOn: string;
  updatedAt: string;
}

interface EmployeeInfo {
  name: string;
  nickName: string | null;
  email: string;
  phone: string | null;
  employeeId: string | null;
  position: string | null;
  branch: string | null;
  branchCode: string | null;
}

const TYPE_META: Record<
  string,
  { label: string; Icon: LucideIcon; accent: string; accentSoft: string; accentBorder: string; accentText: string }
> = {
  sales: {
    label: "Sales Claim",
    Icon: TrendingUp,
    accent: "#2563EB",
    accentSoft: "#EFF6FF",
    accentBorder: "#BFDBFE",
    accentText: "#1D4ED8",
  },
  health: {
    label: "Health Claim",
    Icon: HeartPulse,
    accent: "#059669",
    accentSoft: "#ECFDF5",
    accentBorder: "#A7F3D0",
    accentText: "#047857",
  },
  transport: {
    label: "Transport Claim",
    Icon: Car,
    accent: "#EA580C",
    accentSoft: "#FFF7ED",
    accentBorder: "#FED7AA",
    accentText: "#C2410C",
  },
  sales_incentive: {
    label: "Salesperson Incentive",
    Icon: UserPlus,
    accent: "#4F46E5",
    accentSoft: "#EEF2FF",
    accentBorder: "#C7D2FE",
    accentText: "#4338CA",
  },
  renewal_incentive: {
    label: "Renewal Incentive",
    Icon: RefreshCw,
    accent: "#0891B2",
    accentSoft: "#ECFEFF",
    accentBorder: "#A5F3FC",
    accentText: "#0E7490",
  },
  ot: {
    label: "Overtime (OT)",
    Icon: Timer,
    accent: "#7C3AED",
    accentSoft: "#F5F3FF",
    accentBorder: "#DDD6FE",
    accentText: "#6D28D9",
  },
  branch_rank_reward: {
    label: "Branch Ranking Reward",
    Icon: Trophy,
    accent: "#E11D48",
    accentSoft: "#FFF1F2",
    accentBorder: "#FECDD3",
    accentText: "#BE123C",
  },
  jackpot: {
    label: "Jackpot",
    Icon: Sparkles,
    accent: "#D97706",
    accentSoft: "#FFFBEB",
    accentBorder: "#FDE68A",
    accentText: "#B45309",
  },
  class: {
    label: "Class Claim",
    Icon: GraduationCap,
    accent: "#6366F1",
    accentSoft: "#EEF2FF",
    accentBorder: "#C7D2FE",
    accentText: "#4338CA",
  },
  roadshow: {
    label: "Roadshow Claim",
    Icon: Megaphone,
    accent: "#D946EF",
    accentSoft: "#FDF4FF",
    accentBorder: "#F5D0FE",
    accentText: "#A21CAF",
  },
  showcase: {
    label: "Showcase Claim",
    Icon: Store,
    accent: "#0EA5E9",
    accentSoft: "#F0F9FF",
    accentBorder: "#BAE6FD",
    accentText: "#0369A1",
  },
  internship: {
    label: "Internship Claim",
    Icon: Backpack,
    accent: "#84CC16",
    accentSoft: "#F7FEE7",
    accentBorder: "#D9F99D",
    accentText: "#4D7C0F",
  },
  part_time: {
    label: "Part Time Claim",
    Icon: Hourglass,
    accent: "#06B6D4",
    accentSoft: "#ECFEFF",
    accentBorder: "#A5F3FC",
    accentText: "#0E7490",
  },
  rm_incentive: {
    label: "Regional Manager Incentive",
    Icon: Crown,
    accent: "#7C3AED",
    accentSoft: "#F5F3FF",
    accentBorder: "#DDD6FE",
    accentText: "#6D28D9",
  },
  trainer: {
    label: "Trainer Claim",
    Icon: Presentation,
    accent: "#F43F5E",
    accentSoft: "#FFF1F2",
    accentBorder: "#FECDD3",
    accentText: "#BE123C",
  },
  referral: {
    label: "Referral Claim",
    Icon: Share2,
    accent: "#16A34A",
    accentSoft: "#F0FDF4",
    accentBorder: "#BBF7D0",
    accentText: "#15803D",
  },
};

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pending: { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", label: "Pending" },
  approved: { bg: "#ECFDF5", text: "#047857", dot: "#10B981", label: "Approved" },
  rejected: { bg: "#FEF2F2", text: "#991B1B", dot: "#EF4444", label: "Rejected" },
  disbursed: { bg: "#FAF5FF", text: "#6B21A8", dot: "#A855F7", label: "Disbursed" },
  received: { bg: "#ECFDF5", text: "#047857", dot: "#10B981", label: "Received" },
};

// Monthly claim cycle stages, mirrored from the Claims list page but coloured
// per-claim by status: red = submitted/rejected (needs attention), green =
// approved/disbursed (passed), grey = not reached yet.
const CYCLE_STAGES = [
  { key: "submission", date: "2nd", label: "Submission" },
  { key: "approval", date: "12th", label: "Approval" },
  { key: "resubmission", date: "14th", label: "Resubmission" },
  { key: "finalReview", date: "17th", label: "Final Review" },
  { key: "disbursement", date: "22nd", label: "Disbursement" },
] as const;

type StageColor = "green" | "red" | "grey";

function claimCycleColors(status: string): StageColor[] {
  switch (status) {
    case "pending":
      // Submitted, awaiting review — submission marked red, the rest upcoming.
      return ["red", "grey", "grey", "grey", "grey"];
    case "approved":
      return ["green", "green", "green", "green", "grey"];
    case "rejected":
      return ["green", "red", "red", "red", "grey"];
    case "disbursed":
    case "received":
      return ["green", "green", "green", "green", "green"];
    default:
      return ["grey", "grey", "grey", "grey", "grey"];
  }
}

const STAGE_PALETTE: Record<
  StageColor,
  { dot: string; bg: string; border: string; text: string; line: string }
> = {
  green: { dot: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", text: "#047857", line: "#34D399" },
  red: { dot: "#EF4444", bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", line: "#F87171" },
  grey: { dot: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0", text: "#64748B", line: "#E2E8F0" },
};

function ClaimCycleTimeline({ status }: { status: string }) {
  const colors = claimCycleColors(status);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4">
        Claim Progress
      </h2>
      <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
        {CYCLE_STAGES.map((stage, i) => {
          const c = STAGE_PALETTE[colors[i]];
          const lineColor =
            colors[i + 1] === "grey"
              ? STAGE_PALETTE.grey.line
              : STAGE_PALETTE[colors[i]].line;
          return (
            <Fragment key={stage.key}>
              <div
                style={{ flexShrink: 0, backgroundColor: c.bg, borderColor: c.border }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full border whitespace-nowrap"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: c.dot }}
                  aria-hidden="true"
                />
                <span className="text-xs" style={{ color: c.text }}>
                  <span className="font-semibold">{stage.date}</span>
                  <span className="mx-1 opacity-50">·</span>
                  {stage.label}
                </span>
              </div>
              {i < CYCLE_STAGES.length - 1 && (
                <div
                  aria-hidden="true"
                  style={{
                    flex: "1 1 0%",
                    height: "2px",
                    margin: "0 8px",
                    backgroundColor: lineColor,
                  }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB");
}
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB")} · ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function ClaimDetailView({
  claim,
  employee,
  isFinance = false,
  isOwner = false,
}: {
  claim: ClaimInfo;
  employee: EmployeeInfo;
  isFinance?: boolean;
  isOwner?: boolean;
}) {
  const meta = TYPE_META[claim.claimType] ?? TYPE_META.sales;
  const badge = STATUS_BADGE[claim.status] ?? {
    bg: "#F1F5F9",
    text: "#334155",
    dot: "#64748B",
    label: claim.status,
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAFAFA" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 24px 56px" }}>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-slate-500 flex-wrap mb-5"
        >
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/claim" className="hover:text-slate-900 transition-colors">Claims</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">{claim.displayId}</span>
        </nav>

        {/* Back button */}
        <Link
          href="/claim"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to Claims
        </Link>

        {/* Main card */}
        <div
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
              background: `linear-gradient(135deg, ${meta.accentSoft} 0%, #fff 60%)`,
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
                  border: `1px solid ${meta.accentBorder}`,
                  boxShadow: `0 4px 12px ${meta.accentSoft}`,
                }}
              >
                <meta.Icon
                  size={26}
                  strokeWidth={2}
                  style={{ color: meta.accent }}
                  aria-hidden="true"
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1
                    style={{
                      fontSize: "22px",
                      fontWeight: 700,
                      color: "#171717",
                      lineHeight: 1.15,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {claim.displayId}
                  </h1>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ backgroundColor: badge.bg, color: badge.text }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: badge.dot }}
                      aria-hidden="true"
                    />
                    {badge.label}
                  </span>
                </div>
                <p style={{ fontSize: "13.5px", color: "#737373", marginTop: "4px" }}>
                  {meta.label} · Submitted {formatDateTime(claim.submittedOn)}
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "28px 32px" }}>
            {/* Claim progress — cycle stages coloured by this claim's status */}
            <ClaimCycleTimeline status={claim.status} />

            {/* Amount summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <SummaryCell
                icon={<Receipt size={16} />}
                label="Claim Amount"
                value={`RM ${claim.amount.toFixed(2)}`}
                accent={meta.accent}
              />
              <SummaryCell
                icon={<Receipt size={16} />}
                label="Approved Amount"
                value={
                  claim.approvedAmount !== null
                    ? `RM ${claim.approvedAmount.toFixed(2)}`
                    : "—"
                }
                accent="#737373"
              />
              <SummaryCell
                icon={<Calendar size={16} />}
                label="Claim Date"
                value={formatDate(claim.claimDate)}
                accent="#737373"
              />
            </div>

            <Section title="Employee">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Item icon={<User size={14} />} label="Name" value={employee.name} />
                {employee.nickName && (
                  <Item icon={<User size={14} />} label="Nickname" value={employee.nickName} />
                )}
                <Item icon={<Mail size={14} />} label="Email" value={employee.email} />
                {employee.phone && (
                  <Item icon={<Phone size={14} />} label="Phone" value={employee.phone} />
                )}
                {employee.employeeId && (
                  <Item icon={<Badge size={14} />} label="Employee ID" value={employee.employeeId} />
                )}
                {employee.position && (
                  <Item icon={<Briefcase size={14} />} label="Position" value={employee.position} />
                )}
                <Item
                  icon={<Building2 size={14} />}
                  label="Branch / Department"
                  value={
                    employee.branch
                      ? employee.branchCode
                        ? `${employee.branch} (${employee.branchCode})`
                        : employee.branch
                      : "—"
                  }
                />
              </dl>
            </Section>

            <Divider />

            <Section title="Claim Details">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                    Description
                  </p>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">
                    {claim.description || (
                      <span className="text-slate-400 italic">No description provided.</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    {claim.attachments.length > 1 ? "Attachments" : "Attachment"}
                  </p>
                  {claim.attachments.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {claim.attachments.map((att, i) => (
                        <AttachmentCard
                          key={i}
                          url={att.url ?? ""}
                          filename={att.name.split("/").pop() || "attachment"}
                          exists={att.exists}
                          accent={meta.accent}
                          accentSoft={meta.accentSoft}
                          accentBorder={meta.accentBorder}
                          accentText={meta.accentText}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No attachment.</p>
                  )}
                </div>
                {claim.remarks && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                      Remarks (from finance)
                    </p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{claim.remarks}</p>
                  </div>
                )}
              </div>
            </Section>

            <Divider />

            <Section title="Timeline" icon={<Clock size={14} />}>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Item
                  icon={<FileText size={14} />}
                  label="Submitted on"
                  value={formatDateTime(claim.submittedOn)}
                />
                <Item
                  icon={<RefreshCcw size={14} />}
                  label="Last updated"
                  value={
                    claim.updatedAt === claim.submittedOn
                      ? "—"
                      : formatDateTime(claim.updatedAt)
                  }
                />
              </dl>
            </Section>

            {isFinance && claim.status === "pending" && (
              <>
                <Divider />
                <FinanceReviewPanel
                  claimId={claim.claimId}
                  defaultAmount={claim.amount}
                  meta={meta}
                />
              </>
            )}

            {/* Finance disburses an approved claim. */}
            {isFinance && claim.status === "approved" && (
              <>
                <Divider />
                <ClaimAdvancePanel claimId={claim.claimId} mode="disburse" meta={meta} />
              </>
            )}

            {/* The employee who requested the claim confirms receipt once disbursed. */}
            {isOwner && claim.status === "disbursed" && (
              <>
                <Divider />
                <ClaimAdvancePanel claimId={claim.claimId} mode="receive" meta={meta} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Divider() {
  return <div style={{ height: "1px", backgroundColor: "#F3F4F6" }} />;
}

function SummaryCell({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        borderRadius: "12px",
        border: "1px solid #E5E7EB",
        padding: "16px",
        backgroundColor: "#FAFAFA",
      }}
    >
      <div
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: "#737373" }}
      >
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 text-lg font-bold tabular-nums" style={{ color: "#171717" }}>
        {value}
      </p>
    </div>
  );
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function AttachmentCard({
  url,
  filename,
  exists,
  accent,
  accentSoft,
  accentBorder,
  accentText,
}: {
  url: string;
  filename: string;
  exists: boolean;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;
}) {
  const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const typeLabel = ext
    ? ext.replace(".", "").toUpperCase() + (isImage ? " Image" : " Document")
    : "File";

  if (!exists) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "14px",
          borderRadius: "14px",
          border: "1px dashed #FCA5A5",
          backgroundColor: "#FEF2F2",
          maxWidth: "520px",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "10px",
            display: "grid",
            placeItems: "center",
            backgroundColor: "#fff",
            border: "1px solid #FECACA",
            flexShrink: 0,
          }}
        >
          <XCircle size={20} strokeWidth={1.75} style={{ color: "#DC2626" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "13.5px",
              fontWeight: 600,
              color: "#7F1D1D",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={filename}
          >
            {filename}
          </p>
          <p style={{ fontSize: "12px", color: "#991B1B", marginTop: "2px", lineHeight: 1.4 }}>
            File is not available on the server. Please re-upload.
          </p>
        </div>
      </div>
    );
  }

  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: "14px",
          padding: "14px",
          borderRadius: "14px",
          border: "1px solid #E5E7EB",
          backgroundColor: "#fff",
          maxWidth: "520px",
        }}
      >
        {/* Thumbnail / icon */}
        {isImage ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Preview image"
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "10px",
              overflow: "hidden",
              flexShrink: 0,
              padding: 0,
              backgroundColor: accentSoft,
              border: `1px solid ${accentBorder}`,
              cursor: "zoom-in",
              display: "block",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={filename}
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
              width: "56px",
              height: "56px",
              borderRadius: "10px",
              overflow: "hidden",
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              backgroundColor: accentSoft,
              border: `1px solid ${accentBorder}`,
            }}
          >
            <FileType2 size={22} strokeWidth={1.75} style={{ color: accent }} />
          </div>
        )}

        {/* Filename + type */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: "13.5px",
              fontWeight: 600,
              color: "#171717",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={filename}
          >
            {filename}
          </p>
          <p
            style={{
              fontSize: "11.5px",
              color: "#737373",
              marginTop: "2px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Paperclip size={11} aria-hidden="true" />
            {typeLabel}
            {isImage && (
              <span style={{ color: accent, fontWeight: 500 }}>
                · Click thumbnail to preview
              </span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {!isImage && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-90 transition-opacity"
              style={{
                height: "36px",
                padding: "0 14px",
                borderRadius: "8px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: accent,
                color: "#fff",
                fontSize: "12.5px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <ExternalLink size={13} aria-hidden="true" />
              View
            </a>
          )}
          <a
            href={`${url}${url.includes("?") ? "&" : "?"}download=1`}
            download={filename}
            className="hover:bg-neutral-50 transition-colors"
            style={{
              height: "36px",
              padding: "0 14px",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#fff",
              border: `1px solid ${accentBorder}`,
              color: accentText,
              fontSize: "12.5px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Download size={13} aria-hidden="true" />
            Download
          </a>
        </div>
      </div>

      {lightboxOpen && isImage && (
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
            <XCircle size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={filename}
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
    </>
  );
}

function Item({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

interface ReviewMeta {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  accentText: string;
}

function FinanceReviewPanel({
  claimId,
  defaultAmount,
  meta,
}: {
  claimId: number;
  defaultAmount: number;
  meta: ReviewMeta;
}) {
  const [approvedAmount, setApprovedAmount] = useState(defaultAmount.toFixed(2));
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const remarksRef = useRef<HTMLTextAreaElement>(null);

  const doReview = (action: "approve" | "reject") => {
    setError(null);

    if (action === "reject" && remarks.trim().length === 0) {
      setError("Please provide a reason in Remarks before rejecting.");
      remarksRef.current?.focus();
      return;
    }

    const fd = new FormData();
    fd.append("claim_id", String(claimId));
    fd.append("action", action);
    fd.append("remarks", remarks);
    if (action === "approve") fd.append("approved_amount", approvedAmount);

    startTransition(async () => {
      const result = await reviewClaim(null, fd);
      if (!result.ok) {
        setError(result.error ?? "Failed to update claim.");
      }
    });
  };

  const inputFocus = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = meta.accent;
    e.currentTarget.style.boxShadow = `0 0 0 4px ${meta.accentSoft}`;
  };
  const inputBlur = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "#E5E7EB";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <section
      style={{
        borderRadius: "16px",
        border: `1px solid ${meta.accentBorder}`,
        backgroundColor: meta.accentSoft,
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "18px",
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
            border: `1px solid ${meta.accentBorder}`,
          }}
        >
          <CheckCircle2 size={16} style={{ color: meta.accent }} aria-hidden="true" />
        </div>
        <div>
          <h2
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: meta.accentText,
              letterSpacing: "-0.005em",
            }}
          >
            Finance Review
          </h2>
          <p style={{ fontSize: "12px", color: meta.accentText, opacity: 0.75 }}>
            Approve or reject this claim.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div>
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
              marginBottom: "8px",
            }}
          >
            <Receipt size={13} strokeWidth={2.5} aria-hidden="true" />
            Approved Amount
          </label>
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
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value)}
              onFocus={inputFocus}
              onBlur={inputBlur}
              style={{
                width: "100%",
                height: "44px",
                padding: "0 16px 0 46px",
                borderRadius: "10px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                color: "#171717",
                outline: "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            />
          </div>
          <p
            style={{
              marginTop: "6px",
              fontSize: "11.5px",
              color: "#737373",
              lineHeight: 1.5,
            }}
          >
            Defaults to claim amount. Edit for partial approval.
          </p>
        </div>

        <div>
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
              marginBottom: "8px",
            }}
          >
            <FileText size={13} strokeWidth={2.5} aria-hidden="true" />
            Remarks
            <span
              style={{
                marginLeft: "4px",
                textTransform: "none",
                letterSpacing: "normal",
                fontSize: "11px",
                fontWeight: 500,
                color: "#A3A3A3",
              }}
            >
              · required to reject
            </span>
          </label>
          <textarea
            ref={remarksRef}
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            onFocus={inputFocus}
            onBlur={inputBlur}
            placeholder="Optional for approval · required when rejecting…"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid #E5E7EB",
              backgroundColor: "#fff",
              fontSize: "14px",
              color: "#171717",
              outline: "none",
              resize: "none",
              lineHeight: 1.55,
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
            borderRadius: "10px",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            padding: "12px 14px",
            marginBottom: "16px",
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
              marginTop: "1px",
              flexShrink: 0,
            }}
          >
            !
          </div>
          <p style={{ fontSize: "12.5px", color: "#991B1B", lineHeight: 1.55 }}>{error}</p>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "10px",
          paddingTop: "16px",
          borderTop: `1px dashed ${meta.accentBorder}`,
        }}
      >
        <button
          type="button"
          onClick={() => doReview("reject")}
          disabled={isPending}
          style={{
            height: "44px",
            padding: "0 20px",
            borderRadius: "10px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#fff",
            border: "1px solid #FECACA",
            color: "#B91C1C",
            fontSize: "13.5px",
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            transition: "background-color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (isPending) return;
            e.currentTarget.style.backgroundColor = "#FEF2F2";
          }}
          onMouseLeave={(e) => {
            if (isPending) return;
            e.currentTarget.style.backgroundColor = "#fff";
          }}
        >
          <XCircle size={15} aria-hidden="true" />
          Reject
        </button>
        <button
          type="button"
          onClick={() => doReview("approve")}
          disabled={isPending}
          style={{
            height: "44px",
            padding: "0 22px",
            borderRadius: "10px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: isPending ? "#D4D4D4" : meta.accent,
            color: "#fff",
            fontSize: "13.5px",
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            boxShadow: isPending ? "none" : `0 4px 12px ${meta.accentSoft}`,
            transition: "background-color 0.15s, box-shadow 0.15s",
            border: "none",
          }}
        >
          <CheckCircle2 size={15} aria-hidden="true" />
          {isPending ? "Saving…" : "Approve Claim"}
        </button>
      </div>
    </section>
  );
}

function ClaimAdvancePanel({
  claimId,
  mode,
  meta,
}: {
  claimId: number;
  mode: "disburse" | "receive";
  meta: ReviewMeta;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDisburse = mode === "disburse";
  const action = mode;
  const cta = isDisburse ? "Mark as Disbursed" : "Mark as Received";
  const title = isDisburse ? "Disbursement" : "Confirm Receipt";
  const desc = isDisburse
    ? "Mark this approved claim as disbursed once payment has been made."
    : "Confirm you have received this claim's payment.";
  const Icon = isDisburse ? Receipt : CheckCircle2;

  const doAdvance = () => {
    setError(null);
    const fd = new FormData();
    fd.append("claim_id", String(claimId));
    fd.append("action", action);
    startTransition(async () => {
      const result = await advanceClaim(null, fd);
      if (!result.ok) setError(result.error ?? "Failed to update claim.");
    });
  };

  return (
    <section
      style={{
        borderRadius: "16px",
        border: `1px solid ${meta.accentBorder}`,
        backgroundColor: meta.accentSoft,
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "18px",
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
            border: `1px solid ${meta.accentBorder}`,
          }}
        >
          <Icon size={16} style={{ color: meta.accent }} aria-hidden="true" />
        </div>
        <div>
          <h2
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: meta.accentText,
              letterSpacing: "-0.005em",
            }}
          >
            {title}
          </h2>
          <p style={{ fontSize: "12px", color: meta.accentText, opacity: 0.75 }}>{desc}</p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
            borderRadius: "10px",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            padding: "12px 14px",
            marginBottom: "16px",
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
              marginTop: "1px",
              flexShrink: 0,
            }}
          >
            !
          </div>
          <p style={{ fontSize: "12.5px", color: "#991B1B", lineHeight: 1.55 }}>{error}</p>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingTop: "16px",
          borderTop: `1px dashed ${meta.accentBorder}`,
        }}
      >
        <button
          type="button"
          onClick={doAdvance}
          disabled={isPending}
          style={{
            height: "44px",
            padding: "0 22px",
            borderRadius: "10px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: isPending ? "#D4D4D4" : meta.accent,
            color: "#fff",
            fontSize: "13.5px",
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            boxShadow: isPending ? "none" : `0 4px 12px ${meta.accentSoft}`,
            transition: "background-color 0.15s, box-shadow 0.15s",
            border: "none",
          }}
        >
          <Icon size={15} aria-hidden="true" />
          {isPending ? "Saving…" : cta}
        </button>
      </div>
    </section>
  );
}
