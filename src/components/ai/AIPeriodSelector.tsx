import React from 'react';

export type Period = 'today' | 'week' | 'month' | 'quarter' | 'custom';

interface Props {
  value: Period;
  onChange: (p: Period) => void;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
}

const OPTIONS: { value: Period; label: string }[] = [
  { value: 'today',   label: 'Hoje' },
  { value: 'week',    label: '7 dias' },
  { value: 'month',   label: '30 dias' },
  { value: 'quarter', label: '90 dias' },
  { value: 'custom',  label: 'Personalizado' },
];

export default function AIPeriodSelector({ value, onChange, customStart = '', customEnd = '', onCustomChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: value === opt.value ? 700 : 500,
              background: value === opt.value ? 'var(--color-primary-600)' : 'transparent',
              color: value === opt.value ? '#fff' : 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === 'custom' && onCustomChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date" value={customStart}
            onChange={e => onCustomChange(e.target.value, customEnd)}
            style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>até</span>
          <input
            type="date" value={customEnd}
            onChange={e => onCustomChange(customStart, e.target.value)}
            style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '5px 8px', fontSize: 13 }}
          />
        </div>
      )}
    </div>
  );
}
