"use server";
import { auth } from "@/auth";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { uploadToDrive } from "@/lib/drive";
import path from "node:path";
import {
  resolveLeaveAction,
  nextStatusForApproval,
  validateRejectionReason,
  HOD_POSITION,
  HOD_APPROVED_STATUS,
} from "./approval-logic";
import { getActiveDepartmentId } from "./approval-queries";

const ALLOWED_EXTS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface SubmitLeaveResult {
  ok: boolean;
  error?: string;
  leaveId?: number;
  totalDays?: number;
}

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function saveAttachment(file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error("Attachment must be PDF, JPG, or PNG.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Attachment exceeds 5MB.");
  }
  const { id } = await uploadToDrive(file, { prefix: "leave" });
  return id;
}

function daysInclusive(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((end.getTime() - start.getTime()) / msPerDay);
  return diff + 1;
}

export async function submitLeaveRequest(
  _prev: SubmitLeaveResult | null,
  formData: FormData,
): Promise<SubmitLeaveResult> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true },
  });
  if (!user) return { ok: false, error: "User record not found." };

  const leaveTypeId = parseInt(s(formData, "leave_type_id"), 10);
  if (Number.isNaN(leaveTypeId)) {
    return { ok: false, error: "Leave type is required." };
  }
  const leaveType = await prisma.leave_types.findUnique({
    where: { leave_type_id: leaveTypeId },
    select: { leave_type_id: true },
  });
  if (!leaveType) return { ok: false, error: "Invalid leave type." };

  const startStr = s(formData, "start_date");
  const endStr = s(formData, "end_date");
  if (!startStr || !endStr) {
    return { ok: false, error: "Both start and end dates are required." };
  }
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { ok: false, error: "Invalid date value." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "End date cannot be before start date." };
  }
  
  
  const halfDay = s(formData, "half_day") === "1";
  if (halfDay && startStr !== endStr) {
    return { ok: false, error: "Half day is only allowed for a single-day request." };
  }

  const totalDays = halfDay ? 0.5 : daysInclusive(startDate, endDate);

  const reason = s(formData, "reason") || null;


  const position = (session.user as { position?: string | null }).position ?? null;
  const initialStatus = position === HOD_POSITION ? HOD_APPROVED_STATUS : "pending";

  let attachmentId: string | null = null;
  const fileField = formData.get("attachment_file");
  if (fileField instanceof File && fileField.size > 0) {
    try {
      attachmentId = await saveAttachment(fileField);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Attachment upload failed." };
    }
  }

  const created = await prisma.leave_request.create({
    data: {
      user_id: user.user_id,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason,
      attachment: attachmentId,
      status: initialStatus,
    },
    select: { leave_id: true, total_days: true },
  });

  revalidatePath("/attendance/leave");

  return {
    ok: true,
    leaveId: created.leave_id,
    totalDays: Number(created.total_days),
  };
}

export interface ApprovalActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActor(): Promise<
  | { ok: true; userId: number; position: string | null; email: string; departmentId: number | null }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };
  const position = (session.user as { position?: string | null }).position ?? null;
  const email = session.user.email;
  const user = await prisma.users.findUnique({
    where: { email },
    select: { user_id: true },
  });
  if (!user) return { ok: false, error: "User record not found." };
  const departmentId = await getActiveDepartmentId(user.user_id);
  return { ok: true, userId: user.user_id, position, email, departmentId };
}

async function loadRequestForAction(leaveId: number) {
  const req = await prisma.leave_request.findUnique({
    where: { leave_id: leaveId },
    select: { leave_id: true, status: true, user_id: true },
  });
  if (!req) return null;
  const requesterDepartmentId = await getActiveDepartmentId(req.user_id);
  return { ...req, requesterDepartmentId };
}

export async function approveLeaveRequest(leaveId: number): Promise<ApprovalActionResult> {
  const actor = await resolveActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  const req = await loadRequestForAction(leaveId);
  if (!req) return { ok: false, error: "Leave request not found." };

  const decision = resolveLeaveAction({
    actorPosition: actor.position,
    actorEmail: actor.email,
    actorDepartmentId: actor.departmentId,
    requestStatus: req.status,
    requesterDepartmentId: req.requesterDepartmentId,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  const now = new Date();
  await prisma.leave_request.update({
    where: { leave_id: leaveId },
    data: {
      status: nextStatusForApproval(decision.stage),
      approved_by: actor.userId,
      approved_at: now,
      updated_at: now,
    },
  });
  revalidatePath("/attendance/leave/approvals");
  revalidatePath("/attendance/leave");
  return { ok: true };
}

export async function rejectLeaveRequest(
  leaveId: number,
  reason: string,
): Promise<ApprovalActionResult> {
  const actor = await resolveActor();
  if (!actor.ok) return { ok: false, error: actor.error };

  const reasonCheck = validateRejectionReason(reason);
  if (!reasonCheck.ok) return { ok: false, error: reasonCheck.error };

  const req = await loadRequestForAction(leaveId);
  if (!req) return { ok: false, error: "Leave request not found." };

  const decision = resolveLeaveAction({
    actorPosition: actor.position,
    actorEmail: actor.email,
    actorDepartmentId: actor.departmentId,
    requestStatus: req.status,
    requesterDepartmentId: req.requesterDepartmentId,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  const now = new Date();
  await prisma.leave_request.update({
    where: { leave_id: leaveId },
    data: {
      status: "rejected",
      remarks: reasonCheck.reason,
      approved_by: actor.userId,
      approved_at: now,
      updated_at: now,
    },
  });
  revalidatePath("/attendance/leave/approvals");
  revalidatePath("/attendance/leave");
  return { ok: true };
}
