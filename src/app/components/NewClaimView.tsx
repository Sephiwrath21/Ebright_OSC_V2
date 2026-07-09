"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { canAccessClaimType } from "@/app/claim/claim-types";
import {
  Home,
  ChevronRight,
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
  LayoutGrid,
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface ClaimType {
  id: string;
  title: string;
  description: string;
  href: string;
  Icon: IconComponent;
  iconBg: string;
  iconBgHover: string;
}

const claimTypes: ClaimType[] = [
  {
    id: "sales",
    title: "Sales Claim",
    description: "Process your sales reimbursements and commission-related expenses.",
    href: "/claim/new/sales",
    Icon: TrendingUp,
    iconBg: "#3b82f6",
    iconBgHover: "#2563eb",
  },
  {
    id: "health",
    title: "Health Claim",
    description: "Process your medical, dental, and healthcare reimbursements.",
    href: "/claim/new/health",
    Icon: HeartPulse,
    iconBg: "#10b981",
    iconBgHover: "#059669",
  },
  {
    id: "transport",
    title: "Transport",
    description: "Process your transport, mileage, and travel reimbursements.",
    href: "/claim/new/transport",
    Icon: Car,
    iconBg: "#f97316",
    iconBgHover: "#ea580c",
  },
  {
    id: "sales_incentive",
    title: "Salesperson Incentive",
    description: "Claim your incentive for new business won.",
    href: "/claim/new/sales_incentive",
    Icon: UserPlus,
    iconBg: "#4f46e5",
    iconBgHover: "#4338ca",
  },
  {
    id: "renewal_incentive",
    title: "Renewal Incentive",
    description: "Claim your incentive for renewed policies.",
    href: "/claim/new/renewal_incentive",
    Icon: RefreshCw,
    iconBg: "#0891b2",
    iconBgHover: "#0e7490",
  },
  {
    id: "ot",
    title: "Overtime (OT)",
    description: "Claim reimbursement for approved overtime hours.",
    href: "/claim/new/ot",
    Icon: Timer,
    iconBg: "#7c3aed",
    iconBgHover: "#6d28d9",
  },
  {
    id: "branch_rank_reward",
    title: "Branch Ranking Reward",
    description: "Claim your reward for branch performance ranking.",
    href: "/claim/new/branch_rank_reward",
    Icon: Trophy,
    iconBg: "#e11d48",
    iconBgHover: "#be123c",
  },
  {
    id: "jackpot",
    title: "Jackpot",
    description: "Claim your jackpot reward payout.",
    href: "/claim/new/jackpot",
    Icon: Sparkles,
    iconBg: "#d97706",
    iconBgHover: "#b45309",
  },
  {
    id: "class",
    title: "Class Claim",
    description: "For coaches and executives running classes.",
    href: "/claim/new/class",
    Icon: GraduationCap,
    iconBg: "#6366f1",
    iconBgHover: "#4f46e5",
  },
  {
    id: "roadshow",
    title: "Roadshow",
    description: "Marketing roadshow expenses and evidence.",
    href: "/claim/new/roadshow",
    Icon: Megaphone,
    iconBg: "#d946ef",
    iconBgHover: "#c026d3",
  },
  {
    id: "showcase",
    title: "Showcase",
    description: "Marketing showcase expenses and evidence.",
    href: "/claim/new/showcase",
    Icon: Store,
    iconBg: "#0ea5e9",
    iconBgHover: "#0284c7",
  },
  {
    id: "internship",
    title: "Internship Claim",
    description: "For interns claiming related expenses.",
    href: "/claim/new/internship",
    Icon: Backpack,
    iconBg: "#84cc16",
    iconBgHover: "#65a30d",
  },
  {
    id: "part_time",
    title: "Part Time Claim",
    description: "Reimbursement for part-time work.",
    href: "/claim/new/part_time",
    Icon: Hourglass,
    iconBg: "#06b6d4",
    iconBgHover: "#0891b2",
  },
  {
    id: "rm_incentive",
    title: "Regional Manager Incentive",
    description: "Incentive claim for regional managers.",
    href: "/claim/new/rm_incentive",
    Icon: Crown,
    iconBg: "#7c3aed",
    iconBgHover: "#6d28d9",
  },
  {
    id: "trainer",
    title: "Trainer Claim",
    description: "For trainers claiming related expenses.",
    href: "/claim/new/trainer",
    Icon: Presentation,
    iconBg: "#f43f5e",
    iconBgHover: "#e11d48",
  },
  {
    id: "referral",
    title: "Referral Claim",
    description: "Claim your referral reward.",
    href: "/claim/new/referral",
    Icon: Share2,
    iconBg: "#16a34a",
    iconBgHover: "#15803d",
  },
];

// Grouped separately under an "Other Claims" section on the picker.
const OTHER_CLAIM_IDS = new Set(["part_time", "ot", "rm_incentive"]);
const mainTypes = claimTypes.filter((t) => !OTHER_CLAIM_IDS.has(t.id));
const otherTypes = claimTypes.filter((t) => OTHER_CLAIM_IDS.has(t.id));

function ClaimTypeCard({ type }: { type: ClaimType }) {
  const { title, description, href, Icon, iconBg } = type;
  return (
    <li>
      <Link
        href={href}
        className="group block h-full bg-white border border-slate-200 rounded-2xl p-8 text-center transition-all duration-200 hover:border-slate-300 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        <div
          className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-105"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="w-8 h-8 text-white" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-base font-bold uppercase tracking-wide text-slate-900 transition-colors group-hover:text-blue-700">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{description}</p>
      </Link>
    </li>
  );
}

function OtherClaimsCard({ types }: { types: ClaimType[] }) {
  return (
    <li>
      <div className="h-full bg-white border border-slate-200 rounded-2xl p-6 flex flex-col transition-all duration-200 hover:border-slate-300 hover:shadow-lg">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shrink-0 shadow-sm">
            <LayoutGrid className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold uppercase tracking-wide text-slate-900">
                Other Claims
              </h2>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 leading-none">
                {types.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">More claim categories</p>
          </div>
        </div>
        <ul className="flex flex-col gap-2.5">
          {types.map(({ id, title, href, Icon, iconBg }) => (
            <li key={id}>
              <Link
                href={href}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-3 transition-all duration-200 hover:border-transparent hover:bg-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundColor: iconBg }}
                >
                  <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                  {title}
                </span>
                <ChevronRight
                  className="w-4 h-4 text-slate-300 ml-auto shrink-0 transition-all duration-200 group-hover:text-slate-500 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export default function NewClaimView({
  position = null,
  roleType = null,
  email = null,
  department = null,
}: {
  position?: string | null;
  roleType?: string | null;
  email?: string | null;
  department?: string | null;
}) {
  const ctx = { position, roleType, email, department };
  const visibleMain = mainTypes.filter((t) => canAccessClaimType(t.id, ctx));
  const visibleOther = otherTypes.filter((t) => canAccessClaimType(t.id, ctx));

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 pt-4 pb-10 space-y-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="flex items-center gap-1 hover:text-slate-900 transition-colors">
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Home</span>
          </Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/dashboards/hrms" className="hover:text-slate-900 transition-colors">HRMS</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <Link href="/claim" className="hover:text-slate-900 transition-colors">Claims</Link>
          <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
          <span className="text-slate-900 font-medium">New</span>
        </nav>

        <header>
          <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">
            Select Claim Type
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose a category to submit your claim.
          </p>
        </header>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {visibleMain.map((type) => (
            <ClaimTypeCard key={type.id} type={type} />
          ))}
          {visibleOther.length > 0 && <OtherClaimsCard types={visibleOther} />}
        </ul>
      </div>
    </div>
  );
}
