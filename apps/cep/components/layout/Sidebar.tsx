'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_SECTIONS: Array<{
  label?: string;
  items: Array<{ href: string; label: string; icon: string }>;
}> = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '📊' },
      { href: '/parents', label: 'Parents', icon: '👥' },
      { href: '/enrollment', label: 'Enrollment', icon: '📈' },
    ],
  },
  {
    label: 'Messaging',
    items: [
      { href: '/content', label: 'Content', icon: '✏️' },
      { href: '/blast', label: 'Blast', icon: '📤' },
      { href: '/promo', label: 'Promo', icon: '📣' },
      { href: '/calendars', label: 'Calendars', icon: '📅' },
    ],
  },
  {
    label: 'Automation',
    items: [
      { href: '/automation', label: 'Rules', icon: '⚙️' },
      { href: '/automation/queue', label: 'Queue', icon: '📥' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/automation/cron', label: 'Cron monitor', icon: '⏱️' },
      { href: '/admin/rules', label: 'Rules admin', icon: '🛠️' },
      { href: '/branches', label: 'Branches', icon: '🏢' },
      { href: '/admin/demo', label: 'Demo controls', icon: '🎬' },
      { href: '/admin/automation-tools', label: 'Automation tools', icon: '🧰' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname() || '';
  const sections = NAV_SECTIONS;

  // Longest-matching href wins so a nested route (e.g. /automation/cron) never
  // also lights up a shorter sibling route that happens to be a text prefix of
  // it (e.g. /automation) — evaluating each item's prefix match in isolation
  // would highlight both at once.
  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside
      style={{
        width: '232px',
        flexShrink: 0,
        background: '#7f1d1d',
        color: 'rgba(255,255,255,0.6)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '0 20px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            color: '#dc2626',
            fontSize: '14px',
          }}
        >
          E
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: '14px', lineHeight: 1 }}>Ebright</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', letterSpacing: '0.8px', textTransform: 'uppercase', marginTop: '2px' }}>
            SMS Portal
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {sections.map((section, idx) => (
          <div key={idx} style={{ marginBottom: '20px' }}>
            {section.label && (
              <div
                style={{
                  padding: '0 20px 8px',
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                }}
              >
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 20px',
                    fontSize: '13px',
                    color: active ? '#ffffff' : 'rgba(255,255,255,0.7)',
                    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
                    borderRight: active ? '2px solid #ffffff' : '2px solid transparent',
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
        <div>v1.0 · Internal tool</div>
      </div>
    </aside>
  );
}
