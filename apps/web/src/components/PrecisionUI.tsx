import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';

/* =========================================================================
   1. PrecisionSlider: High-precision financial slider with steppers
   ========================================================================= */
interface PrecisionSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  color?: 'cyan' | 'amber' | 'emerald' | 'rose' | 'purple';
  accentColor?: string;
  formatter?: (val: number) => string;
  onChange: (val: number) => void;
  quickPresets?: number[];
}

const COLOR_MAP: Record<string, { accent: string; glow: string; track: string }> = {
  cyan: { accent: '#00f0ff', glow: 'rgba(0, 240, 255, 0.25)', track: 'rgba(0, 240, 255, 0.4)' },
  amber: { accent: '#f59e0b', glow: 'rgba(245, 158, 11, 0.25)', track: 'rgba(245, 158, 11, 0.4)' },
  emerald: { accent: '#10b981', glow: 'rgba(16, 185, 129, 0.25)', track: 'rgba(16, 185, 129, 0.4)' },
  rose: { accent: '#f43f5e', glow: 'rgba(244, 63, 94, 0.25)', track: 'rgba(244, 63, 94, 0.4)' },
  purple: { accent: '#c084fc', glow: 'rgba(192, 132, 252, 0.25)', track: 'rgba(192, 132, 252, 0.4)' }
};

export const PrecisionSlider: React.FC<PrecisionSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  color = 'cyan',
  accentColor,
  formatter,
  onChange,
  quickPresets
}) => {
  const base = COLOR_MAP[color] || COLOR_MAP.cyan;
  const c = accentColor ? { accent: accentColor, glow: 'rgba(56, 189, 248, 0.25)', track: accentColor } : base;
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handleStep = (direction: -1 | 1) => {
    const next = Math.min(max, Math.max(min, Number((value + direction * step).toFixed(4))));
    onChange(next);
  };

  const displayVal = formatter ? formatter(value) : `${value} ${unit}`.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.74rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#94a3b8', fontWeight: 600 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => handleStep(-1)}
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              color: '#cbd5e1',
              borderRadius: '3px',
              width: '18px',
              height: '18px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0
            }}
            title="微调扣减"
          >
            <Minus size={10} />
          </button>
          <strong
            className="mono"
            style={{
              color: c.accent,
              minWidth: '60px',
              textAlign: 'center',
              background: 'rgba(15, 23, 42, 0.8)',
              padding: '1px 6px',
              borderRadius: '3px',
              border: `1px solid ${c.track}`,
              fontSize: '0.76rem'
            }}
          >
            {displayVal}
          </strong>
          <button
            type="button"
            onClick={() => handleStep(1)}
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              color: '#cbd5e1',
              borderRadius: '3px',
              width: '18px',
              height: '18px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0
            }}
            title="微调增加"
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', height: '16px', display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            width: '100%',
            accentColor: c.accent,
            cursor: 'pointer',
            height: '4px',
            background: `linear-gradient(to right, ${c.accent} 0%, ${c.accent} ${pct}%, rgba(51, 65, 85, 0.6) ${pct}%, rgba(51, 65, 85, 0.6) 100%)`,
            borderRadius: '2px',
            outline: 'none'
          }}
        />
      </div>

      {quickPresets && quickPresets.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '1px' }}>
          {quickPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              style={{
                flex: 1,
                background: Math.abs(value - preset) < 0.001 ? c.glow : 'rgba(30, 41, 59, 0.6)',
                border: `1px solid ${Math.abs(value - preset) < 0.001 ? c.accent : 'rgba(71, 85, 105, 0.4)'}`,
                color: Math.abs(value - preset) < 0.001 ? c.accent : '#94a3b8',
                borderRadius: '3px',
                padding: '2px 0',
                fontSize: '0.66rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   2. SegmentedControl: Linear-style pill switcher
   ========================================================================= */
export interface SegmentOption<T extends string | number> {
  id?: T;
  value?: T;
  label: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: 'sm' | 'md';
  activeColor?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  activeColor = '#38bdf8'
}: SegmentedControlProps<T>) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(71, 85, 105, 0.5)',
        borderRadius: '6px',
        padding: '3px',
        gap: '3px',
        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)'
      }}
    >
      {options.map((opt) => {
        const optVal = (opt.id !== undefined ? opt.id : opt.value) as T;
        const isActive = optVal === value;
        return (
          <button
            key={String(optVal)}
            type="button"
            onClick={() => onChange(optVal)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: size === 'sm' ? '3px 8px' : '5px 12px',
              borderRadius: '4px',
              fontSize: size === 'sm' ? '0.68rem' : '0.74rem',
              fontWeight: isActive ? 700 : 500,
              background: isActive ? 'rgba(30, 41, 59, 0.95)' : 'transparent',
              color: isActive ? activeColor : '#94a3b8',
              border: isActive ? `1px solid ${activeColor}40` : '1px solid transparent',
              boxShadow: isActive ? '0 2px 6px rgba(0, 0, 0, 0.35)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap'
            }}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {opt.badge && (
              <span
                style={{
                  fontSize: '0.60rem',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: isActive ? activeColor : 'rgba(71, 85, 105, 0.5)',
                  color: isActive ? '#000' : '#cbd5e1',
                  fontWeight: 800
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================================
   3. MiniSparkline: SVG trend curve for metric KPI cards
   ========================================================================= */
interface MiniSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  color = '#00f0ff',
  width = 60,
  height = 24
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((d - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylineStr = points.join(' ');
  const areaStr = `${points[0]} ${polylineStr} ${(width - 2).toFixed(1)},${height} 2,${height}`;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sparkGrad_${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <polygon points={areaStr} fill={`url(#sparkGrad_${color.replace('#', '')})`} />
      <polyline points={polylineStr} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* =========================================================================
   4. CollapsibleTheory: Elegant accordion for LaTeX formulas & proof
   ========================================================================= */
interface CollapsibleTheoryProps {
  title: string;
  badge?: string;
  summary?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  defaultOpen?: boolean;
}

export const CollapsibleTheory: React.FC<CollapsibleTheoryProps> = ({
  title,
  badge = 'THEORY',
  summary,
  subtitle,
  children,
  defaultExpanded = false,
  defaultOpen = false
}) => {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded || defaultOpen);

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(71, 85, 105, 0.4)',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        boxShadow: expanded ? '0 4px 16px rgba(0, 0, 0, 0.35)' : 'none'
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          cursor: 'pointer',
          background: expanded ? 'rgba(30, 41, 59, 0.6)' : 'transparent',
          borderBottom: expanded ? '1px solid rgba(71, 85, 105, 0.4)' : 'none',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.62rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 6px', borderRadius: '3px', fontWeight: 800, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            {badge}
          </span>
          <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#f8fafc' }}>
            {title}
          </span>
          {!expanded && (summary || subtitle) && (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '6px' }}>
              &mdash; {summary || subtitle}
            </span>
          )}
        </div>
        <div style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.70rem', marginLeft: '12px' }}>
          <span>{expanded ? '收起推导' : '展开推导'}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '14px 16px', fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  );
};
