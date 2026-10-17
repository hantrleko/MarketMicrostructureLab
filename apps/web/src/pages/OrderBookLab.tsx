import { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchOrderBookStatus, controlOrderBook, fetchLiveOrderBook } from '../api/client';
import { AlertCircle, Wifi, Cpu, Database, Play, Square, Activity, Layers } from 'lucide-react';

export const OrderBookLab: React.FC = () => {
  const [obStatus, setObStatus] = useState<any>(null);
  const [ladder, setLadder] = useState<any>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const pollTimerRef = useRef<any>(null);

  // Poll initial status
  useEffect(() => {
    fetchOrderBookStatus()
      .then((data) => {
        setObStatus(data);
        if (data.is_running) {
          setIsLiveActive(true);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  // Polling loop when live active
  useEffect(() => {
    if (isLiveActive) {
      pollTimerRef.current = setInterval(() => {
        fetchLiveOrderBook(12)
          .then((lData) => {
            setLadder(lData);
            setObStatus({
              status: lData.status,
              is_valid: lData.is_valid,
              last_update_id: lData.last_update_id,
              sync_errors: lData.sync_errors,
              metrics: lData.metrics
            });
          })
          .catch((err) => console.error(err));
      }, 250); // 4Hz refresh for smooth quant terminal view
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isLiveActive]);

  const handleToggleSync = async () => {
    try {
      if (isLiveActive) {
        await controlOrderBook('stop');
        setIsLiveActive(false);
      } else {
        await controlOrderBook('start');
        setIsLiveActive(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const metrics = ladder?.metrics || obStatus?.metrics;
  const bids = ladder?.bids || [];
  const asks = ladder?.asks || [];
  const maxQty = Math.max(
    1,
    ...bids.map((b: any) => b.qty),
    ...asks.map((a: any) => a.qty)
  );

  // History for streaming OFI & Spread chart
  const history = ladder?.history || [];
  const timeLabels = history.map((h: any) => h.time_str);
  const spreadBps = history.map((h: any) => h.spread_bps);
  const cumOfi = history.map((h: any) => h.cumulative_ofi);

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' }
    },
    grid: [
      { left: '6%', right: '4%', top: '15%', height: '35%' },
      { left: '6%', right: '4%', top: '60%', height: '30%' }
    ],
    xAxis: [
      {
        type: 'category',
        data: timeLabels,
        gridIndex: 0,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { show: false }
      },
      {
        type: 'category',
        data: timeLabels,
        gridIndex: 1,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono', fontSize: 10 }
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: 'Spread (bps)',
        gridIndex: 0,
        splitLine: { lineStyle: { color: '#161e2e' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
      },
      {
        type: 'value',
        name: 'Cumulative OFI',
        gridIndex: 1,
        splitLine: { lineStyle: { color: '#161e2e' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
      }
    ],
    series: [
      {
        name: 'Spread (bps)',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: spreadBps,
        lineStyle: { color: '#ffd700', width: 2 },
        showSymbol: false
      },
      {
        name: 'Cumulative OFI (BTC)',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: cumOfi,
        lineStyle: { color: '#00e5ff', width: 2 },
        areaStyle: { color: 'rgba(0, 229, 255, 0.08)' },
        showSymbol: false
      }
    ]
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Live Control & Synchronization Header */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={handleToggleSync}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isLiveActive ? 'var(--color-sell)' : 'var(--color-buy)',
              color: '#080b10',
              fontWeight: 800,
              padding: '10px 22px',
              borderRadius: '5px',
              fontSize: '0.9rem',
              letterSpacing: '0.04em'
            }}
          >
            {isLiveActive ? <Square size={16} /> : <Play size={16} />}
            {isLiveActive ? 'STOP LIVE SYNC' : 'START LIVE L2 SYNC'}
          </button>

          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              BINANCE SPOT L2 LOCAL ORDER BOOK SYNCHRONIZER
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Diff Depth Stream (100ms) + REST Atomic Snapshot Alignment. Real-time Microprice & OFI Engine.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>STATUS:</span>
            <span className={obStatus?.status === 'SYNCHRONIZED' ? 'badge-buy' : 'badge-gold'}>
              {obStatus?.status || 'IDLE'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>SEQ ERRORS:</span>
            <span className="mono badge-buy">{obStatus?.sync_errors ?? 0}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>LAST UPDATE ID:</span>
            <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {obStatus?.last_update_id || '---'}
            </span>
          </div>
        </div>
      </div>

      {/* Real-Time Metrics 4-Grid */}
      <div className="grid-4">
        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>BID-ASK SPREAD</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {metrics?.is_valid ? `$${metrics.spread.toFixed(2)} (${metrics.spread_bps.toFixed(3)} bps)` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-buy)', marginTop: '4px' }}>
            Best: ${metrics?.best_bid?.toFixed(2) || '0'} / ${metrics?.best_ask?.toFixed(2) || '0'}
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>MICROPRICE</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-buy)', marginTop: '4px' }}>
            {metrics?.is_valid ? `$${metrics.microprice.toFixed(2)}` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Mid: ${metrics?.mid_price?.toFixed(2) || '0'}
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>TOP 5 BOOK IMBALANCE</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: metrics?.book_imbalance > 0 ? 'var(--color-buy)' : 'var(--color-sell)', marginTop: '4px' }}>
            {metrics?.is_valid ? metrics.book_imbalance.toFixed(3) : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            (Depth_B5 - Depth_A5) / Sum
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>CUMULATIVE OFI</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-gold)', marginTop: '4px' }}>
            {history.length > 0 ? `${history[history.length - 1].cumulative_ofi.toFixed(2)} BTC` : '0.00 BTC'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Quote-based Flow Imbalance
          </div>
        </div>
      </div>

      {/* Main Order Book Ladder & OFI Streaming Chart Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '20px' }}>
        {/* L2 Depth Ladder */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--color-buy)" /> L2 DEPTH LADDER (REAL-TIME)
            </span>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--color-gold)' }}>
              100ms TICK
            </span>
          </div>

          {!isLiveActive ? (
            <div style={{ height: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
              <AlertCircle size={32} color="var(--color-gold)" />
              <div>Live WebSocket stream is currently stopped.</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Click <strong>"START LIVE L2 SYNC"</strong> above to establish real-time WebSocket connection to Binance and synchronize L2 order book.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem' }}>
              {/* ASKS (Reversed so lowest ask is at bottom near spread) */}
              <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '2px' }}>
                {asks.map((ask: any, idx: number) => {
                  const pct = Math.min(100, (ask.qty / maxQty) * 100);
                  return (
                    <div
                      key={`ask_${idx}`}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '3px 8px',
                        background: 'rgba(255, 145, 0, 0.04)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: `${pct}%`,
                          background: 'rgba(255, 145, 0, 0.18)',
                          zIndex: 0
                        }}
                      />
                      <span className="mono" style={{ color: 'var(--color-sell)', fontWeight: 600, zIndex: 1 }}>
                        ${ask.price.toFixed(2)}
                      </span>
                      <span className="mono" style={{ color: 'var(--text-main)', zIndex: 1 }}>
                        {ask.qty.toFixed(4)} BTC
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* SPREAD DIVIDER */}
              <div
                style={{
                  margin: '6px 0',
                  padding: '6px 10px',
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem'
                }}
              >
                <span style={{ color: 'var(--color-gold)', fontWeight: 700 }}>
                  SPREAD: ${metrics?.spread?.toFixed(2) || '0.00'}
                </span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>
                  MID: ${metrics?.mid_price?.toFixed(2) || '0.00'}
                </span>
                <span className="mono" style={{ color: 'var(--color-buy)' }}>
                  {metrics?.spread_bps?.toFixed(3) || '0'} bps
                </span>
              </div>

              {/* BIDS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {bids.map((bid: any, idx: number) => {
                  const pct = Math.min(100, (bid.qty / maxQty) * 100);
                  return (
                    <div
                      key={`bid_${idx}`}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '3px 8px',
                        background: 'rgba(0, 229, 255, 0.04)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: `${pct}%`,
                          background: 'rgba(0, 229, 255, 0.18)',
                          zIndex: 0
                        }}
                      />
                      <span className="mono" style={{ color: 'var(--color-buy)', fontWeight: 600, zIndex: 1 }}>
                        ${bid.price.toFixed(2)}
                      </span>
                      <span className="mono" style={{ color: 'var(--text-main)', zIndex: 1 }}>
                        {bid.qty.toFixed(4)} BTC
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Real-Time Spread & OFI Streaming Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="mml-card">
            <div className="mml-card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={14} color="var(--color-gold)" /> STREAMING SPREAD (bps) & ORDER FLOW IMBALANCE (OFI)
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                ROLLING BUFFER: {history.length} TICKS
              </span>
            </div>

            <ReactECharts option={chartOption} style={{ height: '360px', width: '100%' }} />
          </div>

          {/* Architecture Checklist */}
          <div className="grid-3">
            <div className="mml-card">
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-buy)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wifi size={14} /> WEBSOCKET STREAM
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Subscribed to <code>btcusdt@depth@100ms</code>.
              </div>
            </div>

            <div className="mml-card">
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Database size={14} /> REST ALIGNMENT
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                U &lt;= lastUpdateId+1 &lt;= u sequence check.
              </div>
            </div>

            <div className="mml-card">
              <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-sell)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={14} /> ZERO BACKFILL
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Historical books only saved from valid sync.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
