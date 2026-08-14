// Pure grouping logic for the Overview card redesign (2026-08-12) — no
// Prisma, no fetch, just array reshaping, so it's unit-tested directly
// (see entity-card-grouping.test.ts) unlike the Prisma-touching data layer
// elsewhere in this module.
import type { FlowCategoryOption, FlowDrillTask, FlowMemberRollup } from "./types";

export interface PersonCard {
  userId: string;
  name: string;
  tasks: FlowDrillTask[];
}

/** One card per roster member (even zero-task ones), each holding every
 *  task assigned to them across all three status buckets. `onlyMe`
 *  (View All/Only Me, 2026-08-12) — when given, returns just that one
 *  person's card. */
export function groupTasksByPerson(
  members: FlowMemberRollup[],
  tasks: FlowDrillTask[],
  onlyMe?: string,
): PersonCard[] {
  const scopedMembers = onlyMe ? members.filter((m) => m.userId === onlyMe) : members;
  return scopedMembers.map((m) => ({
    userId: m.userId,
    name: m.name,
    tasks: tasks.filter((t) => t.assigneeId === m.userId),
  }));
}

export const UNCATEGORIZED_CARD_ID = "uncategorized";

export interface CategoryCard {
  id: string;
  name: string;
  tasks: FlowDrillTask[];
}

/** One card per active category (even zero-task ones), plus exactly one
 *  trailing "Uncategorized" catch-all card (always present, even when
 *  empty) — every task is visible somewhere, per the confirmed spec.
 *  `onlyMe` scopes each card's task LIST to one person, without hiding
 *  empty-for-them categories (unlike groupTasksByPerson, which drops whole
 *  cards for onlyMe — Type-sort's "Only Me" means "my tasks broken down by
 *  category", not "just my one category"). */
export function groupTasksByCategory(
  categories: FlowCategoryOption[],
  tasks: FlowDrillTask[],
  onlyMe?: string,
): CategoryCard[] {
  const scopedTasks = onlyMe ? tasks.filter((t) => t.assigneeId === onlyMe) : tasks;
  const knownIds = new Set(categories.map((c) => c.id));
  const categoryCards = categories.map((c) => ({
    id: c.id,
    name: c.name,
    tasks: scopedTasks.filter((t) => t.categoryId === c.id),
  }));
  const uncategorized = {
    id: UNCATEGORIZED_CARD_ID,
    name: "Uncategorized",
    // Catches genuinely-uncategorized tasks AND tasks whose categoryId
    // points at a historically-archived category (2026-08-15: category
    // archiving/renaming was removed along with the standalone admin page —
    // categories can now only be created, never archived, going forward —
    // but any category archived before then still has archivedAt set, is
    // excluded from listActiveTaskCategories, and never had its FK on
    // already-assigned tasks touched) — without this, such a task matches
    // no categoryCards entry and isn't `=== null`, so it would silently
    // disappear from every card.
    tasks: scopedTasks.filter((t) => t.categoryId === null || !knownIds.has(t.categoryId)),
  };
  return [...categoryCards, uncategorized];
}
