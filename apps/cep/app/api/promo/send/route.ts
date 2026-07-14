import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fireBlastSend, withBranchName } from '@/lib/send';

export const dynamic = 'force-dynamic';

/** Manual, on-demand only — no schedule, no calendar source (docs/architecture.md,
 * layer 3). Reuses the exact same send mechanism as /api/blast/send, but tags
 * sends contentType:'promo' so they're distinguishable in Queue/Notifications. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { parentIds, contentId } = body as { parentIds: string[]; contentId: string };

  if (!parentIds?.length) {
    return NextResponse.json({ error: 'No recipients' }, { status: 400 });
  }
  if (!contentId) {
    return NextResponse.json({ error: 'A promo template is required' }, { status: 400 });
  }

  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) {
    return NextResponse.json({ error: 'Promo template not found' }, { status: 404 });
  }

  const parents = (
    await prisma.parent.findMany({ where: { id: { in: parentIds } }, include: { branch: true } })
  ).map(withBranchName);

  let sent = 0;
  for (const parent of parents) {
    const r = await fireBlastSend(parent, content, {
      triggeredBy: 'admin',
      reason: 'Promo send',
      contentType: 'promo',
      label: 'promo',
    });
    if (r.emailAttempted ? r.emailSent : true) sent++;
  }

  return NextResponse.json({ success: true, count: sent });
}
