// Shared type contracts for Ebright Flow.
// Every feature slice (canvas, engine, run UI, dashboard) imports from here —
// do not redefine these shapes locally. See PROJECT_GUIDE.md for ownership rules.

import type {
  BlockStatus,
  ItemType,
  Role,
  RunStatus,
  TriggerType,
  ViewType,
} from "@/generated/task-manager-client";

// ---------- Session / identity (mock now, OSC adapter later — spec §5a) ----------

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
  branch: string | null;
}

export interface Session {
  user: SessionUser;
}

// ---------- Conditions (shared by canvas editor + execution engine) ----------

export type ConditionOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_checked"
  | "not_checked"
  | "is_yes"
  | "is_no"
  | "approved"
  | "rejected";

export type Condition =
  | { kind: "always" }
  | { kind: "else" } // fallback branch — matches only if no prior condition matched
  | { kind: "item"; itemId: string; op: ConditionOp; value?: unknown };

// Ordered list; the engine evaluates top-to-bottom, first match wins, 'else' should be last.
// Used both for Block.outgoingEdges and DecisionNode.conditions.
export interface ConditionalEdge {
  condition: Condition;
  targetNodeId: string;
}

// ---------- Canvas (React Flow) node/edge data ----------

export type CanvasNodeType = "block" | "decision";

// Node data carried on React Flow nodes persisted into Flow.nodes.
// The node is a *pointer*; the source of truth for block config is the Block row.
export interface BlockNodeData {
  kind: "block";
  blockId: string; // Block.id
  title: string; // mirrored for render without a join
  [key: string]: unknown; // React Flow requires index-signature-compatible data
}

export interface DecisionNodeData {
  kind: "decision";
  decisionId: string; // DecisionNode.id
  title: string;
  [key: string]: unknown;
}

export type FlowCanvasNodeData = BlockNodeData | DecisionNodeData;

// Edge data persisted into Flow.edges (edge.data)
export interface FlowCanvasEdgeData {
  condition?: Condition;
  label?: string;
  [key: string]: unknown;
}

// ---------- Run item values (one shape per ItemType; zod schemas in item-schemas.ts) ----------

export type RunItemValue =
  | { type: "CHECKBOX"; checked: boolean }
  | { type: "TEXT"; text: string }
  | { type: "YES_NO"; answer: "yes" | "no" }
  | { type: "NUMBER"; number: number }
  | { type: "DROPDOWN"; selected: string }
  | { type: "DUE_DATE"; date: string } // ISO datetime; also updates RunBlock.dueAt (engine)
  | {
      type: "FILE_UPLOAD";
      fileKey: string;
      fileName: string;
      size: number;
      contentType: string;
    }
  | { type: "APPROVAL"; decision: "approved" | "rejected"; note?: string }
  | { type: "SUB_ASSIGNEE_TASK"; assigneeId: string; done: boolean; note?: string }
  | { type: "IMAGE_EMBED"; imageKey?: string; url?: string; caption?: string };

// ---------- Template snapshot (FlowRun.templateSnapshot) ----------
// Captured at run start; the engine reads ONLY this, never live template rows,
// so editing a template can never change the logic of an in-flight run.

export interface SnapshotItem {
  id: string; // BlockItem.id
  order: number;
  type: ItemType;
  label: string;
  required: boolean;
  config: Record<string, unknown>;
}

export interface SnapshotBlock {
  id: string; // Block.id
  nodeId: string;
  title: string;
  assigneeRole: string | null;
  fixedAssigneeId: string | null;
  dueInHours: number | null;
  reminderInterval: number; // hours
  strikeLimit: number;
  escalateToUserId: string; // publish validation guarantees non-null
  outgoingEdges: ConditionalEdge[];
  items: SnapshotItem[];
}

export interface SnapshotDecision {
  id: string; // DecisionNode.id
  nodeId: string;
  conditions: ConditionalEdge[];
}

export interface SnapshotEdge {
  id: string;
  source: string; // nodeId
  target: string; // nodeId
  condition?: Condition;
}

export interface TemplateSnapshot {
  flowId: string;
  flowName: string;
  version: number;
  blocks: SnapshotBlock[];
  decisions: SnapshotDecision[];
  edges: SnapshotEdge[];
}

// ---------- Dashboard filters (SavedView.filters) ----------

/** Daily/Monthly = a run has some block due within that window (a block due
 *  today matches both — same overlapping-by-design semantics as the OSC
 *  package's Daily/Monthly views). Ad hoc = the run was started by a Branch
 *  Manager (role BRANCH) — same definition used throughout src/osc/*. */
export type RunCadence = "daily" | "monthly" | "adhoc";

export interface RunFilters {
  status?: RunStatus[];
  blockStatus?: BlockStatus[];
  assigneeId?: string;
  flowId?: string;
  overdueOnly?: boolean;
  search?: string;
  cadence?: RunCadence;
}

// ---------- API error shape (all route handlers) ----------

export interface ApiError {
  error: string;
}

// Convenience re-exports so client components can avoid importing @prisma/client directly
export type { BlockStatus, ItemType, Role, RunStatus, TriggerType, ViewType };
