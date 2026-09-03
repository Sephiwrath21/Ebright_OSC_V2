import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { streamFromDrive, mimeForName } from "@/lib/drive";
import { canReviewClaims } from "@/app/claim/roles";
import { getEmployeeOverviewRowById } from "@/lib/employeeQueries";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: fileId } = await params;
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      user_id: true,
      role_id: true,
      email: true,
      role: { select: { role_type: true } },
    },
  });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isFinance = canReviewClaims({
    role_id: me.role_id,
    email: me.email,
    role_type: me.role?.role_type ?? null,
  });

  const [
    claim,
    leave,
    achievementRow,
    salaryRevisionRow,
    promotionRow,
    transferRow,
    domesticInquiryRow,
    suspensionLetterRow,
    showcauseWarningLetterRow,
    ndaRow,
    nonCompeteRow,
    performanceReviewRow,
    payslipHistoryRow,
    resumeRow,
    medicalCheckRow,
    documentsRow,
    payrollRow,
    probationRow,
    resignationRow,
    referenceLetterRow,
    employmentRow,
    exitFinancialSettlementRow,
  ] = await Promise.all([
    prisma.claim.findFirst({
      where: {
        OR: [
          { attachment: fileId },
          { attachment: { contains: fileId } },
        ],
      },
      select: { user_id: true },
    }),
    prisma.leave_request.findFirst({
      where: {
        OR: [
          { attachment: fileId },
          { attachment: { contains: fileId } },
        ],
      },
      select: { user_id: true },
    }),
    // Every table below stores exactly one Drive file id per column (written
    // solely by this app's own uploadToDrive callers) — unlike claim/leave's
    // legacy `contains` fuzzy match (needed for old multi-document strings),
    // a plain equality check is enough. Tables with more than one attachment
    // column (resume, documents, probation, resignation) check both.
    prisma.achievement.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.salary_revision.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.promotion.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.transfer.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.domestic_inquiry.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.suspension_letter.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.showcause_warning_letter.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.nda.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.non_compete.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.performance_review.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.payslip_history.findFirst({ where: { attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.resume.findFirst({
      where: { OR: [{ resume_file_id: fileId }, { cv_file_id: fileId }] },
      select: { user_id: true },
    }),
    prisma.medical_check.findFirst({ where: { medical_report_file_id: fileId }, select: { user_id: true } }),
    prisma.documents.findFirst({
      where: { OR: [{ employment_contract_file_id: fileId }, { employee_handbook_file_id: fileId }] },
      select: { user_id: true },
    }),
    prisma.payroll.findFirst({ where: { pcb_attachment_file_id: fileId }, select: { user_id: true } }),
    prisma.probation.findFirst({
      where: { OR: [{ confirmation_letter_file_id: fileId }, { extension_letter_file_id: fileId }] },
      select: { user_id: true },
    }),
    prisma.resignation.findFirst({
      where: { OR: [{ resign_letter_file_id: fileId }, { accept_letter_file_id: fileId }] },
      select: { user_id: true },
    }),
    prisma.reference_letter.findFirst({ where: { issued_letter_file_id: fileId }, select: { user_id: true } }),
    prisma.employment.findFirst({ where: { offer_letter_file_id: fileId }, select: { user_id: true } }),
    prisma.exit_financial_settlement.findFirst({ where: { settlement_letter_file_id: fileId }, select: { user_id: true } }),
  ]);

  const canAccessClaim = !!claim && (isFinance || claim.user_id === me.user_id);
  // Previously only the leave's own owner could view its attachment — HR/
  // staff opening a DIFFERENT employee's Leave tab (the normal way this
  // route is reached from a profile page) got a 404 even though they're
  // allowed to see that employee's record at all. Extended to match: same
  // department/branch/full-access scope check every other Employee Record
  // view already applies (see employeeScope.ts) — getEmployeeOverviewRowById
  // returns null for anyone outside the current session's scope, same as it
  // does for the profile page itself.
  let canAccessLeave = !!leave && leave.user_id === me.user_id;
  if (!canAccessLeave && leave) {
    canAccessLeave = (await getEmployeeOverviewRowById(leave.user_id)) != null;
  }

  // Every other Employee Record attachment table (Achievement, Training's
  // siblings, NDA/Non-Compete, Payslip History, Resume, Documents, ...) was
  // never checked here at all — this route was only ever built for claim/
  // leave, so every "View" link on those other panels 404'd unconditionally
  // regardless of Drive file validity (see conversation, Payslip History
  // "View" bug report). They all share the identical rule leave just used
  // above (own record OR within the viewer's employee scope), so resolve
  // them the same way instead of repeating that branch per table.
  const scopedRows = [
    achievementRow,
    salaryRevisionRow,
    promotionRow,
    transferRow,
    domesticInquiryRow,
    suspensionLetterRow,
    showcauseWarningLetterRow,
    ndaRow,
    nonCompeteRow,
    performanceReviewRow,
    payslipHistoryRow,
    resumeRow,
    medicalCheckRow,
    documentsRow,
    payrollRow,
    probationRow,
    resignationRow,
    referenceLetterRow,
    employmentRow,
    exitFinancialSettlementRow,
  ].filter((row): row is { user_id: number } => row != null);

  let canAccessScoped = scopedRows.some((row) => row.user_id === me.user_id);
  if (!canAccessScoped && scopedRows.length > 0) {
    const scopeChecks = await Promise.all(scopedRows.map((row) => getEmployeeOverviewRowById(row.user_id)));
    canAccessScoped = scopeChecks.some((row) => row != null);
  }

  if (!canAccessClaim && !canAccessLeave && !canAccessScoped) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { body, meta } = await streamFromDrive(fileId);
    const wantDownload = req.nextUrl.searchParams.get("download") !== null;
    const disposition = wantDownload ? "attachment" : "inline";
    const safeName = (meta.name || "attachment").replace(/"/g, '\\"');
    const resolvedMime =
      mimeForName(meta.name) ?? meta.mimeType ?? "application/octet-stream";

    const webStream = Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": resolvedMime,
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
