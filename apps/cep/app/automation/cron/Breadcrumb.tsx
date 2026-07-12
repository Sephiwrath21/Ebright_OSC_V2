'use client';

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280' }}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        return (
          <span key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {segment.href && !isLast ? (
              <a href={segment.href} style={{ color: '#6b7280', textDecoration: 'none' }}>
                {segment.label}
              </a>
            ) : (
              <span style={{ color: isLast ? '#ef4444' : '#6b7280', fontWeight: isLast ? 600 : 400 }}>
                {segment.label}
              </span>
            )}
            {!isLast && <span style={{ color: '#d1d5db' }}>/</span>}
          </span>
        );
      })}
    </nav>
  );
}