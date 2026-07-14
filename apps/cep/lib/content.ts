/** Content.planTypes is stored as a JSON string array, e.g. '["3mo","12mo"]' or '["all"]'. */
export function parsePlanTypes(planTypes: string | null): string[] {
  if (!planTypes) return ['all'];
  try {
    const parsed = JSON.parse(planTypes);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : ['all'];
  } catch {
    return ['all'];
  }
}

export function stringifyPlanTypes(planTypes: string[]): string {
  return JSON.stringify(planTypes.length > 0 ? planTypes : ['all']);
}

/** Does this Content row apply to the given parent plan_type? Untagged/'all' content matches everyone. */
export function contentAppliesToPlan(planTypes: string | null, parentPlanType: string | null | undefined): boolean {
  const tags = parsePlanTypes(planTypes);
  if (tags.includes('all')) return true;
  if (!parentPlanType) return false;
  return tags.includes(parentPlanType);
}
