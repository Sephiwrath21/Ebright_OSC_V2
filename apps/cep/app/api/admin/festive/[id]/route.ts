import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.festiveEvent.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();

  // Cal.com-sourced rows have their name/date/endDate owned by Cal.com — the next
  // sync would just overwrite a manual edit anyway, so reject it explicitly here
  // rather than accepting a change that silently reverts on the next tick.
  if (existing.source === 'cal_com' && (body.name !== undefined || body.date !== undefined || body.endDate !== undefined)) {
    return NextResponse.json(
      { error: 'This festival is synced from Cal.com — edit the booking there, not name/date here.' },
      { status: 400 },
    );
  }

  const event = await prisma.festiveEvent.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.date !== undefined ? { date: new Date(body.date) } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
      ...(body.sendOnDay !== undefined ? { sendOnDay: Boolean(body.sendOnDay) } : {}),
      ...(body.sendPreDays !== undefined
        ? { sendPreDays: body.sendPreDays != null && body.sendPreDays !== '' ? Number(body.sendPreDays) : null }
        : {}),
      ...(body.branch !== undefined ? { branch: body.branch || null } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
    },
  });
  return NextResponse.json(event);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {

  await prisma.festiveEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
