import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fireTriggeredSend, TriggerType, withBranchName } from '@/lib/send';
import { createNotification } from '@/lib/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_TRIGGERS: { type: TriggerType; label: string }[] = [
  { type: 'DAY0_WELCOME', label: 'Welcome' },
  { type: 'DAY14_REMINDER', label: 'Follow us' },
  { type: 'DAY42_REVIEW', label: 'Review' },
  { type: 'DAY56_REFERRAL', label: 'Referral' },
  { type: 'WEEKLY_VIDEO', label: 'Video' },
  { type: 'BIRTHDAY', label: 'Birthday' },
];

export async function POST(req: NextRequest) {
  try {
    const { parentId, trigger } = await req.json();
    if (!parentId) {
      return NextResponse.json({ error: 'parentId is required' }, { status: 400 });
    }

    const parentRow = await prisma.parent.findUnique({ where: { id: parentId }, include: { branch: true } });
    if (!parentRow) {
      return NextResponse.json({ error: 'Parent not found' }, { status: 404 });
    }
    const parent = withBranchName(parentRow);

    const triggersToFire = trigger
      ? TEST_TRIGGERS.filter((t) => t.type === trigger)
      : TEST_TRIGGERS;

    const results: Array<{ trigger: string; emailSent: boolean; emailError: string | null }> = [];

    for (const t of triggersToFire) {
      const r = await fireTriggeredSend(parent, t.type, {
        triggeredBy: 'admin-test',
      });
      results.push({ trigger: t.label, emailSent: r.emailSent, emailError: r.emailError ?? null });
    }

    await createNotification({
      type: 'system',
      parentId: parent.id,
      title: 'Test send completed',
      message: `Sent test message(s) to ${parent.name} (${parent.studentName}): ${triggersToFire
        .map((t) => t.label)
        .join(', ')}`,
    });

    return NextResponse.json({ success: true, parent: parent.name, results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}