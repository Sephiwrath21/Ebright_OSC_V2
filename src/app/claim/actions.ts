"use server";
import { auth } from "@/auth";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { buildAccess } from "@/lib/access/engine";
import { uploadToDrive } from "@/lib/drive";
import {
  type ClaimType,
  isClaimType,
  canAccessClaimType,
  MAX_CLAIM_DOCS,
  requiresAttachment,
} from "@/app/claim/claim-types";
import path from "node:path";

const TRANSPORT_RATE = 0.7;
const TRANSPORT_ROUND_TRIP = 2;
const HEALTH_ANNUAL_CAP = 500;

const ALLOWED_EXTS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

const MONTH_FOLDER_NAMES = [
  "01 JAN", "02 FEB", "03 MAR", "04 APR", "05 MAY", "06 JUN",
  "07 JUL", "08 AUG", "09 SEP", "10 OCT", "11 NOV", "12 DEC",
];

function driveFolderForClaim(claimDate: Date): string[] {
  return [String(claimDate.getFullYear()), MONTH_FOLDER_NAMES[claimDate.getMonth()]];
}

export interface SubmitClaimResult {
  ok: boolean;
  error?: string;
  claimId?: number;
  amount?: number;
}

export interface ReviewClaimResult {
  ok: boolean;
  error?: string;
}

function s(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function saveAttachment(
  file: File,
  claimType: ClaimType,
  claimDate: Date,
): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error("Attachment must be PDF, JPG, or PNG.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Attachment exceeds 5MB.");
  }
  const { id } = await uploadToDrive(file, {
    prefix: claimType,
    folderPath: driveFolderForClaim(claimDate),
    folderEnvVar: "GOOGLE_DRIVE_CLAIM_FOLDER_ID",
  });
  return id;
}

export async function submitClaim(
  _prev: SubmitClaimResult | null,
  formData: FormData,
): Promise<SubmitClaimResult> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      employment: {
        take: 1,
        orderBy: { employment_id: "desc" },
        select: { department: { select: { department_name: true } } },
      },
    },
  });
  if (!user) return { ok: false, error: "User record not found." };

  const claimTypeRaw = s(formData, "claim_type");
  if (!isClaimType(claimTypeRaw)) {
    return { ok: false, error: "Invalid claim type." };
  }
  const claimType: ClaimType = claimTypeRaw;

  const position =
    (session.user as { position?: string | null } | undefined)?.position ?? null;
  const roleType = (session.user as { role?: string } | undefined)?.role ?? null;
  const department = user.employment?.[0]?.department?.department_name ?? null;
  if (
    !canAccessClaimType(claimType, {
      position,
      roleType,
      email: session.user.email,
      department,
    })
  ) {
    return {
      ok: false,
      error:
        "Only marketing@ebright.my or employees in the Marketing department may submit roadshow or showcase claims.",
    };
  }

  const dateStr = s(formData, "claim_date");
  if (!dateStr) return { ok: false, error: "Claim date is required." };
  const claimDate = new Date(dateStr);
  if (Number.isNaN(claimDate.getTime())) {
    return { ok: false, error: "Claim date is invalid." };
  }

  // Allowed window: today through the end of the current month. No backdating.
  // Compare as YYYY-MM-DD strings to avoid timezone off-by-one issues.
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayStr = fmtDate(now);
  const monthEndStr = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (dateStr < todayStr) {
    return { ok: false, error: "Claim date cannot be in the past." };
  }
  if (dateStr > monthEndStr) {
    return { ok: false, error: "Claim date must be within the current month." };
  }

  let amount: number;
  if (claimType === "transport") {
    const distance = parseFloat(s(formData, "distance"));
    if (!distance || distance <= 0) {
      return { ok: false, error: "Distance is required." };
    }
    amount = +(distance * TRANSPORT_RATE * TRANSPORT_ROUND_TRIP).toFixed(2);
  } else {
    const parsed = parseFloat(s(formData, "amount"));
    if (!parsed || parsed <= 0) {
      return { ok: false, error: "Amount is required." };
    }
    amount = +parsed.toFixed(2);
  }

  if (claimType === "health") {
    const year = claimDate.getFullYear();
    // claim_date is stored as UTC midnight (date-only form strings parse as
    // UTC), so the window must be UTC-anchored regardless of process TZ.
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    const used = await prisma.claim.aggregate({
      where: {
        user_id: user.user_id,
        claim_type: "health",
        status: { in: ["approved", "disbursed", "received"] },
        claim_date: { gte: yearStart, lt: yearEnd },
      },
      _sum: { approved_amount: true },
    });
    const usedAmount = Number(used._sum.approved_amount ?? 0);
    if (usedAmount + amount > HEALTH_ANNUAL_CAP) {
      const remaining = Math.max(0, HEALTH_ANNUAL_CAP - usedAmount);
      return {
        ok: false,
        error: `Exceeds annual health cap. Remaining this year: RM ${remaining.toFixed(2)}.`,
      };
    }
  }

  const description = s(formData, "description") || null;

  // One claim may carry several supporting documents (multi-doc claim types).
  // Each is uploaded to Drive and the resulting IDs are stored comma-separated.
  const incomingFiles = formData
    .getAll("attachment_file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (incomingFiles.length > MAX_CLAIM_DOCS) {
    return { ok: false, error: `You can attach at most ${MAX_CLAIM_DOCS} documents.` };
  }
  if (requiresAttachment(claimType) && incomingFiles.length === 0) {
    return { ok: false, error: "This claim requires at least one supporting document." };
  }

  let attachmentId: string | null = null;
  if (incomingFiles.length > 0) {
    try {
      const ids = await Promise.all(
        incomingFiles.map((file) => saveAttachment(file, claimType, claimDate)),
      );
      attachmentId = ids.join(",");
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Attachment upload failed." };
    }
  }

  const created = await prisma.claim.create({
    data: {
      claim_type: claimType,
      claim_description: description,
      amount,
      claim_date: claimDate,
      status: "pending",
      attachment: attachmentId,
      user_id: user.user_id,
    },
    select: { claim_id: true, amount: true },
  });

  revalidatePath("/claim");

  return {
    ok: true,
    claimId: created.claim_id,
    amount: Number(created.amount),
  };
}

