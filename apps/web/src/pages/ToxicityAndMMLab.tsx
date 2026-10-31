import React, { useState, useEffect, useRef } from 'react';
import { fetchVpin, fetchAdverseSelection, fetchLeadLag } from '../api/client';
import {
  VPINResponse,
  AdverseSelectionResponse,
  LeadLagResponse,
  ToxicityRegime
} from '../types';
import {
  ShieldAlert,
  Flame,
  Scale,
  GitCompare,
  TrendingDown,
  Activity,
  Info,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { MathFormula } from '../components/MathFormula';
import { MMLChart } from '../components/MMLChart';
import { VolumeBucketVisualizer } from '../components/VolumeBucketVisualizer';
import { AdverseSelectionTugOfWar } from '../components/AdverseSelectionTugOfWar';
import { LeadLagRaceway } from '../components/LeadLagRaceway';
import { StoryBridge } from '../components/StoryBridge';
import { GlossaryTerm } from '../components/GlossaryTerm';
import { useExploration } from '../context/ExplorationContext';

interface ToxicityAndMMLabProps {
  date: string;
  onNavigateTab?: (tab: string) => void;
}

type TabType = 'vpin' | 'adverse_selection' | 'lead_lag';

export const ToxicityAndMMLab: React.FC<ToxicityAndMMLabProps> = ({ date, onNavigateTab }) => {
  const { userMode } = useExploration();
  const [activeTab, setActiveTab] = useState<TabType>('vpin');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [vpinData, setVpinData] = useState<VPINResponse | null>(null);
  const [asData, setAsData] = useState<AdverseSelectionResponse | null>(null);
  const [leadLagData, setLeadLagData] = useState<LeadLagResponse | null>(null);

  const [selectedHorizonSec, setSelectedHorizonSec] = useState<number>(10);
  const activeQueryIdRef = useRef<number>(0);

  useEffect(() => {
    const currentQueryId = ++activeQueryIdRef.current;
    setLoading(true);
    setErrorMessage(null);

    Promise.all([
      fetchVpin('BTCUSDT', date),
      fetchAdverseSelection('BTCUSDT', date),
      fetchLeadLag('BTCUSDT', date)
    ])
      .then(([vpin, asRes, leadLag]) => {
        if (currentQueryId === activeQueryIdRef.current) {
          setVpinData(vpin);
          setAsData(asRes);
          setLeadLagData(leadLag);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load V2.0 quantitative analytics:', err);
        if (currentQueryId === activeQueryIdRef.current) {
          setErrorMessage(err.message || 'Error loading microstructure toxicity models');
          setLoading(false);
        }
      });
  }, [date]);

  // VPIN Regime Styling Helper
  const getRegimeBadge = (regime?: ToxicityRegime) => {
    switch (regime) {
      case 'SEVERE_TOXIC_TSUNAMI':
        return {
          label: 'SEVERE TOXIC TSUNAMI (VPIN >= 0.35)',
          color: '#f43f5e',
          bg: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          desc: 'Extreme order imbalance toxicity. Informed takers actively sniping resting liquidity. High risk of immediate adverse price runs.'
        };
      case 'MODERATE_INFORMED':
        return {
          label: 'MODERATE INFORMED FLOW (0.20 <= VPIN < 0.35)',
          color: '#fbbf24',
          bg: 'rgba(251, 191, 36, 0.15)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
          desc: 'Elevated taker information content. Market makers should widen quotes or reduce tier sizes.'
        };
      case 'LOW_TOXICITY_HOMOGENEOUS':
      default:
        return {
          label: 'BENIGN NOISE / HOMOGENEOUS (VPIN < 0.20)',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          desc: 'Noise trader dominated market. Balanced buy/sell arrivals, optimal conditions for market making spread capture.'
        };
    }
  };

  // 1. Build VPIN Trajectory & Price Chart Option
  const buildVpinTrajectoryChart = () => {
    if (!vpinData || !vpinData.vpin_series || vpinData.vpin_series.length === 0) {
      return {};
    }

    const categories = vpinData.vpin_series.map((b) => {
      const timeStr = b.time_utc || '';
      return timeStr.length > 19 ? timeStr.substring(11, 19) : `B#${b.bucket_idx}`;
    });

    const vpinPoints = vpinData.vpin_series.map((b) =>
      b.vpin !== null ? Number(b.vpin.toFixed(4)) : null
    );
    const vwapPoints = vpinData.vpin_series.map((b) => b.vwap);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      legend: {
        data: ['VPIN Toxicity Metric', 'BTC/USDT VWAP ($)'],
        textStyle: { color: '#94a3b8' },
        top: 0,
        right: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      yAxis: [
        {
          type: 'value',
          name: 'VPIN [0, 1]',
          nameTextStyle: { color: '#f43f5e', fontSize: 11 },
          min: 0,
          max: 1.0,
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#f43f5e', formatter: '{value}' }
        },
        {
          type: 'value',
          name: 'VWAP Price ($)',
          nameTextStyle: { color: '#38bdf8', fontSize: 11 },
          scale: true,
          splitLine: { show: false },
          axisLabel: { color: '#38bdf8', formatter: '${value}' }
        }
      ],
      series: [
        {
          name: 'VPIN Toxicity Metric',
          type: 'line',
          yAxisIndex: 0,
          data: vpinPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: '#f43f5e' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(244, 63, 94, 0.45)' },
                { offset: 1, color: 'rgba(244, 63, 94, 0.02)' }
              ]
            }
          },
          markLine: {
            symbol: 'none',
            data: [
              {
                yAxis: 0.35,
                lineStyle: { color: '#e11d48', type: 'dashed', width: 1.5 },
                label: { formatter: '🔴 剧毒海啸警戒线 (0.35)', position: 'insideEndTop', color: '#fda4af' }
              },
              {
                yAxis: 0.20,
                lineStyle: { color: '#fbbf24', type: 'dotted', width: 1.2 },
                label: { formatter: '🟡 知情单分水岭 (0.20)', position: 'insideEndTop', color: '#fde68a' }
              }
            ]
          },
          markArea: {
            silent: true,
            data: [
              [
                { yAxis: 0.0, itemStyle: { color: 'rgba(16, 185, 129, 0.04)' } },
                { yAxis: 0.20 }
              ],
              [
                { yAxis: 0.20, itemStyle: { color: 'rgba(251, 191, 36, 0.05)' } },
                { yAxis: 0.35 }
              ],
              [
                { yAxis: 0.35, itemStyle: { color: 'rgba(244, 63, 94, 0.08)' } },
                { yAxis: 1.0 }
              ]
            ]
          }
        },
        {
          name: 'BTC/USDT VWAP ($)',
          type: 'line',
          yAxisIndex: 1,
          data: vwapPoints,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#38bdf8', type: 'solid' }
        }
      ]
    };
  };

  // 2. Build VPIN CDF Distribution Chart Option
  const buildVpinCdfChart = () => {
    if (!vpinData || !vpinData.summary || !vpinData.summary.cdf_distribution) {
      return {};
    }

    const cdf = vpinData.summary.cdf_distribution;
    const xVals = cdf.map((c) => c.vpin_threshold);
    const yVals = cdf.map((c) => c.percentile);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || !params[0]) return '';
          const pt = params[0];
          return `Cumulative Probability: <b>${pt.value[1]}%</b><br/>VPIN Threshold: <b>${pt.value[0]}</b>`;
        },
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '10%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: 'VPIN Threshold',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        min: 0,
        max: 1.0,
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b' }
      },
      yAxis: {
        type: 'value',
        name: 'Cumulative % (CDF)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b', formatter: '{value}%' }
      },
      series: [
        {
          name: 'CDF',
          type: 'line',
          data: xVals.map((x, i) => [x, yVals[i]]),
          step: 'end',
          lineStyle: { width: 2.5, color: '#818cf8' },
          areaStyle: {
            color: 'rgba(129, 140, 248, 0.15)'
          },
          markPoint: {
            data: [
              {
                coord: [vpinData.summary.median_vpin, 50],
                value: `Median: ${vpinData.summary.median_vpin}`,
                itemStyle: { color: '#38bdf8' }
              }
            ]
          }
        }
      ]
    };
  };

  // 3. Build Adverse Selection Multi-Horizon Decay Chart Option
  const buildAdverseSelectionHorizonChart = () => {
    if (!asData || !asData.horizons || asData.horizons.length === 0) {
      return {};
    }

    const categories = asData.horizons.map((h) => `${h.horizon_sec}s`);
    const effSpread = asData.horizons.map((h) => h.effective_spread_bps);
    const advSelection = asData.horizons.map((h) => h.adverse_selection_bps);
    const realizedSpread = asData.horizons.map((h) => h.realized_spread_bps);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      legend: {
        data: ['Effective Half-Spread (bps)', 'Adverse Selection Drag (bps)', 'Realized Spread (MM Net PnL bps)'],
        textStyle: { color: '#94a3b8' },
        top: 0,
        right: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '14%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        name: 'Evaluation Horizon k',
        nameLocation: 'middle',
        nameGap: 24,
        data: categories,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: {
        type: 'value',
        name: 'Spread / Cost (bps)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b', formatter: '{value} bps' }
      },
      series: [
        {
          name: 'Effective Half-Spread (bps)',
          type: 'line',
          data: effSpread,
          lineStyle: { width: 2, color: '#38bdf8', type: 'dashed' },
          itemStyle: { color: '#38bdf8' }
        },
        {
          name: 'Adverse Selection Drag (bps)',
          type: 'bar',
          data: advSelection,
          itemStyle: { color: '#f43f5e', borderRadius: [3, 3, 0, 0] }
        },
        {
          name: 'Realized Spread (MM Net PnL bps)',
          type: 'bar',
          data: realizedSpread,
          itemStyle: {
            color: (params: any) => (params.value >= 0 ? '#10b981' : '#e11d48'),
            borderRadius: [3, 3, 0, 0]
          }
        }
      ]
    };
  };

  // 4. Build Lead-Lag Cross Correlation Chart Option
  const buildLeadLagChart = () => {
    if (!leadLagData || !leadLagData.cross_correlation_curve || leadLagData.cross_correlation_curve.length === 0) {
      return {};
    }

    const curve = leadLagData.cross_correlation_curve;
    const xVals = curve.map((c) => c.lag_ms);
    const yVals = curve.map((c) => c.cross_correlation);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || !params[0]) return '';
          const pt = params[0];
          const lag = pt.value[0];
          const corr = pt.value[1];
          const direction = lag > 0 ? 'Futures Leads Spot' : lag < 0 ? 'Spot Leads Futures' : 'Synchronous';
          return `Time Lag &tau;: <b>${lag} ms</b> (${direction})<br/>Cross-Correlation: <b>${corr}</b>`;
        },
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '10%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: 'Time Lag \u03c4 (ms)  [ < 0: Spot leads | > 0: Futures leads ]',
        nameLocation: 'middle',
        nameGap: 24,
        min: -1500,
        max: 1500,
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value} ms' }
      },
      yAxis: {
        type: 'value',
        name: 'Cross Correlation Corr(\u0394P_spot, \u0394P_fut)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        min: 0,
        max: 0.8,
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#64748b' }
      },
      series: [
        {
          name: 'Cross Correlation',
          type: 'line',
          data: xVals.map((x, i) => [x, yVals[i]]),
          smooth: true,
          lineStyle: { width: 3, color: '#38bdf8' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(56, 189, 248, 0.4)' },
                { offset: 1, color: 'rgba(56, 189, 248, 0.02)' }
              ]
            }
          },
          markLine: {
            symbol: 'none',
            data: [
              {
                xAxis: leadLagData.peak_lead_ms,
                lineStyle: { color: '#f59e0b', type: 'dashed', width: 2 },
                label: {
                  formatter: `Peak Lead: +${leadLagData.peak_lead_ms}ms (r = ${leadLagData.peak_cross_correlation})`,
                  position: 'insideEndTop',
                  color: '#fbbf24',
                  fontWeight: 'bold'
                }
              }
            ]
          }
        }
      ]
    };
  };

  const currentHorizonInfo = asData?.horizons.find((h) => h.horizon_sec === selectedHorizonSec) || asData?.horizons[2];

  return (
    <div className="mml-container" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Context Bar */}
      <div
        className="mml-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
          borderColor: 'rgba(96, 165, 250, 0.25)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={22} style={{ color: 'var(--color-primary, #60a5fa)' }} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.04em', color: '#fff' }}>
              TOXICITY & MARKET MAKING LAB (MML V2.0)
            </h2>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: userMode === 'guided' ? '#38bdf8' : '#a855f7',
                background: userMode === 'guided' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: userMode === 'guided' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(168, 85, 247, 0.3)'
              }}
            >
              {userMode === 'guided' ? '💡 通俗导引视角' : '🔬 专业量化视角'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
            VPIN Volume Toxicity Monitoring &bull; Glosten-Milgrom Adverse Selection PnL Decomposition &bull; Spot vs Perpetual Futures Lead-Lag
          </p>
        </div>

        {/* Sub-Tab Navigation Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '6px' }}>
          <button
            onClick={() => setActiveTab('vpin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'vpin' ? 'var(--color-primary, #3b82f6)' : 'transparent',
              color: activeTab === 'vpin' ? '#fff' : 'var(--text-muted)'
            }}
          >
            <Flame size={14} />
            VPIN Toxicity Radar
          </button>
          <button
            onClick={() => setActiveTab('adverse_selection')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'adverse_selection' ? 'var(--color-primary, #3b82f6)' : 'transparent',
              color: activeTab === 'adverse_selection' ? '#fff' : 'var(--text-muted)'
            }}
          >
            <Scale size={14} />
            MM Adverse Selection & PnL
          </button>
          <button
            onClick={() => setActiveTab('lead_lag')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'lead_lag' ? 'var(--color-primary, #3b82f6)' : 'transparent',
              color: activeTab === 'lead_lag' ? '#fff' : 'var(--text-muted)'
            }}
          >
            <GitCompare size={14} />
            Cross-Market Lead-Lag
          </button>
        </div>
      </div>

      {/* User Mode Guided Callout */}
      {userMode === 'guided' && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(15, 23, 42, 0.4))',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '0.76rem',
            color: '#e2e8f0',
            lineHeight: 1.5
          }}
        >
          <strong style={{ color: '#38bdf8' }}>💡 新手识别庄家导引：</strong>
          大单冲击后，真正血流成河的是对手方的做市商！【子页面① <GlossaryTerm term="vpin">VPIN 毒性雷达</GlossaryTerm>】用等体积水桶测算买卖失衡，识别知情巨鲸单边扫货；【子页面② <GlossaryTerm term="adverse_selection">逆向选择</GlossaryTerm>】计算做市商赚取的点差是否被大单割肉吃穿；【子页面③ <GlossaryTerm term="information_share">期现领先</GlossaryTerm>】实证了杠杆永续合约提前 180ms 剧透现货价格！
        </div>
      )}

      {loading && (
        <div className="mml-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Computing V2.0 microstructure toxicity and adverse selection metrics for {date}...
        </div>
      )}

      {errorMessage && (
        <div
          className="mml-card"
          style={{
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderColor: '#ef4444',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <AlertTriangle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {!loading && !errorMessage && (
        <>
          {/* TAB 1: VPIN FLOW TOXICITY RADAR */}
          {activeTab === 'vpin' && vpinData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Regime Banner */}
              {(() => {
                const badge = getRegimeBadge(vpinData.summary?.regime);
                return (
                  <div
                    className="mml-card"
                    style={{
                      padding: '14px 18px',
                      background: badge.bg,
                      border: badge.border,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Flame size={24} style={{ color: badge.color }} />
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: badge.color, letterSpacing: '0.04em' }}>
                          {badge.label}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '2px' }}>
                          {badge.desc}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>TOXIC BUCKETS</div>
                        <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                          {vpinData.summary?.toxic_bucket_count ?? 0} / {vpinData.summary?.total_valid_buckets ?? 0}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>95TH % VPIN</div>
                        <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: badge.color }}>
                          {((vpinData.summary?.p95_vpin ?? 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* VPIN KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="mml-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MEAN VPIN TOXICITY</div>
                  <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f43f5e', marginTop: '4px' }}>
                    {((vpinData.summary?.mean_vpin ?? 0) * 100).toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                    Standard baseline: &lt; 20%
                  </div>
                </div>

                <div className="mml-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MEDIAN VPIN</div>
                  <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                    {((vpinData.summary?.median_vpin ?? 0) * 100).toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                    Robust 50th percentile
                  </div>
                </div>

                <div className="mml-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MAX INTRADAY PEAK</div>
                  <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#e11d48', marginTop: '4px' }}>
                    {((vpinData.summary?.max_vpin ?? 0) * 100).toFixed(2)}%
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                    Peak toxic order burst
                  </div>
                </div>

                <div className="mml-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>EQUAL VOLUME BUCKET V</div>
                  <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                    {vpinData.bucket_size_btc} BTC
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                    Volume clock resolution
                  </div>
                </div>

                <div className="mml-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ROLLING WINDOW N</div>
                  <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#a855f7', marginTop: '4px' }}>
                    {vpinData.window_buckets} Buckets
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                    Total {vpinData.bucket_size_btc * vpinData.window_buckets} BTC history
                  </div>
                </div>
              </div>

              {/* Volume Bucket Visualizer */}
              {vpinData.vpin_series && vpinData.vpin_series.length > 0 && (
                <VolumeBucketVisualizer
                  bucketSizeBtc={vpinData.bucket_size_btc}
                  buyVolume={vpinData.vpin_series[vpinData.vpin_series.length - 1].buy_volume}
                  sellVolume={vpinData.vpin_series[vpinData.vpin_series.length - 1].sell_volume}
                  imbalance={vpinData.vpin_series[vpinData.vpin_series.length - 1].imbalance}
                  vpinValue={vpinData.vpin_series[vpinData.vpin_series.length - 1].vpin}
                  vwap={vpinData.vpin_series[vpinData.vpin_series.length - 1].vwap}
                  bucketIdx={vpinData.vpin_series[vpinData.vpin_series.length - 1].bucket_idx}
                />
              )}

              {/* Primary VPIN Trajectory Chart */}
              <div className="mml-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={16} style={{ color: '#f43f5e' }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                      Intraday VPIN Trajectory vs. VWAP Execution Price (Dual-Axis)
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Equal Volume Clock: {vpinData.vpin_series.length} buckets evaluated
                  </span>
                </div>
                <div style={{ height: '360px' }}>
                  <MMLChart option={buildVpinTrajectoryChart()} style={{ height: '100%', width: '100%' }} />
                </div>
              </div>

              {/* Bottom Row: CDF Distribution & KaTeX Theory Box */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px' }}>
                <div className="mml-card" style={{ padding: '16px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff', marginBottom: '10px' }}>
                    Toxicity Tail Distribution (Empirical CDF)
                  </div>
                  <div style={{ height: '240px' }}>
                    <MMLChart option={buildVpinCdfChart()} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>

                <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={15} /> Econometric Derivation & Market Making Defense
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>Easley, Lopez de Prado & O'Hara (2012) VPIN Formulation:</strong>
                    </p>
                    <MathFormula math="VPIN = \frac{\sum_{\tau=1}^N |V_\tau^B - V_\tau^S|}{N \times V}" block />
                    <p style={{ margin: '8px 0 0 0' }}>
                      Where <MathFormula math="V" /> is the constant volume bucket (e.g. 5.0 BTC), <MathFormula math="V_\tau^B" /> and <MathFormula math="V_\tau^S" /> are the buy/sell taker volumes accumulated within bucket <MathFormula math="\tau" />, and <MathFormula math="N" /> is the rolling window (25 buckets).
                    </p>
                    <p style={{ margin: '8px 0 0 0' }}>
                      When VPIN surges above <strong>0.35</strong>, adverse selection risk dominates spread earnings. Automated market maker systems should widen quote spreads, pull resting depth, or skew inventory towards incoming toxic volume.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MARKET MAKER ADVERSE SELECTION & PNL DECOMPOSITION */}
          {activeTab === 'adverse_selection' && asData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Glosten-Milgrom Formal Identity Banner */}
              <div
                className="mml-card"
                style={{
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.04em' }}>
                    GLOSTEN-MILGROM / HASBROUCK SPREAD DECOMPOSITION IDENTITY
                  </div>
                  <div style={{ margin: '6px 0' }}>
                    <MathFormula math="\text{Effective Spread} \equiv \text{Realized Spread}_k + \text{Adverse Selection Cost}_k" />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Where Realized Spread measures true market maker net profitability at horizon k, after taking informed price drift.
                  </div>
                </div>

                {/* Horizon Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>FORWARD EVALUATION HORIZON (k):</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {asData.horizons.map((h) => (
                      <button
                        key={h.horizon_sec}
                        onClick={() => setSelectedHorizonSec(h.horizon_sec)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: selectedHorizonSec === h.horizon_sec ? '1px solid #38bdf8' : '1px solid #334155',
                          background: selectedHorizonSec === h.horizon_sec ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                          color: selectedHorizonSec === h.horizon_sec ? '#38bdf8' : '#94a3b8'
                        }}
                      >
                        {h.horizon_sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Horizon Metric Cards */}
              {currentHorizonInfo && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="mml-card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>EFFECTIVE HALF-SPREAD (S_eff)</div>
                    <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                      {currentHorizonInfo.effective_spread_bps.toFixed(2)} bps
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                      Gross half-spread collected
                    </div>
                  </div>

                  <div className="mml-card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ADVERSE SELECTION (AS_{selectedHorizonSec}s)</div>
                    <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f43f5e', marginTop: '4px' }}>
                      {currentHorizonInfo.adverse_selection_bps.toFixed(2)} bps
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                      Informed price shift against MM
                    </div>
                  </div>

                  <div className="mml-card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>REALIZED SPREAD (R_{selectedHorizonSec}s)</div>
                    <div
                      className="mono"
                      style={{
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: currentHorizonInfo.realized_spread_bps >= 0 ? '#10b981' : '#e11d48',
                        marginTop: '4px'
                      }}
                    >
                      {currentHorizonInfo.realized_spread_bps.toFixed(2)} bps
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                      Net MM edge after {selectedHorizonSec}s decay
                    </div>
                  </div>

                  <div className="mml-card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOXIC FLOW DRAG RATIO</div>
                    <div className="mono" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24', marginTop: '4px' }}>
                      {(currentHorizonInfo.adverse_selection_ratio * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                      AS / S_eff toxic drag
                    </div>
                  </div>

                  <div className="mml-card" style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MM PROFITABILITY STATUS</div>
                    <div
                      style={{
                        fontSize: '0.98rem',
                        fontWeight: 800,
                        color: currentHorizonInfo.is_mm_profitable ? '#10b981' : '#f43f5e',
                        marginTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {currentHorizonInfo.is_mm_profitable ? (
                        <>
                          <CheckCircle size={16} /> PROFITABLE QUOTING
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={16} /> TOXIC DRAG UNPROFITABLE
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '4px' }}>
                      {currentHorizonInfo.is_mm_profitable
                        ? 'Spread exceeds informed drift'
                        : 'Whale snipes overwhelm maker edge'}
                    </div>
                  </div>
                </div>
              )}

              {/* Visual Tug-of-War Bar */}
              {currentHorizonInfo && asData.waterfall_attribution && (
                <AdverseSelectionTugOfWar
                  grossSpreadCapturedUsd={asData.waterfall_attribution.gross_spread_captured_usd}
                  toxicFlowLossUsd={asData.waterfall_attribution.toxic_flow_adverse_selection_loss_usd}
                  netPnlUsd={asData.waterfall_attribution.net_market_making_pnl_usd}
                  effectiveSpreadBps={currentHorizonInfo.effective_spread_bps}
                  adverseSelectionBps={currentHorizonInfo.adverse_selection_bps}
                  realizedSpreadBps={currentHorizonInfo.realized_spread_bps}
                  horizonSec={selectedHorizonSec}
                />
              )}

              {/* Multi-Horizon Term Structure Decay Chart */}
              <div className="mml-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Scale size={16} style={{ color: '#38bdf8' }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                      Term Structure of Adverse Selection & Realized Spread Decay (1s to 300s)
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Glosten-Milgrom Forward Pricing Decay
                  </span>
                </div>
                <div style={{ height: '340px' }}>
                  <MMLChart option={buildAdverseSelectionHorizonChart()} style={{ height: '100%', width: '100%' }} />
                </div>
              </div>

              {/* PnL Waterfall & Top Toxic Trades Table */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                {/* PnL Waterfall Attribution Card */}
                {asData.waterfall_attribution && (
                  <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TrendingDown size={16} style={{ color: '#f59e0b' }} />
                      Market Maker Daily PnL Waterfall Attribution
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      Hypothetical Turnover: <strong>{asData.waterfall_attribution.hypothetical_turnover_btc.toLocaleString()} BTC</strong>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          borderRadius: '4px',
                          border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', color: '#a7f3d0' }}>Gross Half-Spread Captured (+)</span>
                        <span className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#10b981' }}>
                          +${asData.waterfall_attribution.gross_spread_captured_usd.toLocaleString()}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'rgba(244, 63, 94, 0.1)',
                          borderRadius: '4px',
                          border: '1px solid rgba(244, 63, 94, 0.3)'
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', color: '#fecdd3' }}>Toxic Flow Adverse Selection Drag (-)</span>
                        <span className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f43f5e' }}>
                          -${asData.waterfall_attribution.toxic_flow_adverse_selection_loss_usd.toLocaleString()}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background:
                            asData.waterfall_attribution.net_market_making_pnl_usd >= 0
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                          borderRadius: '4px',
                          border: `1px solid ${
                            asData.waterfall_attribution.net_market_making_pnl_usd >= 0 ? '#10b981' : '#ef4444'
                          }`
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>Net Strategy Market Making PnL</span>
                        <span
                          className="mono"
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            color: asData.waterfall_attribution.net_market_making_pnl_usd >= 0 ? '#10b981' : '#f43f5e'
                          }}
                        >
                          {asData.waterfall_attribution.net_market_making_pnl_usd >= 0 ? '+' : ''}$
                          {asData.waterfall_attribution.net_market_making_pnl_usd.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Toxic Trades Detector */}
                <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldAlert size={16} style={{ color: '#f43f5e' }} />
                    Top Toxic Whale Snipes Detector (10s Forward Horizon)
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: '220px' }}>
                    <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Trade ID</th>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Time (UTC)</th>
                          <th style={{ textAlign: 'center', padding: '6px' }}>Side</th>
                          <th style={{ textAlign: 'right', padding: '6px' }}>Price</th>
                          <th style={{ textAlign: 'right', padding: '6px' }}>Size (BTC)</th>
                          <th style={{ textAlign: 'right', padding: '6px' }}>AS (bps)</th>
                          <th style={{ textAlign: 'right', padding: '6px' }}>Loss ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asData.top_toxic_trades.map((t) => (
                          <tr key={t.trade_id} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td className="mono" style={{ padding: '6px', color: '#94a3b8' }}>
                              #{t.trade_id}
                            </td>
                            <td className="mono" style={{ padding: '6px', color: '#cbd5e1' }}>
                              {t.time_utc.substring(11, 19)}
                            </td>
                            <td style={{ textAlign: 'center', padding: '6px' }}>
                              <span
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontSize: '0.64rem',
                                  fontWeight: 700,
                                  background: t.direction === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: t.direction === 'BUY' ? '#10b981' : '#f43f5e'
                                }}
                              >
                                {t.direction}
                              </span>
                            </td>
                            <td className="mono" style={{ textAlign: 'right', padding: '6px', color: '#f8fafc' }}>
                              ${t.price.toFixed(2)}
                            </td>
                            <td className="mono" style={{ textAlign: 'right', padding: '6px', color: '#38bdf8' }}>
                              {t.size_btc.toFixed(4)}
                            </td>
                            <td className="mono" style={{ textAlign: 'right', padding: '6px', color: '#f43f5e', fontWeight: 700 }}>
                              +{t.adverse_selection_bps.toFixed(1)}
                            </td>
                            <td className="mono" style={{ textAlign: 'right', padding: '6px', color: '#f8fafc' }}>
                              ${t.dollar_impact_usd.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CROSS-MARKET LEAD-LAG & PRICE DISCOVERY */}
          {activeTab === 'lead_lag' && leadLagData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Verdict Header Banner */}
              <div
                className="mml-card"
                style={{
                  padding: '16px 20px',
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(15, 23, 42, 0.9))',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <GitCompare size={26} style={{ color: '#fbbf24' }} />
                  <div>
                    <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.04em' }}>
                      {leadLagData.empirical_verdict}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '2px' }}>
                      {leadLagData.hasbrouck_information_share?.verdict}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>PEAK LEAD TIME (&tau;*)</div>
                    <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                      +{leadLagData.peak_lead_ms} ms
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>PEAK CORRELATION</div>
                    <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>
                      {leadLagData.peak_cross_correlation.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Lead-Lag Dual-Track Raceway */}
              <LeadLagRaceway
                peakLeadMs={leadLagData.peak_lead_ms}
                peakCrossCorrelation={leadLagData.peak_cross_correlation}
                futuresSharePct={leadLagData.gonzalo_granger_component_share?.futures_component_share_pct}
                spotSharePct={leadLagData.gonzalo_granger_component_share?.spot_component_share_pct}
              />

              {/* Cross-Correlation Curve Chart */}
              <div className="mml-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={16} style={{ color: '#38bdf8' }} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                      High-Frequency Cross-Correlation Function CC(&tau;) between Spot & Perpetual Futures
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Resolution: 50ms grid [-1500ms to +1500ms]
                  </span>
                </div>
                <div style={{ height: '340px' }}>
                  <MMLChart option={buildLeadLagChart()} style={{ height: '100%', width: '100%' }} />
                </div>
              </div>

              {/* Price Discovery Share Decomposition & Mechanism Explanation */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                {/* Share Decomposition */}
                <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>
                    Information Share & Component Share Decomposition
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px' }}>
                        <span style={{ color: '#fbbf24', fontWeight: 700 }}>Hasbrouck (1995) Futures Information Share Bounds:</span>
                        <span className="mono" style={{ color: '#f8fafc', fontWeight: 700 }}>
                          {leadLagData.hasbrouck_information_share?.futures_lower_bound_pct}% - {leadLagData.hasbrouck_information_share?.futures_upper_bound_pct}%
                        </span>
                      </div>
                      <div style={{ height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                        <div
                          style={{
                            width: `${leadLagData.hasbrouck_information_share?.futures_upper_bound_pct}%`,
                            background: '#fbbf24'
                          }}
                        />
                        <div style={{ flex: 1, background: '#38bdf8' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                        <span>Futures Dominates (Yellow)</span>
                        <span>Spot Residual (Cyan: {leadLagData.hasbrouck_information_share?.spot_lower_bound_pct}% - {leadLagData.hasbrouck_information_share?.spot_upper_bound_pct}%)</span>
                      </div>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '4px' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>Gonzalo-Granger Permanent Component Share:</span>
                        <span className="mono" style={{ color: '#f8fafc', fontWeight: 700 }}>
                          {leadLagData.gonzalo_granger_component_share?.futures_component_share_pct}% / {leadLagData.gonzalo_granger_component_share?.spot_component_share_pct}%
                        </span>
                      </div>
                      <div style={{ height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                        <div
                          style={{
                            width: `${leadLagData.gonzalo_granger_component_share?.futures_component_share_pct}%`,
                            background: '#10b981'
                          }}
                        />
                        <div style={{ flex: 1, background: '#64748b' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                        <span>Futures Common Trend Driver (75.8%)</span>
                        <span>Spot Adjusting Follower (24.2%)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Economic Mechanism */}
                <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={15} /> Why Derivatives Lead Physical Spot in Crypto Microstructure
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    <p style={{ margin: '0 0 6px 0' }}>
                      <strong>1. Capital Velocity & Leverage:</strong> Informed institutional traders and quantitative arbitrageurs execute on perpetual futures due to higher leverage (up to 50x-100x) and negative maker fee rebate structures.
                    </p>
                    <p style={{ margin: '0 0 6px 0' }}>
                      <strong>2. Price Discovery Transmission:</strong> The price impulse originates on Binance Futures. High-frequency arbitrage algorithms detect the basis deviation and immediately trade against physical spot books, transmitting new information with an empirical latency of ~180ms.
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>3. Arbitrage Friction:</strong> Spot market makers observe this ~180ms lead window as an adverse selection warning — pulling quotes when perpetual futures lead curves break out.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Story Bridge to Act 5 */}
      <StoryBridge
        currentAct={4}
        currentActTitle="识庄家 · 毒性做市与期现定价权"
        takeaway="通过 VPIN 毒性雷达捕捉了知情巨鲸单边扫货时刻，测算了做市商逆向亏损瀑布，并实证了币安永续合约提前 180ms 剧透现货价格。"
        nextAct="orderbook"
        nextActNumber={5}
        nextActTitle="战实盘 · 币安直连实时盘口与自激雪崩警报"
        nextQuestion="掌握了全部历史规律，此时此刻币安真实的 L2 盘口与实时 Hawkes 自激雪崩处于什么状态？"
        onNavigate={(tab) => onNavigateTab ? onNavigateTab(tab) : undefined}
      />
    </div>
  );
};
