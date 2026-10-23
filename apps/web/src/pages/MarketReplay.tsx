import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Play, Pause, SkipForward, RotateCcw, FastForward, Clock, Zap, Timer, AlertTriangle } from 'lucide-react';
import { fetchReplayWindow } from '../api/client';
import { ReplayTrade } from '../types';

interface MarketReplayProps {
  date: string;
}

export const MarketReplay: React.FC<MarketReplayProps> = ({ date }) => {
  const [startSecond, setStartSecond] = useState<number>(0);
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
  const timerRef = useRef<any>(null);
  const activeQueryIdRef = useRef<number>(0);

  // Available pre-indexed intraday market sessions
  const sessions = [
    { label: '00:00 UTC (Day Open)', offset: 0 },
    { label: '08:00 UTC (London Open)', offset: 28800 },
    { label: '14:00 UTC (US Influx)', offset: 50400 },
    { label: '20:00 UTC (Late Liquidity)', offset: 72000 }
  ];

  // Load trade window
  useEffect(() => {
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
  }, [date, startSecond, durationSeconds]);

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

      {/* Consolidated Compact Replay Toolbar (~85px, 2 rows) */}
      <div className="mml-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
            <span>TICK-LEVEL PRICE TRAJECTORY & CVD</span>
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
              <ReactECharts option={chartOption} style={{ height: '350px', width: '100%' }} />
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
              <span style={{ color: 'var(--text-dim)' }}>CUMULATIVE CVD:</span>
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
    </div>
  );
};
