import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, borderRadius, className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        ...(borderRadius ? { borderRadius } : {}),
        ...style,
      }}
    />
  );
}

export function SkeletonText({ lines = 3, widths }: { lines?: number; widths?: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={widths?.[i] || (i === lines - 1 ? '60%' : '100%')}
          height={14}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return <div className="skeleton skeleton-card" style={{ height }} />;
}

export function SkeletonKPIRow({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 20 }}>
          <Skeleton width={80} height={12} />
          <Skeleton width={120} height={32} style={{ marginTop: 8 }} />
          <Skeleton width={100} height={12} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <Skeleton width={200} height={14} />
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 16,
            padding: '12px 16px',
            borderBottom: r < rows - 1 ? '1px solid var(--color-border)' : 'none',
          }}
        >
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} width={c === 0 ? '80%' : '60%'} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}
