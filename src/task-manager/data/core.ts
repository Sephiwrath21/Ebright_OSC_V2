// Task Manager data layer — core. Replaces the HTTP bridge's flow-client.ts:
// pages/server actions call these functions in-process, so there is no
// x-internal-secret and no FLOW_INTERNAL_URL. The acting user is always
// identified by email (the OSC session's email), resolved against the
// task-manager database's own User table.
// Unlike the donor's handleApi, native() does NOT JSON-serialize return
// values: Date fields stay real Dates, so builders must convert explicitly
// wherever a Flow* type promises an ISO string (as analytics/_lib.ts now
// does for dueAt).
import { ZodError, z } from "zod";
import type { User } from "@/generated/task-manager-client";
import { ApiHttpError } from "../lib/api-server";
import { prisma } from "../prisma";

/** Same shape the old flow-client threw — pages branch on status/instance. */
export class FlowBridgeError extends Error {
  constructor(
    public status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FlowBridgeError";
  }
}

/** Session email has no row in the task-manager User table ("no account yet"). */
export class NoAccountError extends FlowBridgeError {
  constructor(email: string) {
    super(404, `No Task Manager account for ${email}`);
    this.name = "NoAccountError";
  }
}

/** TASK_MANAGER_DATABASE_URL is unset — Phase 2 cutover hasn't run here yet. */
export class SetupPendingError extends FlowBridgeError {
  constructor() {
    super(503, "Task Manager is not connected to its database yet");
    this.name = "SetupPendingError";
  }
}

export const emailSchema = z.string().email().max(200);

/** Resolve the acting user by (lowercased) email — the cross-system identity key. */
export async function requireUserByEmail(email: string): Promise<User> {
  const parsed = emailSchema.parse(email);
  const user = await prisma.user.findUnique({
    where: { email: parsed.toLowerCase() },
  });
  if (!user) throw new NoAccountError(parsed);
  return user;
}

/**
 * Wraps every data-layer function: mirrors the old handleApi error mapping
 * (ApiHttpError → its status, ZodError → 400, unknown → logged 500) but throws
 * FlowBridgeError instead of returning an HTTP response. `label` tags the
 * unknown-error log line (e.g. the calling function's name); every mapped
 * error preserves the original as `cause` for debugging.
 */
export async function native<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  if (!process.env.TASK_MANAGER_DATABASE_URL) throw new SetupPendingError();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof FlowBridgeError) throw err;
    if (err instanceof ApiHttpError) {
      throw new FlowBridgeError(err.status, err.message, { cause: err });
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      throw new FlowBridgeError(
        400,
        `${first?.path?.join(".") || "input"}: ${first?.message || "invalid"}`,
        { cause: err },
      );
    }
    console.error(label ? `[task-manager] ${label}` : "[task-manager]", err);
    throw new FlowBridgeError(500, "Internal error", { cause: err });
  }
}
