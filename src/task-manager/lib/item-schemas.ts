// Schema-driven checklist items (spec §3 "Forms" row):
// one zod pair per ItemType — `config` drives the canvas properties panel,
// `value` drives run-time validation of submitted answers.
// The canvas editor renders the properties panel from configSchema;
// the run UI + engine validate submissions with valueSchema.

import { z } from "zod";
import type { ItemType } from "@/generated/task-manager-client";

// ---------- per-type CONFIG schemas (stored in BlockItem.config) ----------

export const itemConfigSchemas = {
  CHECKBOX: z.object({}).strict(),
  TEXT: z
    .object({
      placeholder: z.string().max(200).optional(),
      multiline: z.boolean().optional(),
      minLength: z.number().int().min(0).optional(),
      maxLength: z.number().int().min(1).optional(),
    })
    .strict(),
  YES_NO: z.object({}).strict(),
  NUMBER: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      unit: z.string().max(20).optional(),
    })
    .strict(),
  DROPDOWN: z
    .object({
      options: z.array(z.string().min(1).max(100)).min(1),
    })
    .strict(),
  DUE_DATE: z
    .object({
      // when true, submitting this item also sets/overrides RunBlock.dueAt
      setsBlockDue: z.boolean().optional(),
    })
    .strict(),
  FILE_UPLOAD: z
    .object({
      accept: z.string().max(200).optional(), // e.g. ".pdf,image/*"
      maxSizeMb: z.number().min(0.1).max(100).optional(),
    })
    .strict(),
  APPROVAL: z
    .object({
      requireNote: z.boolean().optional(),
    })
    .strict(),
  SUB_ASSIGNEE_TASK: z
    .object({
      description: z.string().max(500).optional(),
    })
    .strict(),
  IMAGE_EMBED: z
    .object({
      url: z.string().url().optional(), // design-time embedded image (reference material)
      caption: z.string().max(300).optional(),
    })
    .strict(),
} satisfies Record<ItemType, z.ZodTypeAny>;

// ---------- per-type VALUE schemas (stored in RunItem.value) ----------

export const itemValueSchemas = {
  CHECKBOX: z.object({ type: z.literal("CHECKBOX"), checked: z.boolean() }),
  TEXT: z.object({ type: z.literal("TEXT"), text: z.string().min(1).max(10_000) }),
  YES_NO: z.object({ type: z.literal("YES_NO"), answer: z.enum(["yes", "no"]) }),
  NUMBER: z.object({ type: z.literal("NUMBER"), number: z.number().finite() }),
  DROPDOWN: z.object({ type: z.literal("DROPDOWN"), selected: z.string().min(1) }),
  DUE_DATE: z.object({ type: z.literal("DUE_DATE"), date: z.string().datetime() }),
  FILE_UPLOAD: z.object({
    type: z.literal("FILE_UPLOAD"),
    fileKey: z.string().min(1),
    fileName: z.string().min(1).max(300),
    size: z.number().int().min(0),
    contentType: z.string().min(1).max(200),
  }),
  APPROVAL: z.object({
    type: z.literal("APPROVAL"),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2_000).optional(),
  }),
  SUB_ASSIGNEE_TASK: z.object({
    type: z.literal("SUB_ASSIGNEE_TASK"),
    assigneeId: z.string().min(1),
    done: z.boolean(),
    note: z.string().max(2_000).optional(),
  }),
  IMAGE_EMBED: z.object({
    type: z.literal("IMAGE_EMBED"),
    imageKey: z.string().optional(),
    url: z.string().url().optional(),
    caption: z.string().max(300).optional(),
  }),
} satisfies Record<ItemType, z.ZodTypeAny>;

// A value counts as "complete" only if it passes its schema AND satisfies
// type-specific completion semantics (e.g. an unchecked checkbox is not complete).
export function isValueComplete(type: ItemType, value: unknown): boolean {
  const parsed = itemValueSchemas[type].safeParse(value);
  if (!parsed.success) return false;
  const v = parsed.data as Record<string, unknown>;
  switch (type) {
    case "CHECKBOX":
      return v.checked === true;
    case "SUB_ASSIGNEE_TASK":
      return v.done === true;
    default:
      return true;
  }
}

