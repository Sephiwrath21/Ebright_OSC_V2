import { describe, expect, it } from "vitest";

import { primaryNav, secondaryNav, type NavItem } from "./Sidebar";

function flatten(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flatten(item.children) : [])]);
}

const allItems = [...flatten(primaryNav), ...flatten(secondaryNav)];

describe("Sidebar nav config", () => {
  it("points the SMS entry at the live external app, as a leaf link", () => {
    const sms = primaryNav.find((item) => item.name === "SMS");

    expect(sms).toBeDefined();
    expect(sms?.href).toBe("https://staging-sms.ebright.my/");
    expect(sms?.external).toBe(true);
    // Boundary condition: a leaf link must not also carry children, or the
    // renderer treats it as a toggle-only dropdown and the href is never
    // followed on click (the exact bug this entry used to have).
    expect(sms?.children).toBeUndefined();
  });

  it("never pairs `external: true` with `children` on any nav item", () => {
    // Structural invariant, not just an SMS-specific check: per the
    // renderer's own contract ("Leaf items navigate; items with children
    // toggle instead"), an external item with children would be
    // unreachable by click, same failure mode as the SMS entry had.
    const offenders = allItems.filter((item) => item.external && item.children?.length);

    expect(offenders).toEqual([]);
  });

  it("gives every external item a followable href", () => {
    // What this guards is the SMS bug: an `external` entry that the renderer
    // hands to a plain <a> with nothing usable to navigate to. Two shapes are
    // legitimate. A different app entirely (SMS, Inventory) is an absolute
    // https:// URL. A route of THIS app can also be marked external —
    // Flowghan renders its own full-page chrome, so it opens in a new tab
    // instead of inside the portal shell — and its href is a same-app
    // absolute path. Both are followable; an empty or fragment-only href is
    // the thing that must still fail.
    const externalItems = allItems.filter((item) => item.external);

    expect(externalItems.length).toBeGreaterThan(0);
    for (const item of externalItems) {
      expect(item.href).toMatch(/^(?:https:\/\/|\/)/);
    }
  });

  it("gives every non-external leaf item (no children) a same-app relative href", () => {
    // Edge case worth pinning: internal leaves should never accidentally
    // carry a bare external domain without `external: true` set, which
    // would skip the noopener/noreferrer + target=_blank handling.
    const internalLeaves = allItems.filter((item) => !item.external && !item.children?.length);

    for (const item of internalLeaves) {
      expect(item.href).toBeTruthy();
      expect(item.href).toMatch(/^\//);
    }
  });
});
