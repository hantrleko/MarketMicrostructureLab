import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Play, Pause, SkipForward, RotateCcw, FastForward, Clock, Zap, Timer } from 'lucide-react';
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
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [playbackMode, setPlaybackMode] = useState<'EVENT_INDEX' | 'REAL_CLOCK'>('EVENT_INDEX');
  const timerRef = useRef<any>(null);

  // Available pre-indexed intraday market sessions
  const sessions = [
    { label: '00:00 UTC (Day Open)', offset: 0 },
    { label: '08:00 UTC (London Open)', offset: 28800 },
    { label: '14:00 UTC (US Influx)', offset: 50400 },
    { label: '20:00 UTC (Late Liquidity)', offset: 72000 }
  ];

  // Load trade window
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);

    fetchReplayWindow('BTCUSDT', date, startSecond, durationSeconds, 2000)
      .then((data) => {
        if (isMounted) {
          setTrades(data.trades);
          setTotalInWindow(data.total_in_window || data.trades.length);
          setIsTruncated(Boolean(data.is_truncated));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Session Jumper Bar */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={16} color="var(--color-gold)" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
            PRE-INDEXED INTRADAY WINDOWS:
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
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>PLAYBACK MODE:</span>
          <button
            onClick={() => setPlaybackMode('EVENT_INDEX')}
            style={{
              background: playbackMode === 'EVENT_INDEX' ? 'var(--color-gold)' : 'transparent',
              color: playbackMode === 'EVENT_INDEX' ? '#080b10' : 'var(--text-muted)',
              border: `1px solid ${playbackMode === 'EVENT_INDEX' ? 'var(--color-gold)' : 'var(--border-color)'}`,
              padding: '4px 8px',
              borderRadius: '3px',
              fontSize: '0.74rem',
              fontWeight: 600
            }}
          >
            <Zap size={12} style={{ display: 'inline', marginRight: '4px' }} /> CONSTANT RATE (TPS)
          </button>
          <button
            onClick={() => setPlaybackMode('REAL_CLOCK')}
            style={{
              background: playbackMode === 'REAL_CLOCK' ? 'var(--color-buy)' : 'transparent',
              color: playbackMode === 'REAL_CLOCK' ? '#080b10' : 'var(--text-muted)',
              border: `1px solid ${playbackMode === 'REAL_CLOCK' ? 'var(--color-buy)' : 'var(--border-color)'}`,
              padding: '4px 8px',
              borderRadius: '3px',
              fontSize: '0.74rem',
              fontWeight: 600
            }}
          >
            <Timer size={12} style={{ display: 'inline', marginRight: '4px' }} /> PROPORTIONAL CLOCK
          </button>
        </div>
      </div>

      {/* Sampling Coverage & Physical Span Banner */}
      <div style={{
        background: isTruncated ? 'rgba(234, 179, 8, 0.08)' : 'rgba(0, 229, 255, 0.05)',
        border: `1px solid ${isTruncated ? 'rgba(234, 179, 8, 0.3)' : 'var(--border-color)'}`,
        borderRadius: '4px',
        padding: '8px 14px',
        fontSize: '0.78rem',
        color: isTruncated ? 'var(--color-gold)' : 'var(--text-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        <span>
          {isTruncated ? '⚠️' : 'ℹ️'} <strong>Loaded Replay Clip:</strong> Nominal Window: <strong>60s</strong> &bull; Actual Physical Span: <strong className="mono">{clipStartUtc || '00:00:00'} - {clipEndUtc || '00:00:24'} UTC</strong> (<strong className="mono">{clipDurationSec}s</strong> elapsed).
          {isTruncated ? (
            <span> Loaded first <strong>{trades.length.toLocaleString()}</strong> of <strong>{totalInWindow.toLocaleString()}</strong> window trades ({((trades.length / Math.max(1, totalInWindow)) * 100).toFixed(1)}% event coverage).</span>
          ) : (
            <span> Loaded all <strong>{trades.length.toLocaleString()}</strong> trades in window (100% coverage).</span>
          )}
        </span>
        <span className="mono" style={{ fontSize: '0.74rem' }}>
          {playbackMode === 'REAL_CLOCK' ? `Monotonic Clock (${playbackSpeed}x Real Time)` : `Fixed Rate (${playbackSpeed * 10} Trades/Sec)`}
        </span>
      </div>

      {/* Control Bar */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isPlaying ? 'var(--color-sell)' : 'var(--color-buy)',
              color: '#080b10',
              fontWeight: 700,
              padding: '8px 18px',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            {isPlaying ? 'PAUSE' : 'PLAY REPLAY'}
          </button>

          <button
            onClick={() => setCurrentIndex((prev) => Math.min(trades.length - 1, prev + 1))}
            disabled={isPlaying || currentIndex >= trades.length - 1}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--bg-dark)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              padding: '8px 14px',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}
          >
            <SkipForward size={14} /> STEP
          </button>

          <button
            onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--bg-dark)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '0.85rem'
            }}
          >
            <RotateCcw size={14} /> RESET
          </button>

          {/* Speed control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
            <FastForward size={14} color="var(--text-dim)" />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>SPEED:</span>
            {[1, 2, 5, 10].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                style={{
                  background: playbackSpeed === spd ? 'var(--color-buy-soft)' : 'transparent',
                  color: playbackSpeed === spd ? 'var(--color-buy)' : 'var(--text-dim)',
                  border: `1px solid ${playbackSpeed === spd ? 'var(--color-buy)' : 'var(--border-color)'}`,
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '0.75rem',
                  fontWeight: 600
                }}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>

        {/* Verification & Window Counts Display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            DISPLAYED: <strong style={{ color: '#fff' }}>{visibleTrades.length}</strong> / {trades.length}
          </div>
          <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>
            WINDOW EVENTS (60s): <strong>{totalInWindow.toLocaleString()}</strong>
          </div>
          {isTruncated && (
            <span className="badge-gold" style={{ fontSize: '0.7rem' }}>
              SLICE TRUNCATED AT {trades.length}
            </span>
          )}
        </div>
      </div>

      {/* Main Charts & Inspector Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        {/* Trajectory & CVD Canvas */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>TICK-LEVEL PRICE TRAJECTORY & CVD</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              WINDOW: {visibleTrades.length} / {trades.length} DISPLAYED ({totalInWindow} IN 60s)
            </span>
          </div>

          {loading ? (
            <div style={{ height: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
              Loading high-precision trade events from DuckDB Parquet layer...
            </div>
          ) : (
            <>
              <ReactECharts option={chartOption} style={{ height: '420px', width: '100%' }} />
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
