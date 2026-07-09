
export const HOD_POSITION = "FT HOD";


export const HOD_APPROVED_STATUS = "hod_approved";


export function formatLeaveDisplayId(
  leaveTypeCode: string | null | undefined,
  leaveId: number,
): string {
  const prefix = (leaveTypeCode ?? "").trim().toUpperCase() || "LV";
  return `${prefix}-${String(leaveId).padStart(3, "0")}`;
}

export type LeaveActionStage = "hod" | "hr";

export interface LeaveActionContext {
  actorPosition: string | null | undefined;
  actorEmail: string | null | undefined;
  actorDepartmentId: number | null;
  requestStatus: string;
  requesterDepartmentId: number | null;
}

export type StageResult = { ok: true; stage: LeaveActionStage } | { ok: false; error: string };

export function resolveLeaveAction(ctx: LeaveActionContext): StageResult {
  const email = (ctx.actorEmail ?? "").toLowerCase();

  // HR finalizes HOD-approved requests, company-wide.
  if (email === HR_OVERVIEW_EMAIL) {
    if (ctx.requestStatus !== HOD_APPROVED_STATUS) {
      return { ok: false, error: "This request is not awaiting HR approval." };
    }
    return { ok: true, stage: "hr" };
  }

  // HOD acts on pending requests from their own department.
  if (ctx.actorPosition === HOD_POSITION) {
    if (ctx.requestStatus !== "pending") {
      return { ok: false, error: "This request is no longer awaiting HOD approval." };
    }
    if (ctx.actorDepartmentId == null) {
      return { ok: false, error: "Your account has no department assigned." };
    }
    if (ctx.requesterDepartmentId == null) {
      return { ok: false, error: "This request's owner has no department assigned." };
    }
    if (ctx.requesterDepartmentId !== ctx.actorDepartmentId) {
      return { ok: false, error: "This request belongs to another department." };
    }
    return { ok: true, stage: "hod" };
  }

  return { ok: false, error: "You are not authorized to action leave requests." };
}

export function nextStatusForApproval(stage: LeaveActionStage): "hod_approved" | "approved" {
  return stage === "hod" ? HOD_APPROVED_STATUS : "approved";
}

export type ReasonResult = { ok: true; reason: string } | { ok: false; error: string };


export function validateRejectionReason(reason: string): ReasonResult {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { ok: false, error: "A reason is required to reject a request." };
  return { ok: true, reason: trimmed };
}


export const HR_OVERVIEW_EMAIL = "hr@ebright.my";
export const SUPERADMIN_EMAIL = "od@ebright.my";
export const OPTIMISATION_DEPARTMENT_NAME = "Optimisation";

export type LeaveRecordsAccess =
  | { kind: "all" } 
  | { kind: "optimisation" } 
  | { kind: "own-department" } 
  | { kind: "none" }; 


export function resolveLeaveRecordsAccess(input: {
  role: string | null | undefined;
  email: string | null | undefined;
}): LeaveRecordsAccess {
  const email = (input.email ?? "").toLowerCase();
  if (email === HR_OVERVIEW_EMAIL) return { kind: "all" };
  if (email === SUPERADMIN_EMAIL) return { kind: "optimisation" };
  if (input.role === "department") return { kind: "own-department" };
  return { kind: "none" };
}
