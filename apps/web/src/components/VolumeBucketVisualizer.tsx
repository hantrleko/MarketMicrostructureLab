import React from 'react';
import { Flame } from 'lucide-react';

interface VolumeBucketVisualizerProps {
  bucketSizeBtc: number;
  buyVolume: number;
  sellVolume: number;
  imbalance: number;
  vpinValue: number | null;
  vwap: number;
  bucketIdx: number;
}

export const VolumeBucketVisualizer: React.FC<VolumeBucketVisualizerProps> = ({
  bucketSizeBtc,
  buyVolume,
  sellVolume,
  imbalance,
  vpinValue,
  vwap,
  bucketIdx
}) => {
  const total = Math.max(0.001, buyVolume + sellVolume);
  const buyPct = Math.min(100, Math.max(0, (buyVolume / total) * 100));
  const sellPct = Math.min(100, Math.max(0, (sellVolume / total) * 100));
  const isToxic = (vpinValue ?? 0) >= 0.35;
  const isModerate = (vpinValue ?? 0) >= 0.20 && !isToxic;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
        border: `1px solid ${isToxic ? 'rgba(244, 63, 94, 0.5)' : 'rgba(56, 189, 248, 0.3)'}`,
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}
    >
      {/* Title with explanation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Flame size={16} style={{ color: isToxic ? '#f43f5e' : '#38bdf8' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
            等体积时钟切片物理直觉图 (第 #{bucketIdx} 号量桶)
          </span>
        </div>
        <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
          容量上限：<strong style={{ color: '#fff' }}>{bucketSizeBtc} BTC</strong> · 桶内均价: <strong style={{ color: '#38bdf8' }}>${vwap.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
        </span>
      </div>

      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
        物理时间会骗人（饭点没成交，开盘几秒成交上万笔）。因此我们用<strong>“固定量桶”</strong>代替钟表时间：不论花多久，只要吃单累计满 <strong>{bucketSizeBtc} BTC</strong> 就封桶。
      </div>

      {/* Visual Cylinder Measuring Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem' }}>
          <span style={{ color: '#38bdf8', fontWeight: 700 }}>
            主动买入水柱: {buyVolume.toFixed(2)} BTC ({buyPct.toFixed(1)}%)
          </span>
          <span style={{ color: '#fb923c', fontWeight: 700 }}>
            主动卖出水柱: {sellVolume.toFixed(2)} BTC ({sellPct.toFixed(1)}%)
          </span>
        </div>

        {/* Cylinder Bar */}
        <div
          style={{
            height: '24px',
            background: '#090d16',
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
            border: '1px solid #334155',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
          }}
        >
          <div
            style={{
              width: `${buyPct}%`,
              background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#080b10',
              transition: 'width 0.3s ease'
            }}
          >
            {buyPct > 15 ? `${buyPct.toFixed(0)}% 买` : ''}
          </div>
          <div
            style={{
              width: `${sellPct}%`,
              background: 'linear-gradient(90deg, #f97316, #fb923c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#080b10',
              transition: 'width 0.3s ease'
            }}
          >
            {sellPct > 15 ? `${sellPct.toFixed(0)}% 卖` : ''}
          </div>
        </div>
      </div>

      {/* Imbalance & Toxicity Outcome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isToxic ? 'rgba(244, 63, 94, 0.12)' : isModerate ? 'rgba(251, 191, 36, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: `1px solid ${isToxic ? 'rgba(244, 63, 94, 0.3)' : isModerate ? 'rgba(251, 191, 36, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '0.72rem'
        }}
      >
        <div>
          <span style={{ color: '#94a3b8' }}>单桶买卖净失衡差额：</span>
          <strong style={{ color: '#fff', marginLeft: '4px' }}>{imbalance.toFixed(2)} BTC</strong>
        </div>
        <div style={{ fontWeight: 800, color: isToxic ? '#f43f5e' : isModerate ? '#fbbf24' : '#10b981' }}>
          {isToxic ? '🚨 单向极端知情扫货（高危毒性）' : isModerate ? '⚠️ 存在主力偏向吃单' : '✅ 散户多空自然博弈（安全）'}
        </div>
      </div>
    </div>
  );
};
