import React from 'react';

interface BarItem {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
}

interface HorizontalBarChartProps {
  items: BarItem[];
  showValues?: boolean;
  maxValue?: number;
  height?: number;
  className?: string;
}

export function HorizontalBarChart({
  items,
  showValues = true,
  maxValue,
  height = 24,
  className = '',
}: HorizontalBarChartProps) {
  const max = maxValue || Math.max(...items.map(i => i.value), 1);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => {
        const pct = Math.max((item.value / max) * 100, 2);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                width: 80,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--color-text)',
                flexShrink: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={item.label}
            >
              {item.label}
            </span>
            <div
              style={{
                flex: 1,
                height,
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: item.color || 'var(--chart-1)',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'width 0.5s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: 8,
                }}
              >
                {showValues && pct > 25 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                    {item.value}{item.suffix || ''}
                  </span>
                )}
              </div>
            </div>
            {showValues && pct <= 25 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', flexShrink: 0, minWidth: 36 }}>
                {item.value}{item.suffix || ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface HeatmapCellData {
  label: string;
  value: number;
}

interface HeatmapGridProps {
  cells: HeatmapCellData[];
  maxValue?: number;
  color?: string;
  cellSize?: number;
  className?: string;
}

export function HeatmapGrid({
  cells,
  maxValue,
  color = 'var(--chart-1)',
  cellSize = 36,
  className = '',
}: HeatmapGridProps) {
  const max = maxValue || Math.max(...cells.map(c => c.value), 1);

  return (
    <div className={className} style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {cells.map((cell, i) => {
        const intensity = Math.max(cell.value / max, 0);
        return (
          <div
            key={i}
            title={`${cell.label}: ${cell.value}`}
            style={{
              width: cellSize,
              height: cellSize,
              borderRadius: 'var(--radius-xs)',
              background: color,
              opacity: Math.max(intensity * 0.85 + 0.1, 0.08),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              color: intensity > 0.5 ? '#fff' : 'var(--color-text-muted)',
              cursor: 'default',
              transition: 'opacity 0.3s ease',
            }}
          >
            {cell.label}
          </div>
        );
      })}
    </div>
  );
}
