'use client';

import { useRouter, usePathname } from 'next/navigation';

interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface FilterBarProps {
  filters: FilterDef[];
  current: Record<string, string>;
}

export function FilterBar({ filters, current }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {filters.map((f) => (
        <select
          key={f.key}
          value={current[f.key] ?? 'all'}
          onChange={(e) => handleChange(f.key, e.target.value)}
          className="ebright-select"
          style={{ width: 'auto' }}
        >
          <option value="all">All {f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
