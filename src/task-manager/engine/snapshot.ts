// Template snapshot builder (PROJECT_GUIDE §3): captures the full executable
// template at run start. The engine reads ONLY the snapshot at run time, so
// editing a template can never change the logic of an in-flight run.
//
// Imported by API routes (via @server/*) AND by prisma/seed.ts under plain tsx,
// so: relative imports only, and no Next-only modules here.

import { prisma } from "../prisma";
import type {
  Condition,
  ConditionalEdge,
  ConditionOp,
  SnapshotBlock,
  SnapshotDecision,
  SnapshotEdge,
  SnapshotItem,
  TemplateSnapshot,
} from "../lib/types";

const VALID_OPS: ReadonlySet<string> = new Set<ConditionOp>([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "is_checked",
  "not_checked",
  "is_yes",
  "is_no",
  "approved",
  "rejected",
]);

function isValidCondition(raw: unknown): raw is Condition {
  if (!raw || typeof raw !== "object") return false;
  const cond = raw as Record<string, unknown>;
  if (cond.kind === "always" || cond.kind === "else") return true;
  if (cond.kind === "item") {
    return (
      typeof cond.itemId === "string" &&
      cond.itemId.length > 0 &&
      typeof cond.op === "string" &&
      VALID_OPS.has(cond.op)
    );
  }
  return false;
}

/**
 * Defensively validate a raw JSON column into ConditionalEdge[]. Malformed
 * entries are skipped with a console.warn — they must NOT silently become
 * `always` edges, and they must never crash a run.
 */
export function sanitizeConditionalEdges(raw: unknown, context: string): ConditionalEdge[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    console.warn(`[snapshot] ${context}: conditional edges is not an array — ignored`);
    return [];
  }
  const result: ConditionalEdge[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).targetNodeId === "string" &&
      ((entry as Record<string, unknown>).targetNodeId as string).length > 0 &&
      isValidCondition((entry as Record<string, unknown>).condition)
    ) {
      const e = entry as { targetNodeId: string; condition: Condition };
      result.push({ targetNodeId: e.targetNodeId, condition: e.condition });
    } else {
      console.warn(`[snapshot] ${context}: skipping malformed conditional edge`, entry);
    }
  }
  return result;
}

function toConfigRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Map raw Flow.edges (React Flow edge JSON) into SnapshotEdge[], defensively. */
function sanitizeFlowEdges(raw: unknown, context: string): SnapshotEdge[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    console.warn(`[snapshot] ${context}: Flow.edges is not an array — ignored`);
    return [];
  }
  const result: SnapshotEdge[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).id === "string" &&
      typeof (entry as Record<string, unknown>).source === "string" &&
      typeof (entry as Record<string, unknown>).target === "string"
    ) {
      const e = entry as {
        id: string;
        source: string;
        target: string;
        data?: { condition?: unknown };
      };
      const condition =
        e.data && isValidCondition(e.data.condition) ? (e.data.condition as Condition) : undefined;
      result.push({ id: e.id, source: e.source, target: e.target, condition });
    } else {
      console.warn(`[snapshot] ${context}: skipping malformed canvas edge`, entry);
    }
  }
  return result;
}

/**
 * Build the immutable TemplateSnapshot for a flow (stored on FlowRun at start).
 * Throws a plain Error if the flow does not exist.
 */
export async function buildTemplateSnapshot(flowId: string): Promise<TemplateSnapshot> {
  const flow = await prisma.flow.findUnique({
    where: { id: flowId },
    include: {
      blocks: { include: { items: { orderBy: { order: "asc" } } } },
      decisionNodes: true,
    },
  });
  if (!flow) throw new Error(`Flow ${flowId} not found`);

  const blocks: SnapshotBlock[] = flow.blocks.map((block) => {
    if (!block.escalateToUserId) {
      // Publish validation guarantees this; tolerate drafts/bad data with a warning.
      console.warn(
        `[snapshot] flow ${flowId} block ${block.id} ("${block.title}") has no escalateToUserId`,
      );
    }
    const items: SnapshotItem[] = block.items.map((item) => ({
      id: item.id,
      order: item.order,
      type: item.type,
      label: item.label,
      required: item.required,
      config: toConfigRecord(item.config),
    }));
    return {
      id: block.id,
      nodeId: block.nodeId,
      title: block.title,
      assigneeRole: block.assigneeRole,
      fixedAssigneeId: block.fixedAssigneeId,
      dueInHours: block.dueInHours,
      reminderInterval: block.reminderInterval,
      strikeLimit: block.strikeLimit,
      escalateToUserId: block.escalateToUserId ?? "",
      outgoingEdges: sanitizeConditionalEdges(
        block.outgoingEdges,
        `flow ${flowId} block ${block.id} outgoingEdges`,
      ),
      items,
    };
  });

  const decisions: SnapshotDecision[] = flow.decisionNodes.map((decision) => ({
    id: decision.id,
    nodeId: decision.nodeId,
    conditions: sanitizeConditionalEdges(
      decision.conditions,
      `flow ${flowId} decision ${decision.id} conditions`,
    ),
  }));

  return {
    flowId: flow.id,
    flowName: flow.name,
    version: flow.version,
    blocks,
    decisions,
    edges: sanitizeFlowEdges(flow.edges, `flow ${flowId}`),
  };
}
