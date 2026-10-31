import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, RotateCcw, FastForward, Clock, Zap, Timer, AlertTriangle, Compass, Sparkles } from 'lucide-react';
import { fetchReplayWindow } from '../api/client';
import { ReplayTrade } from '../types';
import { MMLChart } from '../components/MMLChart';
import { StoryBridge } from '../components/StoryBridge';
import { GlossaryTerm } from '../components/GlossaryTerm';
import { MarketMakingSimulator } from '../components/MarketMakingSimulator';
import { useExploration } from '../context/ExplorationContext';

interface MarketReplayProps {
  date: string;
  initialSession?: number;
  customTrades?: ReplayTrade[] | null;
  onClearCustomTrades?: () => void;
  onNavigateTab?: (tab: string) => void;
}

interface CuratedScenario {
  id: string;
  title: string;
  badge: string;
  offset: number;
  description: string;
  narration: string;
}

const curatedScenarios: CuratedScenario[] = [
  {
    id: 'whale-dump',
    title: '🐋 巨鲸砸盘与流动性缺口 (Whale Dump & Impact)',
    badge: 'WHALE SELL & RECOVERY',
    offset: 20994,
    description: '单笔大额卖单连续下击引发买方档位被击穿，瞬态流动性空洞显现，做市商在 5 笔交易内快速回补价差。',
    narration: '【观察看点】点击播放后注意观察图表大尺寸橙色卖单击穿均价线，随后 CVD 快速下坠，小单紧接着出现均值回归回补。'
  },
  {
    id: 'hawkes-cluster',
    title: '⚡ 订单流自激雪崩 (Hawkes Supercritical Burst)',
    badge: 'CLUSTER CASCADE (rho >= 1.0)',
    offset: 28800,
    description: '伦敦开盘量能激增，买卖自激强度 rho 突破临界状态（rho >= 1.0），羊群效应引发高频密集同向吃单。',
    narration: '【观察看点】订单密集到达，间隔时间压缩至几毫秒，单向吃单引发价格梯级单边推进，长记忆性特征显著。'
  },
  {
    id: 'vacuum-bounce',
    title: '🛡️ 深厚挂单吸收与双向均衡 (Market Making Resilience)',
    badge: 'HIGH RESILIENCY ABSORPTION',
    offset: 50400,
    description: '美洲早盘深厚双向挂单形成流动性吸收带，大额成交被挂单完全消化，瞬态冲击半衰期降至 <2 笔。',
    narration: '【观察看点】高额买卖双向交织，价格在狭窄通道内震荡，盘口具有极高弹性（Resiliency），冲击难以形成趋势。'
  },
  {
    id: 'vpin-toxic-surge',
    title: '🧪 VPIN 毒性海啸突破警戒线 (Informed Toxic Tsunami)',
    badge: 'VPIN TOXICITY > 0.35',
    offset: 52200,
    description: '重磅行情发布瞬间，单向知情大单蜂拥吃单，等体积量桶买卖严重失衡，做市商遭受严峻逆向选择。',
    narration: '【观察看点】单向买单排山倒海灌满量桶，主动买入比例突破 85%，做市商被迫拉大点差防守。'
  },
  {
    id: 'lead-lag-arb',
    title: '⏱️ 币安合约 180ms 剧透现货 (Lead-Lag Arbitrage Cascade)',
    badge: '180ms FUTURES LEAD',
    offset: 60300,
    description: '杠杆永续合约最先跳价，跨市场高频套利者在 180ms 黄金窗口内向现货猛烈扫单抹平基差。',
    narration: '【观察看点】极短毫秒内爆发连续扫盘，现货档位被迅速抹平，基差回归完成。'
  }
];

