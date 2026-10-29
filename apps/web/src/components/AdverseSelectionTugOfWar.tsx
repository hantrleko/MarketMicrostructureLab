import React from 'react';
import { Scale } from 'lucide-react';

interface AdverseSelectionTugOfWarProps {
  grossSpreadCapturedUsd: number;
  toxicFlowLossUsd: number;
  netPnlUsd: number;
  effectiveSpreadBps: number;
  adverseSelectionBps: number;
  realizedSpreadBps: number;
  horizonSec: number;
}

export const AdverseSelectionTugOfWar: React.FC<AdverseSelectionTugOfWarProps> = ({
  grossSpreadCapturedUsd,
  toxicFlowLossUsd,
  netPnlUsd,
  effectiveSpreadBps,
  adverseSelectionBps,
  realizedSpreadBps,
  horizonSec
}) => {
  const isProfitable = netPnlUsd >= 0;
  const totalVolumeStake = grossSpreadCapturedUsd + toxicFlowLossUsd;
  const spreadShare = totalVolumeStake > 0 ? (grossSpreadCapturedUsd / totalVolumeStake) * 100 : 50;
  const lossShare = totalVolumeStake > 0 ? (toxicFlowLossUsd / totalVolumeStake) * 100 : 50;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
        border: `1px solid ${isProfitable ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.4)'}`,
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Scale size={18} style={{ color: isProfitable ? '#10b981' : '#f43f5e' }} />
          <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>
            做市商「毛点差收益 vs 逆向被套牢」拔河天平 ({horizonSec} 秒窗口)
          </span>
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '4px',
            background: isProfitable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isProfitable ? '#10b981' : '#f87171',
            border: `1px solid ${isProfitable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
          }}
        >
          {isProfitable ? '做市商净赚钱' : '做市商被套牢倒贴'}
        </span>
      </div>

      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
        <strong>白话机制（捡芝麻 vs 压路机）：</strong> 做市商挂限价单，就像在压路机前捡硬币。每成一笔能赚取极微薄的买卖半利差（绿色）。但若对手方是掌握真实趋势的知情巨鲸，成交后价格持续暴跌/暴涨，做市商刚接到的货就会遭受巨大的逆向亏损（红色）。
      </div>

      {/* Visual Tug-of-War Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 700 }}>
          <span style={{ color: '#10b981' }}>
            [+] 赚取的毛利差: +${grossSpreadCapturedUsd.toLocaleString()} ({effectiveSpreadBps.toFixed(2)} bps)
          </span>
          <span style={{ color: '#f43f5e' }}>
            [-] 逆向选择亏损: -${toxicFlowLossUsd.toLocaleString()} ({adverseSelectionBps.toFixed(2)} bps)
          </span>
        </div>

        {/* Tug-of-war Bar */}
        <div
          style={{
            height: '24px',
            background: '#090d16',
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
            border: '1px solid #334155'
          }}
        >
          <div
            style={{
              width: `${Math.max(5, Math.min(95, spreadShare))}%`,
              background: 'linear-gradient(90deg, #059669, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#080b10',
              transition: 'width 0.3s ease'
            }}
          >
            毛利润
          </div>
          <div
            style={{
              width: `${Math.max(5, Math.min(95, lossShare))}%`,
              background: 'linear-gradient(90deg, #e11d48, #f43f5e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#fff',
              transition: 'width 0.3s ease'
            }}
          >
            知情毒性侵蚀
          </div>
        </div>
      </div>

      {/* Final Outcome Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: isProfitable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderRadius: '4px',
          border: `1px solid ${isProfitable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
        }}
      >
        <div>
          <div style={{ fontSize: '0.70rem', color: '#cbd5e1' }}>
            真正装进做市商口袋的净利差 (Realized Spread)：
          </div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: isProfitable ? '#10b981' : '#f87171' }}>
            {isProfitable ? '+' : ''}${netPnlUsd.toLocaleString()} ({realizedSpreadBps.toFixed(2)} bps)
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: '0.72rem', maxWidth: '300px', color: '#e2e8f0' }}>
          {isProfitable ? (
            <span style={{ color: '#6ee7b7' }}>
              <strong>盘口健康：</strong> 点差收入完全能覆盖知情滑点，做市策略稳健盈利。
            </span>
          ) : (
            <span style={{ color: '#fca5a5' }}>
              <strong>危险失血：</strong> 逆向选择亏损已超额击穿点差，做市商每撮合一笔都在倒贴巨鲸！
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
