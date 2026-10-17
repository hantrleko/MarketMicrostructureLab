import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Play, Pause, SkipForward, RotateCcw, FastForward, Clock, Zap } from 'lucide-react';
import { fetchReplayWindow } from '../api/client';
import { ReplayTrade } from '../types';

interface MarketReplayProps {
  date: string;
}

export const MarketReplay: React.FC<MarketReplayProps> = ({ date }) => {
  const [startSecond, setStartSecond] = useState<number>(0);
  const [durationSeconds] = useState<number>(60);
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const timerRef = useRef<any>(null);

  // Load trade window
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);

    fetchReplayWindow('BTCUSDT', date, startSecond, durationSeconds, 2500)
      .then((data) => {
        if (isMounted) {
          setTrades(data.trades);
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

  // Playback loop
  useEffect(() => {
    if (isPlaying && trades.length > 0) {
      const intervalMs = Math.max(20, Math.floor(100 / playbackSpeed));
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= trades.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, trades, playbackSpeed]);

  const currentTrade = trades[currentIndex] || trades[0];

  // Prepare chart series up to currentIndex
  const visibleTrades = trades.slice(0, Math.max(1, currentIndex + 1));
  
  // Chart data:
  // Scatter points: [time_str, price, qty, aggressor_side]
  const buyScatter = visibleTrades
    .filter((t) => t.direction === 1)
    .map((t) => [t.event_time_utc.split('T')[1].replace('Z', ''), t.price, t.base_quantity]);

  const sellScatter = visibleTrades
    .filter((t) => t.direction === -1)
    .map((t) => [t.event_time_utc.split('T')[1].replace('Z', ''), t.price, t.base_quantity]);

  // Price line
  const priceLine = visibleTrades.map((t) => [
    t.event_time_utc.split('T')[1].replace('Z', ''),
    t.price
  ]);

  // Calculate cumulative CVD for visible
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

        {/* Offset Slider (into the day) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Clock size={16} color="var(--text-dim)" />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>TIME OFFSET:</span>
          <input
            type="range"
            min="0"
            max="86000"
            step="60"
            value={startSecond}
            onChange={(e) => setStartSecond(Number(e.target.value))}
            style={{ width: '180px', accentColor: 'var(--color-buy)' }}
          />
          <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--color-gold)' }}>
            +{Math.floor(startSecond / 3600)}h {Math.floor((startSecond % 3600) / 60)}m
          </span>
        </div>
      </div>

      {/* Main Charts & Inspector Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        {/* Trajectory & CVD Canvas */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>TICK-LEVEL PRICE TRAJECTORY & CVD</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              WINDOW: {visibleTrades.length} / {trades.length} TRADES
            </span>
          </div>

          {loading ? (
            <div style={{ height: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
              Loading real tick events from Parquet layer...
            </div>
          ) : (
            <ReactECharts option={chartOption} style={{ height: '480px', width: '100%' }} />
          )}
        </div>

        {/* Live Inspector Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Current Event Card */}
          <div className="mml-card">
            <div className="mml-card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} color="var(--color-gold)" /> INSPECTOR
              </span>
              <span className={`badge-${currentTrade?.direction === 1 ? 'buy' : 'sell'}`}>
                {currentTrade?.aggressor_side || 'IDLE'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>UTC TIMESTAMP:</span>
                <span className="mono" style={{ color: 'var(--text-main)', fontSize: '0.75rem' }}>
                  {currentTrade?.event_time_utc || 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>PRICE (USDT):</span>
                <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: currentTrade?.direction === 1 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                  ${currentTrade?.price?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>SIZE (BTC):</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {currentTrade?.base_quantity?.toFixed(4) || '0.0000'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>NOTIONAL (USDT):</span>
                <span className="mono">
                  ${currentTrade?.quote_quantity?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>TRADE ID:</span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>
                  {currentTrade?.trade_id || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Trades Tape */}
          <div className="mml-card" style={{ flex: 1, overflow: 'hidden' }}>
            <div className="mml-card-title">
              <span>LIVE TRADE TAPE</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-gold)' }}>MICROSECOND ORDER</span>
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <table className="mml-table mono" style={{ fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>TIME</th>
                    <th>PRICE</th>
                    <th>QTY</th>
                    <th>SIDE</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrades.slice(-12).reverse().map((t, idx) => (
                    <tr key={t.trade_id + '_' + idx}>
                      <td style={{ color: 'var(--text-dim)' }}>
                        {t.event_time_utc.split('T')[1].replace('Z', '').slice(0, 11)}
                      </td>
                      <td style={{ color: t.direction === 1 ? 'var(--color-buy)' : 'var(--color-sell)', fontWeight: 600 }}>
                        {t.price.toFixed(1)}
                      </td>
                      <td>{t.base_quantity.toFixed(3)}</td>
                      <td>
                        <span style={{ color: t.direction === 1 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                          {t.aggressor_side}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
