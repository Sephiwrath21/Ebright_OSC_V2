"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { classifyMyAttendanceDay, isJustifiableState } from "@/lib/self-attendance";

// HR/admin/HOD per spec. Server actions write to HRFS attendance_justification
// (spec schema: emp_no/branch/emp_name/just_date/reason/evidence_url/...).
const ALLOWED_ROLES = new Set([
  "superadmin", "super_admin", "admin", "ceo", "hr", "hod",
]);

export type JustificationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function requireHr() {
  const session = await auth();
  if (!session?.user?.email) return { ok: false as const, error: "Unauthenticated" };
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      email: true,
      role: { select: { role_type: true } },
      user_profile: { select: { full_name: true } },
    },
  });
  if (!me) return { ok: false as const, error: "User not found" };
  const roleType = me.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLES.has(roleType)) return { ok: false as const, error: "Forbidden" };
  return {
    ok: true as const,
    userId: me.user_id,
    // Stored as text on HRFS (justified_by column) — prefer name then email.
    justifiedBy: me.user_profile?.full_name?.trim() || me.email,
  };
}

// Save a justification on HRFS attendance_justification. Idempotent per
// (emp_no, just_date) — upserts so editing the reason just updates the row.
export async function saveJustification(
  formData: FormData,
): Promise<JustificationResult> {
  const hr = await requireHr();
  if (!hr.ok) return { ok: false, error: hr.error };

  const empNo = String(formData.get("emp_no") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim() || null;
  const empName = String(formData.get("emp_name") ?? "").trim() || null;

  if (!empNo) return { ok: false, error: "Invalid emp_no" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "Invalid date (YYYY-MM-DD)" };
  }
  if (!reason) return { ok: false, error: "Reason is required" };

  // HR-entered justifications are authoritative — recorded as already approved.
  // COALESCE on UPDATE so that re-editing just the reason later doesn't wipe an
  // existing branch/emp_name/evidence_url that was set on insert.
  const res = await queryEbrightHrfs<{ id: string }>(
    `INSERT INTO public.attendance_justification
       (emp_no, branch, emp_name, just_date, reason, justified_by,
        status, source, reviewed_by, reviewed_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::date, $5, $6,
        'approved', 'hr', $6, now(), now(), now())
     ON CONFLICT (emp_no, just_date) DO UPDATE
       SET reason       = EXCLUDED.reason,
           branch       = COALESCE(EXCLUDED.branch, public.attendance_justification.branch),
           emp_name     = COALESCE(EXCLUDED.emp_name, public.attendance_justification.emp_name),
           justified_by = EXCLUDED.justified_by,
           status       = 'approved',
           reviewed_by  = EXCLUDED.justified_by,
           reviewed_at  = now(),
           updated_at   = now()
     RETURNING id::text`,
    [empNo, branch, empName, dateStr, reason, hr.justifiedBy],
  );

  revalidatePath("/attendance/summary");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/justifications");
  revalidatePath("/hr-dashboard");
  revalidatePath("/home");
  return { ok: true, id: res.rows[0]?.id ?? "" };
}

// Delete by (emp_no, date) — the natural key on the table. Safer than
// trusting a client-supplied numeric id which could be stale.
export async function deleteJustification(
  formData: FormData,
): Promise<JustificationResult> {
  const hr = await requireHr();
  if (!hr.ok) return { ok: false, error: hr.error };

  const empNo = String(formData.get("emp_no") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "").trim();
  if (!empNo || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "Need emp_no and YYYY-MM-DD date" };
  }

  const res = await queryEbrightHrfs<{ id: string }>(
    `DELETE FROM public.attendance_justification
       WHERE emp_no = $1 AND just_date = $2::date
       RETURNING id::text`,
    [empNo, dateStr],
  );

  revalidatePath("/attendance/summary");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/justifications");
  revalidatePath("/hr-dashboard");
  revalidatePath("/home");
  return { ok: true, id: res.rows[0]?.id ?? "" };
}

// ──────────────────────────────────────────────────────────────────────────
// HR approval of staff-submitted justifications
// ──────────────────────────────────────────────────────────────────────────

// Approve or reject a pending justification. Keyed by (emp_no, just_date).
export async function reviewJustification(
  formData: FormData,
): Promise<JustificationResult> {
  const hr = await requireHr();
  if (!hr.ok) return { ok: false, error: hr.error };

  const empNo = String(formData.get("emp_no") ?? "").trim();
  const dateStr = String(formData.get("date") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim(); // approve | reject
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!empNo || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "Need emp_no and YYYY-MM-DD date" };
  }
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, error: "Invalid decision" };
  }
  const status = decision === "approve" ? "approved" : "rejected";

  const res = await queryEbrightHrfs<{ id: string }>(
    `UPDATE public.attendance_justification
        SET status      = $3,
            reviewed_by  = $4,
            reviewed_at  = now(),
            review_note  = $5,
            updated_at   = now()
      WHERE emp_no = $1 AND just_date = $2::date
      RETURNING id::text`,
    [empNo, dateStr, status, hr.justifiedBy, note],
  );

  if (res.rows.length === 0) {
    return { ok: false, error: "That justification no longer exists." };
  }

  revalidatePath("/attendance/summary");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/justifications");
  revalidatePath("/hr-dashboard");
  revalidatePath("/home");
  return { ok: true, id: res.rows[0]?.id ?? "" };
}

