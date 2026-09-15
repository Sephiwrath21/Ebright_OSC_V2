// ─────────────────────────────────────────────────────────────
// Hotfix log — curation input validation.
//
// Entries themselves come from commits (see derive.ts); the only thing a
// person supplies is curation — a reworded title, or hiding an entry. This
// schema is what keeps the API from accepting anything else, which is what
// guarantees a re-sync can never be undone by a stray write.
// ─────────────────────────────────────────────────────────────

import { z } from "zod";

export const TITLE_MAX = 300;

export const hotfixCurateSchema = z
  .object({
    /**
     * Human rewrite of the commit subject. An empty string clears the override
     * and falls back to what the sync derived — that is deliberate, and why
     * this is not `.min(1)`.
     */
    titleOverride: z.string().trim().max(TITLE_MAX).nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((v) => v.titleOverride !== undefined || v.hidden !== undefined, {
    message: "Nothing to update",
  });

export type HotfixCurateInput = z.infer<typeof hotfixCurateSchema>;

/** What the list endpoint returns, after the override is resolved. */
export type HotfixEntry = {
  id: number;
  commitSha: string;
  shippedOn: string;
  category: string;
  tag: string;
  /** titleOverride when set, else the derived commit subject. */
  title: string;
  /** The underlying commit subject, so the UI can show what was overridden. */
  originalTitle: string;
  titleOverride: string | null;
  details: string;
  authorName: string | null;
  hidden: boolean;
  curatedByName: string | null;
};

/** A date's worth of entries, grouped into category sections. */
export type HotfixDateGroup = {
  /** YYYY-MM-DD */
  date: string;
  sections: { category: string; entries: HotfixEntry[] }[];
};

/**
 * Group flat entries into the changelog's shape: date header → category
 * section → tagged bullets. Input must already be sorted newest-date-first;
 * categories are alphabetical within a date, except General which leads
 * because it is the catch-all people scan first.
 */
export function groupEntries(entries: HotfixEntry[]): HotfixDateGroup[] {
  const byDate = new Map<string, Map<string, HotfixEntry[]>>();

  for (const entry of entries) {
    let categories = byDate.get(entry.shippedOn);
    if (!categories) {
      categories = new Map();
      byDate.set(entry.shippedOn, categories);
    }
    const list = categories.get(entry.category);
    if (list) list.push(entry);
    else categories.set(entry.category, [entry]);
  }

  return [...byDate.entries()].map(([date, categories]) => ({
    date,
    sections: [...categories.entries()]
      .map(([category, list]) => ({ category, entries: list }))
      .sort((a, b) => {
        if (a.category === "General") return -1;
        if (b.category === "General") return 1;
        return a.category.localeCompare(b.category);
      }),
  }));
}
