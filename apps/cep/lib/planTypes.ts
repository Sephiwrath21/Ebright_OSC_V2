export const PLAN_TYPES = ['3mo', '6mo', '9mo', '12mo'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_TYPE_LABELS: Record<string, string> = {
  '3mo': '3 months',
  '6mo': '6 months',
  '9mo': '9 months',
  '12mo': '12 months',
};

/** Best-effort plan_type for a given program duration (months), matching prisma/seed.ts's convention. */
export function planTypeFromDuration(months: number): string | null {
  if (PLAN_TYPES.includes(`${months}mo` as PlanType)) return `${months}mo`;
  return null;
}
