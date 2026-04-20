import React from 'react';
import { AlertTriangle, AlertCircle, Info, Zap } from 'lucide-react';

export interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestedAction: string;
}

const SEVERITY_CONFIG = {
  high:   { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', icon: <AlertCircle size={14} />, label: 'Alta' },
  medium: { bg: '#fffbeb', border: '#fcd34d', text: '#d97706', icon: <AlertTriangle size={14} />, label: 'Média' },
  low:    { bg: '#f0f9ff', border: '#7dd3fc', text: '#0369a1', icon: <Info size={14} />, label: 'Baixa' },
};

export function AIAnomalyBadge({ severity }: { severity: Anomaly['severity'] }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

export function AIAnomalyList({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-muted)' }}>
        <Zap size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
        <p style={{ fontSize: 13, margin: 0 }}>Nenhuma anomalia detectada</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {anomalies.map((a, i) => {
        const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.low;
        return (
          <div key={i} style={{
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            borderRadius: 8, padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AIAnomalyBadge severity={a.severity} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{a.type}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 6px' }}>{a.description}</p>
            <p style={{ fontSize: 12, color: cfg.text, margin: 0, fontWeight: 500 }}>
              → {a.suggestedAction}
            </p>
          </div>
        );
      })}
    </div>
  );
}
