"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";

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

  // COALESCE on UPDATE so that re-editing just the reason later doesn't
  // wipe an existing branch/emp_name/evidence_url that was set on insert.
  const res = await queryEbrightHrfs<{ id: string }>(
    `INSERT INTO public.attendance_justification
       (emp_no, branch, emp_name, just_date, reason, justified_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4::date, $5, $6, now(), now())
     ON CONFLICT (emp_no, just_date) DO UPDATE
       SET reason       = EXCLUDED.reason,
           branch       = COALESCE(EXCLUDED.branch, public.attendance_justification.branch),
           emp_name     = COALESCE(EXCLUDED.emp_name, public.attendance_justification.emp_name),
           justified_by = EXCLUDED.justified_by,
           updated_at   = now()
     RETURNING id::text`,
    [empNo, branch, empName, dateStr, reason, hr.justifiedBy],
  );

  revalidatePath("/attendance/summary");
  revalidatePath("/attendance/report");
  revalidatePath("/hr-dashboard");
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
  revalidatePath("/hr-dashboard");
  return { ok: true, id: res.rows[0]?.id ?? "" };
}
