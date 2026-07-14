// Single source of truth for claim type ids and labels.
// NOTE: claim.claim_type is VarChar(20) in the DB — keep every id ≤ 20 chars.
export const CLAIM_TYPES = [
  { id: "sales", label: "Sales Claim", shortLabel: "Sales" },
  { id: "health", label: "Health Claim", shortLabel: "Health" },
  { id: "transport", label: "Transport Claim", shortLabel: "Transport" },
  {
    id: "sales_incentive",
    label: "Salesperson Incentive",
    shortLabel: "Salesperson Inc",
  },
  { id: "renewal_incentive", label: "Renewal Incentive", shortLabel: "Renewal Inc." },
  { id: "ot", label: "Overtime (OT)", shortLabel: "OT" },
  { id: "branch_rank_reward", label: "Branch Ranking Reward", shortLabel: "Branch Reward" },
  { id: "jackpot", label: "Jackpot", shortLabel: "Jackpot" },
  { id: "class", label: "Class Claim", shortLabel: "Class" },
  { id: "roadshow", label: "Roadshow Claim", shortLabel: "Roadshow" },
  { id: "showcase", label: "Showcase Claim", shortLabel: "Showcase" },
  { id: "internship", label: "Internship Claim", shortLabel: "Internship" },
  { id: "part_time", label: "Part Time Claim", shortLabel: "Part Time" },
  { id: "rm_incentive", label: "Regional Manager Incentive", shortLabel: "RM Incentive" },
  { id: "trainer", label: "Trainer Claim", shortLabel: "Trainer" },
  { id: "referral", label: "Referral Claim", shortLabel: "Referral" },
] as const;

export type ClaimType = (typeof CLAIM_TYPES)[number]["id"];

export const CLAIM_TYPE_IDS = CLAIM_TYPES.map((t) => t.id) as ClaimType[];

export function isClaimType(value: string): value is ClaimType {
  return (CLAIM_TYPE_IDS as readonly string[]).includes(value);
}

export const CLAIM_TYPE_LABELS = Object.fromEntries(
  CLAIM_TYPES.map((t) => [t.id, t.label]),
) as Record<ClaimType, string>;

export const CLAIM_TYPE_SHORT_LABELS = Object.fromEntries(
  CLAIM_TYPES.map((t) => [t.id, t.shortLabel]),
) as Record<ClaimType, string>;

// The original three types collect a single receipt/MC. The newer incentive &
// reward types instead collect multiple supporting documents and evidence files.
const MULTI_DOC_CLAIM_TYPES: readonly ClaimType[] = [
  "sales_incentive",
  "renewal_incentive",
  "ot",
  "branch_rank_reward",
  "jackpot",
  "class",
  "roadshow",
  "showcase",
  "internship",
  "part_time",
  "rm_incentive",
  "trainer",
  "referral",
];

export function usesMultiDoc(type: string): boolean {
  return (MULTI_DOC_CLAIM_TYPES as readonly string[]).includes(type);
}

// Max number of supporting documents for multi-doc claims. Drive IDs are stored
// comma-separated in claim.attachment (VarChar(500)); 10 IDs fit comfortably.
export const MAX_CLAIM_DOCS = 10;

// ---------------------------------------------------------------------------
// Position-based access. `position` is employment.position (session.user.position),
// e.g. "FT CEO", "FT HOD", "FT EXEC", "BM", "FT COACH", "PT COACH", "INTERN".
// ---------------------------------------------------------------------------
function normPosition(position: string | null): string {
  return (position ?? "").toUpperCase().trim();
}

export function isCoachOrExec(position: string | null): boolean {
  const p = normPosition(position);
  return p.includes("COACH") || p.includes("EXEC");
}

export function isBranchManager(position: string | null): boolean {
  const p = normPosition(position);
  return p === "BM" || p === "BRANCH MANAGER";
}

function isMarketingEmail(email: string | null): boolean {
  return (email ?? "").toLowerCase().trim() === "marketing@ebright.my";
}

function isMarketingDepartment(department: string | null): boolean {
  return (department ?? "").toLowerCase().trim() === "marketing";
}

// Claim types restricted to specific positions or email addresses. Types not
// listed are open to all.
const CLAIM_TYPE_ACCESS: Record<string, (ctx: ClaimTypeAccessContext) => boolean> = {
  class: ({ position }) => isCoachOrExec(position),
  branch_rank_reward: ({ position }) => isBranchManager(position),
  jackpot: ({ position }) => isBranchManager(position),
  roadshow: ({ email, department }) =>
    isMarketingEmail(email) || isMarketingDepartment(department),
  showcase: ({ email, department }) =>
    isMarketingEmail(email) || isMarketingDepartment(department),
};

export type ClaimTypeAccessContext = {
  position: string | null;
  roleType: string | null;
  email: string | null;
  department: string | null;
};

export function canAccessClaimType(type: string, ctx: ClaimTypeAccessContext): boolean {
  // Position restrictions apply to everyone, including superadmins.
  const guard = CLAIM_TYPE_ACCESS[type];
  return guard ? guard(ctx) : true;
}

// Claim types that require at least one supporting document before submitting
// (e.g. invoice + WhatsApp screenshot, or a manpower-schedule screenshot).
const ATTACHMENT_REQUIRED_TYPES: readonly string[] = [
  "sales_incentive",
  "renewal_incentive",
  "referral",
];

export function requiresAttachment(type: string): boolean {
  return ATTACHMENT_REQUIRED_TYPES.includes(type);
}
