import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stringifyPlanTypes } from '@/lib/content';

export const dynamic = 'force-dynamic';

const VALID_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;
// triggerType is free-text: it must match either a legacy TriggerType (DAY0_WELCOME, etc,
// used by intake) or a rule-engine AutomationRule name / sequenced contentType (welcome,
// renewal_30d_before_expiry, etc, used by lib/cron.ts). Both are just string columns, so we
// don't enforce a closed allowlist here — the UI's TRIGGER_OPTIONS documents the known set.

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const channel = url.searchParams.get('channel');
  const triggerType = url.searchParams.get('triggerType');

  const where: Record<string, unknown> = {};
  if (channel) where.channel = channel;
  if (triggerType === 'null' || triggerType === '') where.triggerType = null;
  else if (triggerType) where.triggerType = triggerType;

  const items = await prisma.content.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const channel = body.channel;
  const bodyText = typeof body.body === 'string' ? body.body : '';
  const link = body.link ? String(body.link).trim() : null;
  const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
  const triggerType = body.triggerType || null;
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
  const planTypes = Array.isArray(body.planTypes) ? stringifyPlanTypes(body.planTypes) : stringifyPlanTypes(['all']);

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!bodyText.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 });
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: `channel must be one of ${VALID_CHANNELS.join(', ')}` },
      { status: 400 },
    );
  }
  if (link && !isValidUrl(link)) {
    return NextResponse.json({ error: 'link must be a valid URL' }, { status: 400 });
  }
  if (imageUrl && !isValidUrl(imageUrl)) {
    return NextResponse.json({ error: 'imageUrl must be a valid URL' }, { status: 400 });
  }

  const created = await prisma.content.create({
    data: { title, channel, body: bodyText, link, imageUrl, triggerType, isActive, planTypes },
  });
  return NextResponse.json(created);
}
