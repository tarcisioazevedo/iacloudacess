import React from 'react';

interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}

export function DonutChart({
  segments,
  size = 140,
  thickness = 20,
  centerLabel,
  centerValue,
  className = '',
}: DonutChartProps) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) return null;

  const radius = (size - thickness) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let currentAngle = -90; // Start from top

  const arcs = segments.map((seg) => {
    const percentage = seg.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    const dashArray = `${circumference * percentage} ${circumference * (1 - percentage)}`;
    const dashOffset = -((startAngle + 90) / 360) * circumference;

    return {
      ...seg,
      percentage,
      dashArray,
      dashOffset,
    };
  });

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0 }}>
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={thickness}
        />
        {/* Segments */}
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        ))}
        {/* Center text */}
        {(centerValue !== undefined || centerLabel) && (
          <>
            {centerValue !== undefined && (
              <text
                x={center}
                y={center - (centerLabel ? 4 : 0)}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-text)"
                fontSize={size / 5}
                fontWeight="800"
                fontFamily="var(--font-sans)"
              >
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text
                x={center}
                y={center + size / 6}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-text-muted)"
                fontSize={size / 12}
                fontWeight="500"
                fontFamily="var(--font-sans)"
              >
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {seg.label}
            </span>
            <span style={{ fontWeight: 600, marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