export async function reviewClaim(
  _prev: ReviewClaimResult | null,
  formData: FormData,
): Promise<ReviewClaimResult> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("claim", "update")) {
    return { ok: false, error: "You don't have permission to review claims." };
  }

  const claimId = parseInt(s(formData, "claim_id"), 10);
  if (Number.isNaN(claimId)) return { ok: false, error: "Invalid claim id." };

  const action = s(formData, "action"); // "approve" | "reject"
  if (!["approve", "reject"].includes(action)) {
    return { ok: false, error: "Invalid action." };
  }

  const remarksRaw = s(formData, "remarks");
  if (action === "reject" && remarksRaw.length === 0) {
    return { ok: false, error: "Remarks are required when rejecting a claim." };
  }
  const remarks = remarksRaw || null;

  const existing = await prisma.claim.findUnique({
    where: { claim_id: claimId },
    select: { amount: true, status: true },
  });
  if (!existing) return { ok: false, error: "Claim not found." };

  let approvedAmount: number | null = null;
  if (action === "approve") {
    const parsed = parseFloat(s(formData, "approved_amount"));
    approvedAmount = !Number.isNaN(parsed) && parsed > 0
      ? +parsed.toFixed(2)
      : Number(existing.amount);
  }

  await prisma.claim.update({
    where: { claim_id: claimId },
    data: {
      status: action === "approve" ? "approved" : "rejected",
      approved_amount: approvedAmount,
      remarks,
      updated_at: new Date(),
    },
  });

  revalidatePath("/claim");
  revalidatePath(`/claim/${claimId}`);

  return { ok: true };
}

/**
 * Advances an already-approved claim along the disbursement flow:
 * approved → disbursed → received. Finance/superadmin only.
 */
export async function advanceClaim(
  _prev: ReviewClaimResult | null,
  formData: FormData,
): Promise<ReviewClaimResult> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Not authenticated." };

  const access = await buildAccess(session.user.email);
  if (!access) return { ok: false, error: "User record not found." };

  const claimId = parseInt(s(formData, "claim_id"), 10);
  if (Number.isNaN(claimId)) return { ok: false, error: "Invalid claim id." };

  const action = s(formData, "action"); // "disburse" | "receive"
  if (!["disburse", "receive"].includes(action)) {
    return { ok: false, error: "Invalid action." };
  }

  const existing = await prisma.claim.findUnique({
    where: { claim_id: claimId },
    select: { status: true, user_id: true },
  });
  if (!existing) return { ok: false, error: "Claim not found." };

  // Disbursement is a review action; confirming receipt belongs to the
  // employee who requested the claim.
  if (action === "disburse") {
    if (!access.can("claim", "update")) {
      return { ok: false, error: "You don't have permission to disburse claims." };
    }
  } else {
    if (existing.user_id !== access.actor.userId) {
      return { ok: false, error: "Only the claim requester can confirm receipt." };
    }
  }

  // Allowed transitions: approved → disbursed → received.
  const requiredStatus = action === "disburse" ? "approved" : "disbursed";
  const nextStatus = action === "disburse" ? "disbursed" : "received";
  if (existing.status !== requiredStatus) {
    return {
      ok: false,
      error:
        action === "disburse"
          ? "Only approved claims can be marked as disbursed."
          : "Only disbursed claims can be marked as received.",
    };
  }

  await prisma.claim.update({
    where: { claim_id: claimId },
    data: { status: nextStatus, updated_at: new Date() },
  });

  revalidatePath("/claim");
  revalidatePath(`/claim/${claimId}`);

  return { ok: true };
}
