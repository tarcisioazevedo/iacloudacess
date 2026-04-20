import React from 'react';
import { RefreshCw, Zap, Clock } from 'lucide-react';
import type { Anomaly } from './AIAnomalyBadge';
import { AIAnomalyList } from './AIAnomalyBadge';

interface Props {
  title: string;
  icon?: React.ReactNode;
  text?: string | null;
  anomalies?: Anomaly[];
  loading: boolean;
  cached?: boolean;
  latencyMs?: number;
  onRefresh: () => void;
  emptyLabel?: string;
}

export default function AIInsightCard({ title, icon, text, anomalies, loading, cached, latencyMs, onRefresh, emptyLabel }: Props) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px', borderBottom: '1px solid var(--color-border)',
      }}>
        {icon}
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', flex: 1 }}>{title}</span>
        {cached && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
            background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
          }}>
            cache
          </span>
        )}
        {latencyMs && latencyMs > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--color-text-muted)' }}>
            <Clock size={10} />{latencyMs}ms
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Atualizar"
          style={{
            background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            color: 'var(--color-text-muted)', padding: 4, borderRadius: 4,
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>
        {loading ? (
          <AILoadingSkeleton />
        ) : anomalies !== undefined ? (
          <AIAnomalyList anomalies={anomalies} />
        ) : text ? (
          <div style={{
            fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-secondary)',
            whiteSpace: 'pre-wrap',
          }}>
            {text}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--color-text-muted)' }}>
            <Zap size={24} style={{ marginBottom: 8, opacity: 0.35 }} />
            <p style={{ fontSize: 13, margin: 0 }}>{emptyLabel ?? 'Clique em atualizar para gerar insight'}</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AILoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[90, 75, 60, 80].map((w, i) => (
        <div key={i} style={{
          height: 12, borderRadius: 4, background: 'var(--color-bg)',
          width: `${w}%`, animation: 'pulse 1.5s ease-in-out infinite',
          animationDelay: `${i * 0.15}s`,
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`}</style>
    </div>
  );
}
