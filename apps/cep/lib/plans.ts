export const getPlanDurationMonths = (planType: string | null): number => {
  if (!planType) return 0;
  const planMonthsMap: Record<string, number> = { '3mo': 3, '6mo': 6, '9mo': 9, '12mo': 12 };
  return planMonthsMap[planType] ?? 0;
};