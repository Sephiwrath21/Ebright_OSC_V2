import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slug';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = await prisma.showcaseEvent.findMany({ orderBy: { date: 'asc' } });
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const date = body.date ? new Date(body.date) : null;

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!date || Number.isNaN(date.getTime())) return NextResponse.json({ error: 'a valid date is required' }, { status: 400 });

  const slug = slugify(name);
  const existing = await prisma.showcaseEvent.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: `A showcase event with slug "${slug}" already exists` }, { status: 409 });

  const event = await prisma.showcaseEvent.create({
    data: {
      name,
      slug,
      date,
      branch: body.branch || null,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(event);
}