// ──────────────────────────────────────────────────────────────────────────
// Staff self-service — justify your own attendance
// ──────────────────────────────────────────────────────────────────────────

type SelfContext = {
  ok: true;
  userId: number;
  empNo: string;
  name: string;
  branch: string | null;
};

// Any signed-in user justifying their OWN attendance. Resolves the HRFS
// employee number (employment.employee_id) that keys attendance_justification.
async function requireSelf(): Promise<
  SelfContext | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.email) return { ok: false, error: "Unauthenticated" };
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      email: true,
      user_profile: { select: { full_name: true } },
      employment: {
        orderBy: { employment_id: "desc" },
        take: 1,
        select: {
          employee_id: true,
          branch: { select: { branch_name: true } },
        },
      },
    },
  });
  if (!me) return { ok: false, error: "User not found" };
  const empNo = me.employment[0]?.employee_id?.trim() ?? "";
  if (!empNo) {
    return {
      ok: false,
      error: "Your employee number isn't set yet — please contact HR.",
    };
  }
  return {
    ok: true,
    userId: me.user_id,
    empNo,
    name: me.user_profile?.full_name?.trim() || me.email,
    branch: me.employment[0]?.branch?.branch_name ?? null,
  };
}

// Submit (or edit) a justification for your own absent/late day. Recorded as
// pending until HR approves. Refuses days that aren't actually absent/late, and
// won't overwrite a day HR has already approved.
export async function saveMyJustification(
  formData: FormData,
): Promise<JustificationResult> {
  const self = await requireSelf();
  if (!self.ok) return { ok: false, error: self.error };

  const dateStr = String(formData.get("date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "Invalid date (YYYY-MM-DD)" };
  }
  if (!reason) return { ok: false, error: "Reason is required" };

  // Link to the real attendance record: only genuinely absent/late days qualify.
  const state = await classifyMyAttendanceDay(self.userId, dateStr);
  if (!isJustifiableState(state)) {
    return {
      ok: false,
      error: "Only an absent or late day can be justified.",
    };
  }

  // Upsert, but never clobber a day HR has already approved (the WHERE guard on
  // the conflict path leaves an approved row untouched → 0 rows returned).
  const res = await queryEbrightHrfs<{ id: string }>(
    `INSERT INTO public.attendance_justification
       (emp_no, branch, emp_name, just_date, reason, justified_by,
        status, source, created_at, updated_at)
     VALUES ($1, $2, $3, $4::date, $5, $3,
        'pending', 'staff', now(), now())
     ON CONFLICT (emp_no, just_date) DO UPDATE
       SET reason       = EXCLUDED.reason,
           status       = 'pending',
           source       = 'staff',
           justified_by = EXCLUDED.justified_by,
           reviewed_by  = NULL,
           reviewed_at  = NULL,
           review_note  = NULL,
           updated_at   = now()
     WHERE public.attendance_justification.status <> 'approved'
     RETURNING id::text`,
    [self.empNo, self.branch, self.name, dateStr, reason],
  );

  if (res.rows.length === 0) {
    return {
      ok: false,
      error: "This day has already been approved and can't be changed.",
    };
  }

  revalidatePath("/home");
  revalidatePath("/attendance/justifications");
  return { ok: true, id: res.rows[0]?.id ?? "" };
}

// Withdraw your own still-pending justification.
export async function withdrawMyJustification(
  formData: FormData,
): Promise<JustificationResult> {
  const self = await requireSelf();
  if (!self.ok) return { ok: false, error: self.error };

  const dateStr = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: "Invalid date (YYYY-MM-DD)" };
  }

  const res = await queryEbrightHrfs<{ id: string }>(
    `DELETE FROM public.attendance_justification
       WHERE emp_no = $1 AND just_date = $2::date
         AND status = 'pending' AND source = 'staff'
       RETURNING id::text`,
    [self.empNo, dateStr],
  );

  if (res.rows.length === 0) {
    return { ok: false, error: "Nothing pending to withdraw for that day." };
  }

  revalidatePath("/home");
  revalidatePath("/attendance/justifications");
  return { ok: true, id: res.rows[0]?.id ?? "" };
}
