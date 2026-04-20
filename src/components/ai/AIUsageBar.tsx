import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';

interface Props {
  token: string;
}

interface UsageSummary {
  usedTokensMonth: number;
  monthlyTokenQuota: number;
}

export default function AIUsageBar({ token }: Props) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/ai/usage', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const tenant = d.configs?.find((c: any) => !c.schoolId);
        if (tenant) setUsage({ usedTokensMonth: tenant.usedTokensMonth, monthlyTokenQuota: tenant.monthlyTokenQuota });
      })
      .catch(() => {});
  }, [token]);

  if (!usage) return null;

  const pct = Math.min(100, Math.round((usage.usedTokensMonth / usage.monthlyTokenQuota) * 100));
  const color = pct > 85 ? '#dc2626' : pct > 60 ? '#d97706' : '#16a34a';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={`${usage.usedTokensMonth.toLocaleString()} / ${usage.monthlyTokenQuota.toLocaleString()} tokens`}>
      <Cpu size={13} style={{ color: 'var(--color-text-muted)' }} />
      <div style={{ width: 80, height: 5, background: 'var(--color-border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  );
}
