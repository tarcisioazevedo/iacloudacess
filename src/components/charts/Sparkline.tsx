import React, { useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  showDots?: boolean;
  showLastDot?: boolean;
  className?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'var(--chart-1)',
  fillOpacity = 0.1,
  strokeWidth = 2,
  showDots = false,
  showLastDot = true,
  className = '',
}: SparklineProps) {
  const pathD = useMemo(() => {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 4;
    const w = width - padding * 2;
    const h = height - padding * 2;

    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * w,
      y: padding + h - ((v - min) / range) * h,
    }));

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;

    return { line, area, points };
  }, [data, width, height]);

  if (!pathD || !data || data.length < 2) return null;

  return (
    <svg
      className={`chart-container ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
    >
      {/* Fill area */}
      <path d={pathD.area} fill={color} opacity={fillOpacity} />
      {/* Line */}
      <path d={pathD.line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {showDots && pathD.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}
      {showLastDot && pathD.points.length > 0 && (
        <circle
          cx={pathD.points[pathD.points.length - 1].x}
          cy={pathD.points[pathD.points.length - 1].y}
          r={3}
          fill={color}
          stroke="var(--color-surface)"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
