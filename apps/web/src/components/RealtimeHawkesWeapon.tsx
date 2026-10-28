import React, { useState } from 'react';
import { Flame, Bell, BellOff, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { HawkesSnapshot, HawkesCascadeEvent } from '../utils/hawkesEngine';
import { MMLChart } from './MMLChart';

interface RealtimeHawkesWeaponProps {
  snapshot: HawkesSnapshot;
  symbol?: string;
}

export const RealtimeHawkesWeapon: React.FC<RealtimeHawkesWeaponProps> = ({ snapshot, symbol = 'BTC/USDT' }) => {
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Play beep on supercritical burst if audio enabled
  React.useEffect(() => {
    if (snapshot.isSupercritical && audioEnabled) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 alert
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {}
    }
  }, [snapshot.isSupercritical, audioEnabled]);

  // Chart configuration for rolling 50-tick Hawkes waveform
  const timeLabels = snapshot.history.map((h) => h.timeStr);
  const buyLambda = snapshot.history.map((h) => h.lambdaBuy);
  const sellLambda = snapshot.history.map((h) => h.lambdaSell);
  const rhoValues = snapshot.history.map((h) => h.branchingRatio);

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono', fontSize: 12 }
    },
    grid: [
      { left: '4%', right: '3%', top: '12%', height: '48%' },
      { left: '4%', right: '3%', top: '68%', height: '24%' }
    ],
    xAxis: [
      {
        type: 'category',
        gridIndex: 0,
        data: timeLabels,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { show: false }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: timeLabels,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { color: '#64748b', fontSize: 10, interval: 'auto' }
      }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        splitLine: { lineStyle: { color: '#172033', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}/s' }
      },
      {
        type: 'value',
        gridIndex: 1,
        min: 0,
        max: (value: any) => Math.max(1.4, Math.ceil(value.max * 1.2)),
        splitLine: { lineStyle: { color: '#172033', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      }
    ],
    series: [
      {
        name: 'λ Buy (Intensity)',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: buyLambda,
        lineStyle: { color: '#00e5ff', width: 2 },
        areaStyle: {
          color: 'rgba(0, 229, 255, 0.12)'
        },
        showSymbol: false
      },
      {
        name: 'λ Sell (Intensity)',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sellLambda,
        lineStyle: { color: '#ff9100', width: 2 },
        areaStyle: {
          color: 'rgba(255, 145, 0, 0.12)'
        },
        showSymbol: false
      },
      {
        name: 'Branching Ratio ρ(t)',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: rhoValues,
        lineStyle: { color: snapshot.isSupercritical ? '#ef4444' : '#ffd700', width: 2.2 },
        showSymbol: false,
        markLine: {
          symbol: 'none',
          data: [
            {
              yAxis: 1.0,
              lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
              label: {
                formatter: 'CRITICAL THRESHOLD (ρ = 1.0)',
                color: '#ef4444',
                fontSize: 10,
                position: 'insideEndTop'
              }
            }
          ]
        }
      }
    ]
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Supercritical Avalanche Alert Banner */}
      {snapshot.isSupercritical && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(15, 23, 42, 0.9))',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)',
            animation: 'pulse 1.5s infinite'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Flame size={22} color="#ef4444" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#fff', letterSpacing: '0.04em' }}>
                🚨 HAWKES SUPERCRITICAL CASCADE ALERT &bull; 订单流自激雪崩警报！
              </div>
              <div style={{ fontSize: '0.74rem', color: '#fca5a5', marginTop: '2px' }}>
                实时分支比 <strong className="mono" style={{ color: '#fff' }}>&rho; = {snapshot.branchingRatio.toFixed(3)} &ge; 1.0</strong> &bull; 瞬时触发强度 <strong className="mono" style={{ color: '#fff' }}>&lambda; = {snapshot.lambdaTotal.toFixed(1)} trades/sec</strong> &bull; 羊群自激吃单蔓延中
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              style={{
                background: audioEnabled ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${audioEnabled ? '#ef4444' : 'var(--border-color)'}`,
                color: audioEnabled ? '#fff' : 'var(--text-dim)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 600
              }}
            >
              {audioEnabled ? <Bell size={13} /> : <BellOff size={13} />}
              {audioEnabled ? 'ALERTS ON' : 'AUDIO OFF'}
            </button>
            <span className="mono" style={{ fontSize: '0.72rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.2)', padding: '3px 8px', borderRadius: '3px', fontWeight: 700 }}>
              AVALANCHE ACTIVE
            </span>
          </div>
        </div>
      )}

      {/* Real-time Hawkes Weapon Control & KPI Deck */}
      <div className="mml-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(255, 75, 75, 0.15)',
              color: '#ef4444'
            }}>
              <Flame size={15} />
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#fff', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>REAL-TIME HAWKES WEAPON &bull; 实时自激与雪崩检测雷达</span>
                <span className="badge-buy" style={{ fontSize: '0.64rem', padding: '1px 6px' }}>V1.4 LIVE WEAPON</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {symbol} &bull; 浏览器端 O(1) 递归核自激滤波 &bull; 实时预测级联发生概率
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: audioEnabled ? 'var(--color-buy)' : 'var(--text-dim)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Toggle alert sound when supercritical cascade is detected"
            >
              {audioEnabled ? <Bell size={13} /> : <BellOff size={13} />}
              <span>{audioEnabled ? 'SOUND ACTIVE' : 'MUTED'}</span>
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                background: 'var(--bg-dark)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              {isExpanded ? '折叠波形' : '展开波形与日志'}
            </button>
          </div>
        </div>

        {/* 4-KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: isExpanded ? '14px' : '0' }}>
          {/* Card 1: Branching Ratio */}
          <div style={{
            background: 'var(--bg-card)',
            border: `1px solid ${snapshot.isSupercritical ? '#ef4444' : snapshot.regime === 'NEAR_CRITICAL' ? '#f59e0b' : 'var(--border-color)'}`,
            borderRadius: '6px',
            padding: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 600 }}>BRANCHING RATIO &rho;(t)</span>
              <span
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: snapshot.isSupercritical ? 'rgba(239, 68, 68, 0.2)' : snapshot.regime === 'NEAR_CRITICAL' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                  color: snapshot.isSupercritical ? '#ef4444' : snapshot.regime === 'NEAR_CRITICAL' ? '#f59e0b' : '#10b981'
                }}
              >
                {snapshot.regime === 'SUPERCRITICAL_CASCADE' ? 'SUPERCRITICAL' : snapshot.regime === 'NEAR_CRITICAL' ? 'NEAR-CRITICAL' : 'SUBCRITICAL'}
              </span>
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: snapshot.isSupercritical ? '#ef4444' : snapshot.regime === 'NEAR_CRITICAL' ? '#f59e0b' : '#10b981' }}>
              {snapshot.branchingRatio.toFixed(3)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              {snapshot.branchingRatio >= 1.0 ? '🚨 羊群级联放量 (Avalanche)' : snapshot.branchingRatio >= 0.8 ? '⚠️ 订单流聚集加剧' : '✅ 泊松平稳流 (Stable)'}
            </div>
          </div>

          {/* Card 2: Total Intensity */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '4px' }}>
              TOTAL INTENSITY &lambda;(t)
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
              {snapshot.lambdaTotal.toFixed(1)} <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>events/s</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.70rem', marginTop: '4px' }}>
              <span style={{ color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ArrowUpRight size={12} /> Buy: {snapshot.lambdaBuy.toFixed(1)}
              </span>
              <span style={{ color: '#ff9100', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ArrowDownRight size={12} /> Sell: {snapshot.lambdaSell.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Card 3: Cascades Counter */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '4px' }}>
              SUPERCRITICAL CASCADES
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: snapshot.cascadeCount > 0 ? '#f59e0b' : 'var(--text-dim)' }}>
              {snapshot.cascadeCount} <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>bursts</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Rolling Stream Session
            </div>
          </div>

          {/* Card 4: Stream Speed */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '4px' }}>
              STREAM PACKETS PROCESSED
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8' }}>
              {snapshot.totalTradesProcessed.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Zero-Backend Ingested Ticks
            </div>
          </div>
        </div>

        {/* Expanded Waveform Chart & Cascades Table */}
        {isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Real-time Streaming Waveform */}
            <div style={{ background: 'var(--bg-dark)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Flame size={14} color="#f59e0b" /> REAL-TIME HAWKES INTENSITY &amp; CRITICALITY WAVEFORM (实时强度与分支比波形)
                </span>
                <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                  ROLLING 50-TICK SLIDING WINDOW (4Hz REFRESH)
                </span>
              </div>
              <div style={{ height: '220px', width: '100%' }}>
                <MMLChart option={chartOption} />
              </div>
            </div>

            {/* Recent Cascade Ledger */}
            {snapshot.recentCascades.length > 0 && (
              <div style={{ background: 'var(--bg-dark)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Layers size={14} color="#00e5ff" /> RECENT SUPERCRITICAL BURSTS (近期雪崩级联台账)
                  </span>
                  <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    TRIGGERED WHEN &rho; &ge; 1.0
                  </span>
                </div>
                <div className="table-responsive">
                  <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 8px' }}>TIME</th>
                        <th style={{ padding: '4px 8px' }}>PEAK &rho;</th>
                        <th style={{ padding: '4px 8px' }}>PEAK INTENSITY</th>
                        <th style={{ padding: '4px 8px' }}>DURATION</th>
                        <th style={{ padding: '4px 8px' }}>TICKS</th>
                        <th style={{ padding: '4px 8px' }}>VOLUME</th>
                        <th style={{ padding: '4px 8px' }}>DOMINANT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.recentCascades.slice(0, 5).map((cas: HawkesCascadeEvent) => (
                        <tr key={cas.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td className="mono" style={{ padding: '4px 8px', color: '#fff' }}>{cas.timeStr}</td>
                          <td className="mono" style={{ padding: '4px 8px', color: '#ef4444', fontWeight: 700 }}>
                            {cas.peakRho.toFixed(3)}
                          </td>
                          <td className="mono" style={{ padding: '4px 8px', color: '#f59e0b' }}>
                            {cas.peakIntensity.toFixed(1)}/s
                          </td>
                          <td className="mono" style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
                            {(cas.durationMs / 1000).toFixed(2)}s
                          </td>
                          <td className="mono" style={{ padding: '4px 8px', color: '#38bdf8' }}>
                            {cas.tradeCount}
                          </td>
                          <td className="mono" style={{ padding: '4px 8px', color: '#fff' }}>
                            {cas.volumeBtc.toFixed(3)} BTC
                          </td>
                          <td style={{ padding: '4px 8px' }}>
                            <span className={cas.dominantSide === 'BUY' ? 'badge-buy' : 'badge-sell'} style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
                              {cas.dominantSide}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
