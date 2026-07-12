import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/festive';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = await prisma.festiveEvent.findMany({ orderBy: { date: 'asc' } });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const date = body.date ? new Date(body.date) : null;

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!date || Number.isNaN(date.getTime())) return NextResponse.json({ error: 'a valid date is required' }, { status: 400 });

  const slug = slugify(name);
  const existing = await prisma.festiveEvent.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: `A festive event with slug "${slug}" already exists` }, { status: 409 });

  const event = await prisma.festiveEvent.create({
    data: {
      name,
      slug,
      date,
      endDate: body.endDate ? new Date(body.endDate) : null,
      sendOnDay: body.sendOnDay ?? true,
      sendPreDays: body.sendPreDays != null && body.sendPreDays !== '' ? Number(body.sendPreDays) : null,
      branch: body.branch || null,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(event);
}
