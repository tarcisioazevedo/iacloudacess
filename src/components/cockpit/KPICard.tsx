import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Sparkline } from '../charts/Sparkline';

interface KPICardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  iconBg?: string;
  trend?: {
    value: string | number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  sparklineData?: number[];
  sparklineColor?: string;
  suffix?: string;
  loading?: boolean;
  className?: string;
}

export function KPICard({
  label,
  value,
  icon,
  iconBg = 'var(--color-primary-50)',
  trend,
  sparklineData,
  sparklineColor,
  suffix,
  loading = false,
  className = '',
}: KPICardProps) {
  if (loading) {
    return (
      <div className={`kpi-card ${className}`}>
        <div className="skeleton" style={{ width: 80, height: 12 }} />
        <div className="skeleton" style={{ width: 100, height: 32, marginTop: 8 }} />
        <div className="skeleton" style={{ width: 90, height: 12, marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div className={`kpi-card animate-fade-in-up ${className}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="kpi-card-label">{label}</span>
        {icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <span className="kpi-card-value">{value}</span>
        {suffix && (
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            {suffix}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {trend && (
          <span className={`kpi-card-trend ${trend.direction}`}>
            {trend.direction === 'up' && <TrendingUp size={13} />}
            {trend.direction === 'down' && <TrendingDown size={13} />}
            {trend.direction === 'neutral' && <Minus size={13} />}
            {trend.value}{trend.label ? ` ${trend.label}` : ''}
          </span>
        )}
        {sparklineData && sparklineData.length > 1 && (
          <div style={{ marginLeft: 'auto' }}>
            <Sparkline
              data={sparklineData}
              width={80}
              height={24}
              color={sparklineColor || (trend?.direction === 'down' ? 'var(--color-danger)' : 'var(--chart-1)')}
              strokeWidth={1.5}
              fillOpacity={0.08}
            />
          </div>
        )}
      </div>
    </div>
  );
}