export const MarketReplay: React.FC<MarketReplayProps> = ({ date, initialSession, customTrades, onClearCustomTrades, onNavigateTab }) => {
  const { userMode } = useExploration();
  const [startSecond, setStartSecond] = useState<number>(initialSession !== undefined ? initialSession : 0);
  const [durationSeconds] = useState<number>(60);
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [totalInWindow, setTotalInWindow] = useState<number>(0);
  const [isTruncated, setIsTruncated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [playbackMode, setPlaybackMode] = useState<'EVENT_INDEX' | 'REAL_CLOCK'>('EVENT_INDEX');
  const [activeScenario, setActiveScenario] = useState<CuratedScenario | null>(null);
  const timerRef = useRef<any>(null);
  const activeQueryIdRef = useRef<number>(0);

  // Available pre-indexed intraday market sessions
  const sessions = [
    { label: '00:00 UTC (Day Open)', offset: 0 },
    { label: '05:49 UTC (Model Onset, 25%)', offset: 20994 },
    { label: '08:00 UTC (London Open)', offset: 28800 },
    { label: '14:00 UTC (US Influx)', offset: 50400 },
    { label: '20:00 UTC (Late Liquidity)', offset: 72000 }
  ];

  useEffect(() => {
    if (initialSession !== undefined) {
      setStartSecond(initialSession);
    }
  }, [initialSession]);

  // Load trade window
  useEffect(() => {
    if (customTrades && customTrades.length > 0) {
      setTrades(customTrades);
      setTotalInWindow(customTrades.length);
      setIsTruncated(false);
      setLoading(false);
      setError(null);
      setCurrentIndex(0);
      setIsPlaying(false);
      return;
    }

    const currentQueryId = ++activeQueryIdRef.current;
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentIndex(0);
    setTrades([]);
    setTotalInWindow(0);

    fetchReplayWindow('BTCUSDT', date, startSecond, durationSeconds, 2000)
      .then((data) => {
        if (currentQueryId === activeQueryIdRef.current) {
          setTrades(data.trades);
          setTotalInWindow(data.total_in_window || data.trades.length);
          setIsTruncated(Boolean(data.is_truncated));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (currentQueryId === activeQueryIdRef.current) {
          setError(err.message || 'Failed to load replay window');
          setLoading(false);
        }
      });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [date, startSecond, durationSeconds, customTrades]);

  // Playback loop with true monotonic wall-clock proportional pacing
  useEffect(() => {
    if (!isPlaying || trades.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (playbackMode === 'EVENT_INDEX') {
      // Constant rate stepping (Trades per second): 1x = 10 tps, 2x = 20 tps, 5x = 50 tps, 10x = 100 tps
      const tradesPerSec = playbackSpeed * 10;
      const intervalMs = Math.max(16, Math.floor(1000 / tradesPerSec));
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= trades.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      // True proportional wall-clock playback using monotonic performance.now()
      let animFrameId: number;
      const startWallMs = performance.now();
      const initialIdx = currentIndex >= trades.length - 1 ? 0 : currentIndex;
      const startMarketNs = BigInt(trades[initialIdx].event_timestamp_ns);

      const loop = (now: number) => {
        // elapsed market nanoseconds = elapsed wall milliseconds * playbackSpeed * 1,000,000
        const elapsedWallMs = (now - startWallMs) * playbackSpeed;
        const targetMarketNs = startMarketNs + BigInt(Math.floor(elapsedWallMs * 1_000_000));

        let nextIdx = initialIdx;
        while (nextIdx < trades.length - 1 && BigInt(trades[nextIdx + 1].event_timestamp_ns) <= targetMarketNs) {
          nextIdx++;
        }

        setCurrentIndex(nextIdx);

        if (nextIdx >= trades.length - 1) {
          setIsPlaying(false);
        } else {
          animFrameId = requestAnimationFrame(loop);
        }
      };

      animFrameId = requestAnimationFrame(loop);
      return () => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
      };
    }
  }, [isPlaying, trades, playbackSpeed, playbackMode]);

  const currentTrade = trades[currentIndex] || trades[0];

  // Prepare chart series up to currentIndex
  const visibleTrades = trades.slice(0, Math.max(1, currentIndex + 1));
  
  const buyScatter = visibleTrades
    .filter((t) => t.direction === 1)
    .map((t) => [t.event_time_utc.split('T')[1].replace('Z', ''), t.price, t.base_quantity]);

  const sellScatter = visibleTrades
    .filter((t) => t.direction === -1)
    .map((t) => [t.event_time_utc.split('T')[1].replace('Z', ''), t.price, t.base_quantity]);

  const priceLine = visibleTrades.map((t) => [
    t.event_time_utc.split('T')[1].replace('Z', ''),
    t.price
  ]);

  let runningCvd = 0;
  const cvdSeries = visibleTrades.map((t) => {
    runningCvd += t.direction * t.base_quantity;
    return [t.event_time_utc.split('T')[1].replace('Z', ''), runningCvd];
  });

  // Calculate price extremes for tight, responsive y-axis framing
  const clipPrices = trades.map((t) => t.price).filter((p) => typeof p === 'number' && !isNaN(p));
  const minClipPrice = clipPrices.length > 0 ? Math.min(...clipPrices) : undefined;
  const maxClipPrice = clipPrices.length > 0 ? Math.max(...clipPrices) : undefined;
  const pricePadding = (minClipPrice !== undefined && maxClipPrice !== undefined)
    ? Math.max(0.5, (maxClipPrice - minClipPrice) * 0.08)
    : 1;
  const yMin = minClipPrice !== undefined ? Math.floor(minClipPrice - pricePadding) : undefined;
  const yMax = maxClipPrice !== undefined ? Math.ceil(maxClipPrice + pricePadding) : undefined;

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', lineStyle: { color: '#2f3d54' } },
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' }
    },
    grid: [
      { left: '4%', right: '3%', top: '8%', height: '58%' },
      { left: '4%', right: '3%', top: '72%', height: '22%' }
    ],
    xAxis: [
      {
        type: 'category',
        gridIndex: 0,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { color: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }
      },
      {
        type: 'category',
        gridIndex: 1,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { show: false }
      }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        scale: true,
        min: yMin,
        max: yMax,
        splitLine: { lineStyle: { color: '#161e2e' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono', fontSize: 10 }
      },
      {
        type: 'value',
        gridIndex: 1,
        splitLine: { lineStyle: { color: '#161e2e' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono', fontSize: 10 }
      }
    ],
    series: [
      {
        name: 'Trade Price',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: priceLine,
        lineStyle: { color: '#94a3b8', width: 1.5 },
        showSymbol: false
      },
      {
        name: 'Aggressive Buy',
        type: 'scatter',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: buyScatter,
        symbolSize: (val: any) => Math.min(25, Math.max(4, Math.sqrt(val[2]) * 18)),
        itemStyle: {
          color: '#00e5ff',
          opacity: 0.85,
          shadowBlur: 5,
          shadowColor: 'rgba(0, 229, 255, 0.4)'
        }
      },
      {
        name: 'Aggressive Sell',
        type: 'scatter',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sellScatter,
        symbolSize: (val: any) => Math.min(25, Math.max(4, Math.sqrt(val[2]) * 18)),
        itemStyle: {
          color: '#ff9100',
          opacity: 0.85,
          shadowBlur: 5,
          shadowColor: 'rgba(255, 145, 0, 0.4)'
        }
      },
      {
        name: 'CVD (BTC)',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: cvdSeries,
        lineStyle: { color: '#ffd700', width: 2 },
        areaStyle: {
          color: 'rgba(255, 215, 0, 0.08)'
        },
        showSymbol: false
      }
    ]
  };

  const clipStartUtc = trades.length > 0 ? (trades[0].event_time_utc?.split('T')[1]?.replace('Z', '') || '') : '';
  const clipEndUtc = trades.length > 0 ? (trades[trades.length - 1].event_time_utc?.split('T')[1]?.replace('Z', '') || '') : '';
  const clipDurationSec = trades.length > 1
    ? ((Number(BigInt(trades[trades.length - 1].event_timestamp_ns) - BigInt(trades[0].event_timestamp_ns))) / 1e9).toFixed(3)
    : '0.000';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* BYOD Custom Injected Trade Banner */}
      {customTrades && customTrades.length > 0 && (
        <div style={{
          background: 'rgba(0, 229, 255, 0.08)',
          border: '1px solid rgba(0, 229, 255, 0.4)',
          padding: '8px 14px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#00e5ff', fontWeight: 600 }}>
            <Zap size={15} />
            <span>BYOD 客户端自定义逐笔交易回放已就绪：共 {customTrades.length.toLocaleString()} 笔成交记录</span>
          </div>
          {onClearCustomTrades && (
            <button
              onClick={onClearCustomTrades}
              style={{
                background: 'rgba(0, 229, 255, 0.2)',
                border: '1px solid #00e5ff',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              清除自定义数据，恢复官方 {date} 归档
            </button>
          )}
        </div>
      )}

      {/* Historical Event Replay Disclosure Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '6px 12px',
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        fontSize: '0.74rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={15} color="var(--color-buy)" />
          <span style={{ fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.02em' }}>
            HISTORICAL EVENT REPLAY &bull; BINANCE SPOT BTC/USDT ARCHIVE ({date})
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            &bull; Deterministic tick playback
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="mono" style={{ fontSize: '0.68rem', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-buy)', padding: '2px 8px', borderRadius: '3px', fontWeight: 600 }}>
            OFFLINE ARCHIVE &bull; NON-REALTIME
          </span>
          {isTruncated && (
            <span className="badge-gold" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
              BUFFER TRUNCATED: {trades.length} / {totalInWindow.toLocaleString()} TICKS
            </span>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mml-card" style={{ borderLeft: '4px solid var(--color-sell)', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px' }}>
          <AlertTriangle color="var(--color-sell)" size={20} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--color-sell)' }}>Replay Window Error</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{error}</div>
          </div>
        </div>
      )}

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
            lineHeight: 1.5,
            marginBottom: '10px'
          }}
        >
          <strong style={{ color: '#38bdf8' }}>💡 新手破案导引：</strong>
          真实微观盘口没有平滑连续的 K 线，只有每毫秒发生的一笔笔吃单撮合。推荐先点击下方【🐋 巨鲸砸盘】精选剧本，然后点击播放键，观察大单如何瞬间砸穿买一价并使 <GlossaryTerm term="cvd">CVD (累积量差)</GlossaryTerm> 剧烈下坠！
        </div>
      )}

      {/* Consolidated Compact Replay Toolbar (~85px, 2 rows) */}
      <div data-tour="market-replay" className="mml-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Curated Scenarios Bookmark Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Compass size={13} /> CURATED SCENARIOS (高光剧本):
            </span>
            {curatedScenarios.map((sc) => {
              const isSelected = activeScenario?.id === sc.id;
              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    setActiveScenario(sc);
                    setStartSecond(sc.offset);
                    setPlaybackSpeed(2);
                    setIsPlaying(true);
                  }}
                  style={{
                    background: isSelected ? 'rgba(0, 229, 255, 0.2)' : 'var(--bg-dark)',
                    border: `1px solid ${isSelected ? '#00e5ff' : 'var(--border-highlight)'}`,
                    color: isSelected ? '#00e5ff' : 'var(--text-main)',
                    fontWeight: isSelected ? 700 : 500,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title={sc.description}
                >
                  <Sparkles size={11} color={isSelected ? '#00e5ff' : 'var(--color-primary, #60a5fa)'} />
                  <span>{sc.title.split(' ')[0]} {sc.badge}</span>
                </button>
              );
            })}
          </div>
          {activeScenario && (
            <button
              onClick={() => setActiveScenario(null)}
              style={{ background: 'transparent', color: 'var(--text-dim)', fontSize: '0.68rem', cursor: 'pointer' }}
            >
              Clear Scenario Filter
            </button>
          )}
        </div>

        {/* Active Scenario Narration Banner */}
        {activeScenario && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.08), rgba(96, 165, 250, 0.04))',
            border: '1px solid rgba(0, 229, 255, 0.3)',
            borderRadius: '4px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={15} color="#00e5ff" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.75rem', color: '#f1f5f9' }}>
                <strong style={{ color: '#00e5ff', marginRight: '6px' }}>{activeScenario.title}:</strong>
                {activeScenario.narration}
              </div>
            </div>
            <span className="mono" style={{ fontSize: '0.68rem', color: '#00e5ff', whiteSpace: 'nowrap', fontWeight: 600 }}>
              AUTO-PLAY 2x ACTIVE
            </span>
          </div>
        )}

        {/* Row 1: Session Jumpers & Playback Mode & Window Counts */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={13} /> SESSIONS:
            </span>
            {sessions.map((s) => (
              <button
                key={s.offset}
                onClick={() => setStartSecond(s.offset)}
                style={{
                  background: startSecond === s.offset ? 'var(--color-buy)' : 'var(--bg-dark)',
                  color: startSecond === s.offset ? '#080b10' : 'var(--text-muted)',
                  fontWeight: startSecond === s.offset ? 700 : 500,
                  border: '1px solid var(--border-color)',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer'
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>MODE:</span>
            <button
              onClick={() => setPlaybackMode('EVENT_INDEX')}
              style={{
                background: playbackMode === 'EVENT_INDEX' ? 'var(--color-gold)' : 'transparent',
                color: playbackMode === 'EVENT_INDEX' ? '#080b10' : 'var(--text-muted)',
                border: `1px solid ${playbackMode === 'EVENT_INDEX' ? 'var(--color-gold)' : 'var(--border-color)'}`,
                padding: '3px 7px',
                borderRadius: '3px',
                fontSize: '0.70rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Zap size={11} style={{ display: 'inline', marginRight: '3px' }} /> TPS RATE
            </button>
            <button
              onClick={() => setPlaybackMode('REAL_CLOCK')}
              style={{
                background: playbackMode === 'REAL_CLOCK' ? 'var(--color-buy)' : 'transparent',
                color: playbackMode === 'REAL_CLOCK' ? '#080b10' : 'var(--text-muted)',
                border: `1px solid ${playbackMode === 'REAL_CLOCK' ? 'var(--color-buy)' : 'var(--border-color)'}`,
                padding: '3px 7px',
                borderRadius: '3px',
                fontSize: '0.70rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Timer size={11} style={{ display: 'inline', marginRight: '3px' }} /> PROPORTIONAL CLOCK
            </button>

            <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginLeft: '6px' }}>
              WINDOW: <strong style={{ color: 'var(--color-gold)' }}>{totalInWindow.toLocaleString()}</strong> IN 60s
              <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>({clipStartUtc}&rarr;{clipEndUtc}, {clipDurationSec}s)</span>
            </div>
          </div>
        </div>

        {/* Row 2: Playback Controls, Speed, and Dynamic Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: isPlaying ? 'var(--color-sell)' : 'var(--color-buy)',
                color: '#080b10',
                fontWeight: 700,
                padding: '5px 14px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>

            <button
              onClick={() => setCurrentIndex((prev) => Math.min(trades.length - 1, prev + 1))}
              disabled={isPlaying || currentIndex >= trades.length - 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '0.76rem',
                cursor: 'pointer'
              }}
            >
              <SkipForward size={13} /> STEP
            </button>

            <button
              onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '0.76rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> RESET
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
              <FastForward size={12} color="var(--text-dim)" />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>SPEED:</span>
              {[1, 2, 5, 10].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  style={{
                    background: playbackSpeed === spd ? 'var(--color-buy-soft)' : 'transparent',
                    color: playbackSpeed === spd ? 'var(--color-buy)' : 'var(--text-dim)',
                    border: `1px solid ${playbackSpeed === spd ? 'var(--color-buy)' : 'var(--border-color)'}`,
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '0.70rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic User Guidance Notice (P1) */}
          <div className="mono" style={{ fontSize: '0.76rem' }}>
            {currentIndex === 0 ? (
              <span style={{ color: 'var(--color-gold)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                已加载 {trades.length.toLocaleString()} 笔（片段跨度 {clipDurationSec}s），当前显示第 1 笔，点击「PLAY」开始回放
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>
                当前显示第 <strong style={{ color: '#fff' }}>{(currentIndex + 1).toLocaleString()}</strong> / {trades.length.toLocaleString()} 笔 ({(((currentIndex + 1) / Math.max(1, trades.length)) * 100).toFixed(1)}%) &bull; {playbackMode === 'REAL_CLOCK' ? `Proportional ${playbackSpeed}x` : `${playbackSpeed * 10} tps`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Charts & Inspector Grid */}
      <div className="responsive-inspector-grid">
        {/* Trajectory & CVD Canvas */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>TICK-LEVEL PRICE TRAJECTORY & <GlossaryTerm term="cvd">CVD</GlossaryTerm></span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              WINDOW: {visibleTrades.length} / {trades.length} DISPLAYED ({totalInWindow} IN 60s)
            </span>
          </div>

          {loading ? (
            <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
              Loading high-precision trade events from DuckDB Parquet layer...
            </div>
          ) : (
            <>
              <MMLChart option={chartOption} style={{ height: '350px', width: '100%' }} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '8px', lineHeight: '1.4' }}>
                * <strong>CVD Scope Notice:</strong> Cumulative Volume Delta (CVD) is calculated strictly as cumulative aggressive buy minus sell volume within this loaded replay clip (anchored to 0.0 BTC at clip onset {clipStartUtc} UTC), not the full 24-hour day cumulative sum. Physical market span covered: {clipDurationSec}s.
              </div>
            </>
          )}
        </div>

        {/* Real-Time Event Telemetry Card */}
        <div className="mml-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="mml-card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color="var(--color-gold)" /> TICK TELEMETRY
            </span>
            <span className="mono" style={{ color: currentTrade?.direction === 1 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
              {currentTrade?.aggressor_side || '---'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>EVENT TIME (UTC):</span>
              <span className="mono">{currentTrade?.event_time_utc?.split('T')[1] || '---'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>TIMESTAMP (NS):</span>
              <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {currentTrade?.event_timestamp_ns || '---'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>TRADE ID:</span>
              <span className="mono" style={{ color: 'var(--color-gold)' }}>
                {currentTrade?.trade_id || '---'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>EXECUTION PRICE:</span>
              <span className="mono" style={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>
                ${currentTrade?.price ? currentTrade.price.toFixed(2) : '0.00'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>CLIP SIZE:</span>
              <span className="mono" style={{ fontWeight: 700 }}>
                {currentTrade?.base_quantity ? currentTrade.base_quantity.toFixed(4) : '0.0000'} BTC
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>NOTIONAL (USD):</span>
              <span className="mono">
                ${currentTrade?.quote_quantity ? currentTrade.quote_quantity.toFixed(2) : '0.00'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>IS BUYER MAKER:</span>
              <span className="mono" style={{ color: currentTrade?.is_buyer_maker ? 'var(--color-sell)' : 'var(--color-buy)' }}>
                {currentTrade?.is_buyer_maker ? 'TRUE (SELL AGGRESSOR)' : 'FALSE (BUY AGGRESSOR)'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--text-dim)' }}>
                <GlossaryTerm term="cvd">CUMULATIVE CVD</GlossaryTerm>:
              </span>
              <span className="mono" style={{ fontWeight: 700, color: runningCvd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                {runningCvd.toFixed(4)} BTC
              </span>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
              <strong>Zero Backfill Guarantee:</strong> All trade events reflect actual discrete matches executed on Binance Spot match engine. 64-bit int precision preserved.
            </div>
          </div>
        </div>
      </div>

      {/* Production Avellaneda-Stoikov Market Making Simulator (MML v3.0) */}
      <MarketMakingSimulator trades={trades} />

      {/* Story Bridge to Act 2 */}
      <StoryBridge
        currentAct={1}
        currentActTitle="看现场 · 逐笔回放"
        takeaway="亲眼见证了单笔大卖单如何瞬间击穿买一档位，并在微观秒级引发瞬态流动性空洞与做市商价差回补。"
        nextAct="observatory"
        nextActNumber={2}
        nextActTitle="探规律 · 订单流与羊群自激"
        nextQuestion="为什么一笔大单砸下来之后，后续几十毫秒往往跟着一长串连续同向吃单？羊群传染效应有多强？"
        onNavigate={(tab) => onNavigateTab ? onNavigateTab(tab) : undefined}
      />
    </div>
  );
};
