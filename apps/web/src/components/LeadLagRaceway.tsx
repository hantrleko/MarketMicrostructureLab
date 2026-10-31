import React from 'react';
import { GitCompare, Clock } from 'lucide-react';

interface LeadLagRacewayProps {
  peakLeadMs: number;
  peakCrossCorrelation: number;
  futuresSharePct?: number | null;
  spotSharePct?: number | null;
}

export const LeadLagRaceway: React.FC<LeadLagRacewayProps> = ({
  peakLeadMs,
  peakCrossCorrelation,
  futuresSharePct,
  spotSharePct
}) => {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitCompare size={18} style={{ color: '#fbbf24' }} />
          <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>
            期现 +{peakLeadMs}ms 信号传导双轨赛道示意图
          </span>
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.3)'
          }}
        >
          永续合约先行 · 现货滞后跟动
        </span>
      </div>

      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
        <strong>白话机制（高铁与慢车）：</strong> 加密市场 100 倍杠杆、超低手续费的特点，吸引了全球最聪明的知情量化机构首先在<strong>永续合约</strong>建仓扫货。价格在合约瞬间爆发后，通过跨市场搬砖套利者传递到<strong>现货</strong>，中间存在约 <strong>+{peakLeadMs} 毫秒</strong> 的物理传导时滞。
      </div>

      {/* Dual Track Visual Timeline */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid #334155',
          borderRadius: '6px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {/* Track 1: Futures (Fast Train) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '110px', fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', flexShrink: 0 }}>
            ⚡ 币安永续合约
          </div>
          <div style={{ flex: 1, position: 'relative', height: '18px', background: '#1e293b', borderRadius: '4px' }}>
            <div
              style={{
                position: 'absolute',
                left: '0%',
                width: '45px',
                height: '100%',
                background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.64rem',
                fontWeight: 800,
                color: '#080b10'
              }}
            >
              0ms 爆发
            </div>
            <div style={{ position: 'absolute', left: '55px', top: '2px', fontSize: '0.66rem', color: '#fde68a' }}>
              &larr; 知情主力与算法资金最先在此入场 (信息份额 {futuresSharePct != null ? `${futuresSharePct.toFixed(1)}%` : '---'})
            </div>
          </div>
        </div>

        {/* Transmission Window Bridge */}
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: '120px', gap: '8px' }}>
          <div
            style={{
              padding: '3px 10px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px dashed #38bdf8',
              fontSize: '0.68rem',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={12} />
            <span>
              <strong>+{peakLeadMs} 毫秒黄金窗口：</strong> 现货做市商紧急撤单 / 跨市场做市套利对冲 (互相关 r = {peakCrossCorrelation})
            </span>
          </div>
        </div>

        {/* Track 2: Spot (Slow Train) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '110px', fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', flexShrink: 0 }}>
            🐢 币安现货盘口
          </div>
          <div style={{ flex: 1, position: 'relative', height: '18px', background: '#1e293b', borderRadius: '4px' }}>
            <div
              style={{
                position: 'absolute',
                left: '35%',
                width: '65px',
                height: '100%',
                background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.64rem',
                fontWeight: 800,
                color: '#080b10'
              }}
            >
              +{peakLeadMs}ms 跟动
            </div>
            <div style={{ position: 'absolute', left: 'calc(35% + 72px)', top: '2px', fontSize: '0.66rem', color: '#93c5fd' }}>
              &larr; 被动吸收价格传导，成为价格跟随者 (信息份额 {spotSharePct != null ? `${spotSharePct.toFixed(1)}%` : '---'})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