// Validate a config object for an item type; returns the parsed config or throws ZodError.
export function parseItemConfig(type: ItemType, config: unknown) {
  return itemConfigSchemas[type].parse(config ?? {});
}

/**
 * Config-aware constraint check for a schema-valid value (guide §11: the
 * server must enforce these too, not just the run UI). Returns a human-readable
 * violation message, or null when the value satisfies the item's config:
 *  - APPROVAL  `requireNote`   → note must be non-empty
 *  - NUMBER    `min`/`max`     → number within range
 *  - DROPDOWN  `options`       → selected must be a configured option
 *  - TEXT      `minLength`/`maxLength` → text length within range
 *  - FILE_UPLOAD `maxSizeMb`   → size within limit
 * Malformed configs never throw — unknown/invalid constraints are ignored.
 */
export function itemConfigViolation(
  type: ItemType,
  config: unknown,
  value: unknown,
): string | null {
  if (!value || typeof value !== "object") return null;
  const cfg = (
    config && typeof config === "object" && !Array.isArray(config) ? config : {}
  ) as Record<string, unknown>;
  const v = value as Record<string, unknown>;

  switch (type) {
    case "APPROVAL": {
      if (cfg.requireNote === true) {
        const note = typeof v.note === "string" ? v.note.trim() : "";
        if (note.length === 0) return "a note is required";
      }
      return null;
    }
    case "NUMBER": {
      if (typeof v.number !== "number") return null;
      if (typeof cfg.min === "number" && v.number < cfg.min) {
        return `must be at least ${cfg.min}`;
      }
      if (typeof cfg.max === "number" && v.number > cfg.max) {
        return `must be at most ${cfg.max}`;
      }
      return null;
    }
    case "DROPDOWN": {
      if (typeof v.selected !== "string") return null;
      const options = Array.isArray(cfg.options)
        ? cfg.options.filter((o): o is string => typeof o === "string")
        : [];
      if (options.length > 0 && !options.includes(v.selected)) {
        return "must be one of the configured options";
      }
      return null;
    }
    case "TEXT": {
      if (typeof v.text !== "string") return null;
      if (typeof cfg.minLength === "number" && v.text.length < cfg.minLength) {
        return `must be at least ${cfg.minLength} characters`;
      }
      if (typeof cfg.maxLength === "number" && v.text.length > cfg.maxLength) {
        return `must be at most ${cfg.maxLength} characters`;
      }
      return null;
    }
    case "FILE_UPLOAD": {
      if (
        typeof cfg.maxSizeMb === "number" &&
        typeof v.size === "number" &&
        v.size > cfg.maxSizeMb * 1024 * 1024
      ) {
        return `file exceeds the ${cfg.maxSizeMb} MB limit`;
      }
      return null;
    }
    default:
      return null;
  }
}

export function parseItemValue(type: ItemType, value: unknown) {
  return itemValueSchemas[type].parse(value);
}

// Human labels for the canvas properties panel / "+" insert menu
export const itemTypeMeta: Record<
  ItemType,
  { label: string; description: string }
> = {
  CHECKBOX: { label: "Checkbox", description: "A simple to-do tick" },
  TEXT: { label: "Text answer", description: "Free-form text response" },
  YES_NO: { label: "Yes / No", description: "Binary answer, usable in branch conditions" },
  NUMBER: { label: "Number", description: "Numeric answer with optional range" },
  DROPDOWN: { label: "Dropdown", description: "Pick one from configured options" },
  DUE_DATE: { label: "Due date", description: "Date answer; can set the block's due date" },
  FILE_UPLOAD: { label: "File upload", description: "Attach a file (stored in S3)" },
  APPROVAL: { label: "Approval", description: "Approve/reject with optional note" },
  SUB_ASSIGNEE_TASK: {
    label: "Sub-task",
    description: "Delegate this one item to a different person",
  },
  IMAGE_EMBED: { label: "Image", description: "Embedded reference image" },
};
