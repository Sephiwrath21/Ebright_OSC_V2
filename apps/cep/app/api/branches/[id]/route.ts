import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * PATCH only ever renames or (de)activates a Branch — there is no DELETE route.
 * "Remove" in the admin UI sets isActive: false instead of deleting the row,
 * since Parent.branchId is a required FK and hard-deleting would orphan every
 * historical parent/enrollment record still pointing at that branch.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const data: { name?: string; isActive?: boolean } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    const existing = await prisma.ebrightCepBranch.findUnique({ where: { name } });
    if (existing && existing.id !== params.id) {
      return NextResponse.json({ error: `A branch named "${name}" already exists` }, { status: 409 });
    }
    data.name = name;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const branch = await prisma.ebrightCepBranch.update({ where: { id: params.id }, data });
  return NextResponse.json(branch);
}
