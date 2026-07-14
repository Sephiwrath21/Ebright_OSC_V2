import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { differenceInCalendarMonths } from 'date-fns';
import { FilterBar } from '@/components/shared/FilterBar';
import { PLAN_TYPES, PLAN_TYPE_LABELS } from '@/lib/planTypes';
import { numberedBranchLabel } from '@/lib/branches';

export const dynamic = 'force-dynamic';

function initials(name: string): string {
  return name
    .replace(/^(Pn\.|En\.)\s*/, '')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function currentMonth(m1Start: Date): number {
  const now = new Date();
  if (now < m1Start) return 1;
  return differenceInCalendarMonths(now, m1Start) + 1;
}

export default async function ParentsPage({
  searchParams,
}: {
  searchParams: { branch?: string; status?: string; plan_type?: string };
}) {
  const branch = searchParams.branch;
  const status = searchParams.status;
  const planType = searchParams.plan_type;

  const [parents, branches] = await Promise.all([
    prisma.parent.findMany({
      where: {
        ...(branch ? { branch: { name: branch } } : {}),
        ...(status ? { status } : {}),
        ...(planType ? { plan_type: planType } : {}),
      },
      include: { branch: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.ebrightCepBranch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Parents</h1>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '6px 0 0' }}>{parents.length} total</p>
        </div>
      </div>

      <FilterBar
        current={{ branch: branch ?? 'all', status: status ?? 'all', plan_type: planType ?? 'all' }}
        filters={[
          { key: 'branch', label: 'Branches', options: branches.map((b, i) => ({ value: b.name, label: numberedBranchLabel(i, b.name) })) },
          {
            key: 'status',
            label: 'Statuses',
            options: [
              { value: 'active', label: 'Active' },
              { value: 'trial', label: 'Trial' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
          {
            key: 'plan_type',
            label: 'Plans',
            options: PLAN_TYPES.map((p) => ({ value: p, label: PLAN_TYPE_LABELS[p] })),
          },
        ]}
      />

      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1.4fr 0.85fr 0.85fr 1.35fr 0.6fr 80px 0.6fr 200px', gap: '12px', padding: '12px 16px', fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, letterSpacing: '0.6px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          <div></div>
          <div>Parent</div>
          <div>Phone</div>
          <div>Branch</div>
          <div>Student · Program</div>
          <div>Enrolled</div>
          <div>Month</div>
          <div>Plan</div>
          <div>Status</div>
        </div>
        {parents.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            No parents match these filters.
          </div>
        )}
        {parents.map((p) => {
          const m = currentMonth(p.m1StartDate);
          return (
            <Link
              key={p.id}
              href={`/parents/${p.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1.4fr 0.85fr 0.85fr 1.35fr 0.6fr 80px 0.6fr 200px',
                gap: '12px',
                padding: '14px 16px',
                fontSize: '13px',
                color: '#111827',
                borderBottom: '1px solid #f3f4f6',
                textDecoration: 'none',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#dc262618',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {initials(p.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
              </div>
              <div style={{ color: '#6b7280', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.phone}</div>
              <div style={{ color: '#6b7280', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.branch.name}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.studentName}</div>
                <div style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.program} · {p.programDur}mo
                </div>
              </div>
              <div style={{ color: '#6b7280' }}>
                {new Date(p.enrollDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#dc262618',
                    color: '#dc2626',
                  }}
                >
                  M{m}
                </span>
              </div>
              <div style={{ color: p.plan_type ? '#111827' : '#d1d5db', fontSize: '12px' }}>
                {p.plan_type ? PLAN_TYPE_LABELS[p.plan_type] ?? p.plan_type : '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    flexShrink: 0,
                    background:
                      p.status === 'active'
                        ? '#dcfce7'
                        : p.status === 'trial'
                        ? '#fef3c7'
                        : '#f3f4f6',
                    color:
                      p.status === 'active'
                        ? '#16a34a'
                        : p.status === 'trial'
                        ? '#a16207'
                        : '#6b7280',
                  }}
                >
                  {p.status}
                </span>
                <PlanProgressDots planMonths={p.programDur} currentMonth={m} isActiveStatus={p.status === 'active'} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact dot-progress strip next to the ACTIVE/INACTIVE pill (Ebright CEP batch,
 * Part 4) — display-only, derived from the same programDur/current-month data
 * already shown in the PLAN/MONTH columns, no new data model. Dot count always
 * matches the parent's actual plan length (3/6/9/12), never hardcoded to 12.
 */
function PlanProgressDots({
  planMonths,
  currentMonth,
  isActiveStatus,
}: {
  planMonths: number;
  currentMonth: number;
  isActiveStatus: boolean;
}) {
  if (!planMonths || planMonths <= 0) return null;
  const clampedCurrent = Math.min(Math.max(currentMonth, 0), planMonths);
  const fillColor = isActiveStatus ? '#22c55e' : '#9ca3af';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
      {Array.from({ length: planMonths }, (_, i) => {
        const monthNum = i + 1;
        const filled = monthNum <= clampedCurrent;
        const isCurrent = monthNum === clampedCurrent;
        return (
          <span
            key={i}
            title={`Month ${monthNum}${isCurrent ? ' (current)' : ''}`}
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              flexShrink: 0,
              boxSizing: 'border-box',
              background: filled ? fillColor : 'transparent',
              border: isCurrent ? '2px solid #dc2626' : filled ? 'none' : '1px solid #d1d5db',
            }}
          />
        );
      })}
    </div>
  );
}
