import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stringifyPlanTypes } from '@/lib/content';

export const dynamic = 'force-dynamic';

const VALID_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const;

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const item = await prisma.content.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    data.title = t;
  }
  if (body.body !== undefined) {
    if (!String(body.body).trim()) {
      return NextResponse.json({ error: 'body cannot be empty' }, { status: 400 });
    }
    data.body = body.body;
  }
  if (body.channel !== undefined) {
    if (!VALID_CHANNELS.includes(body.channel)) {
      return NextResponse.json(
        { error: `channel must be one of ${VALID_CHANNELS.join(', ')}` },
        { status: 400 },
      );
    }
    data.channel = body.channel;
  }
  if (body.triggerType !== undefined) {
    data.triggerType = body.triggerType || null;
  }
  if (body.planTypes !== undefined) {
    data.planTypes = Array.isArray(body.planTypes) ? stringifyPlanTypes(body.planTypes) : stringifyPlanTypes(['all']);
  }
  if (body.link !== undefined) {
    const link = body.link ? String(body.link).trim() : null;
    if (link && !isValidUrl(link)) {
      return NextResponse.json({ error: 'link must be a valid URL' }, { status: 400 });
    }
    data.link = link;
  }
  if (body.imageUrl !== undefined) {
    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
    if (imageUrl && !isValidUrl(imageUrl)) {
      return NextResponse.json({ error: 'imageUrl must be a valid URL' }, { status: 400 });
    }
    data.imageUrl = imageUrl;
  }
  if (body.isActive !== undefined) {
    data.isActive = Boolean(body.isActive);
  }

  const updated = await prisma.content.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.content.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
