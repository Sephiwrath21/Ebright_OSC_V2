// OSC integration package — shared per-person color identity. One hash, one
// hue list, used everywhere a specific person needs a consistent color: the
// Manpower Schedule grid's cell selects and Task Manager's avatars. Same
// person → same hue in both places. Deliberately not Tailwind's plain
// default blue/gray — a fuller accent rotation instead.

// The `light` pills carry dark companions: a -100 fill would read as a bright
// patch inside the dark schedule grid. Ten distinct hues either way, so a
// person keeps a recognisable colour in both themes. `solid` needs none — a
// -600 fill with white text is legible on any background.
const HUES = [
  { light: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", solid: "bg-blue-600" },
  { light: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", solid: "bg-emerald-600" },
  { light: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", solid: "bg-amber-600" },
  { light: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200", solid: "bg-rose-600" },
  { light: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200", solid: "bg-violet-600" },
  { light: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200", solid: "bg-cyan-600" },
  { light: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", solid: "bg-orange-600" },
  { light: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200", solid: "bg-lime-600" },
  { light: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200", solid: "bg-pink-600" },
  { light: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", solid: "bg-teal-600" },
] as const;

function hashString(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

/** Light pill treatment (bg-X-100/text-X-800) — Manpower Schedule's cells. */
export function personLightColor(id: string): string {
  return HUES[hashString(id) % HUES.length].light;
}

/** Solid treatment (bg-X-600, pair with white text) — avatar circles. */
export function personSolidColor(id: string): string {
  return HUES[hashString(id) % HUES.length].solid;
}
