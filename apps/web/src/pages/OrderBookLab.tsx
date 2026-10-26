import { useState, useEffect, useRef } from 'react';
import { fetchOrderBookStatus, controlOrderBook, fetchLiveOrderBook } from '../api/client';
import { OrderBookStatusResponse, OrderBookLadderResponse, DataSourceStatus } from '../types';
import { AlertCircle, Wifi, Cpu, Database, Play, Square, Activity, Layers, ShieldAlert } from 'lucide-react';
import { MMLChart } from '../components/MMLChart';

export const OrderBookLab: React.FC = () => {
  const [obStatus, setObStatus] = useState<OrderBookStatusResponse | null>(null);
  const [ladder, setLadder] = useState<OrderBookLadderResponse | null>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [isSimulatedActive, setIsSimulatedActive] = useState<boolean>(false);
  const [liveSyncError, setLiveSyncError] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Poll initial status
  useEffect(() => {
    fetchOrderBookStatus()
      .then((data) => {
        setObStatus(data);
        if (data.is_running && data.status === 'SYNCHRONIZED') {
          setIsLiveActive(true);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  // Polling loop
  useEffect(() => {
    if (isLiveActive || isSimulatedActive) {
      pollTimerRef.current = setInterval(() => {
        fetchLiveOrderBook(12, isSimulatedActive)
          .then((lData) => {
            setLadder(lData);
            setObStatus((prev) => ({
              phase: prev?.phase || 'Phase 2 (Market Depth & Local Order Book Sync)',
              symbol: lData.symbol,
              data_status: lData.data_status,
              status: lData.status,
              is_valid: lData.is_valid,
              is_running: isLiveActive,
              last_update_id: lData.last_update_id,
              sync_errors: lData.sync_errors,
              disclaimer: prev?.disclaimer || ''
            }));
          })
          .catch((err) => console.error(err));
      }, 250); // 4Hz refresh for responsive quant terminal view
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isLiveActive, isSimulatedActive]);

  const handleToggleLiveSync = async () => {
    try {
      setLiveSyncError(null);
      if (isLiveActive) {
        await controlOrderBook('stop');
        setIsLiveActive(false);
      } else {
        setIsSimulatedActive(false);
        const res = await controlOrderBook('start');
        if (res.status === 'SIMULATED_DEMO') {
          // Backend not reachable: DO NOT silently fall back to simulated mode!
          setIsLiveActive(false);
          setIsSimulatedActive(false);
          setLiveSyncError('Local Python API service is offline or unreachable (expected at http://localhost:8000/api/v1). Live L2 WebSocket stream requires "uvicorn apps.api.main:app". Automatic silent fallback to simulated mode is disabled to uphold institutional data honesty. If you wish to preview the interactive interface using an isolated in-memory simulator, please click "SIMULATE PREVIEW (DEMO)".');
        } else {
          setIsLiveActive(true);
        }
      }
    } catch (e: any) {
      console.error(e);
      setIsLiveActive(false);
      setIsSimulatedActive(false);
      setLiveSyncError(e?.message || 'Failed to connect to local API server.');
    }
  };

  const handleToggleSimulatedDemo = () => {
    setLiveSyncError(null);
    if (isSimulatedActive) {
      setIsSimulatedActive(false);
      setLadder(null);
    } else {
      setIsLiveActive(false);
      setIsSimulatedActive(true);
    }
  };

  const dataStatus: DataSourceStatus = ladder?.data_status || obStatus?.data_status || 'UNAVAILABLE';
  const metrics = ladder?.metrics;
  const bids = ladder?.bids || [];
  const asks = ladder?.asks || [];
  const maxQty = Math.max(
    1,
    ...bids.map((b) => b.qty),
    ...asks.map((a) => a.qty)
  );

  // History for streaming OFI & Spread chart
  const history = ladder?.history || [];
  const timeLabels = history.map((h) => h.time_str);
  const spreadBps = history.map((h) => h.spread_bps);
  const cumOfi = history.map((h) => h.cumulative_ofi);

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
      {/* Simulation Warning Banner (When active) */}
      {dataStatus === 'SIMULATED' && (
        <div
          style={{
            background: 'rgba(255, 145, 0, 0.12)',
            border: '1px solid var(--color-sell)',
            borderRadius: '6px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#f8fafc'
          }}
        >
          <ShieldAlert size={22} color="var(--color-sell)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-sell)' }}>
              RESEARCH INTEGRITY ALERT: SYNTHETIC SIMULATION MODE ACTIVE
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              This L2 order book is generated locally for interactive terminal UI demonstration. Per MML research integrity rules, simulated order book data is <strong>NEVER mixed with empirical research statistics</strong> or stored in historical research layers.
            </div>
          </div>
        </div>
      )}

      {/* Live Sync Offline Alert (Honest Fail-Closed State) */}
      {liveSyncError && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            color: '#fca5a5',
            fontSize: '0.8rem'
          }}
        >
          <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-sell)' }} />
          <div style={{ flex: 1, lineHeight: '1.5' }}>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
              LIVE L2 CONNECTION UNAVAILABLE &bull; LOCAL BACKEND OFFLINE
            </div>
            {liveSyncError}
          </div>
          <button
            onClick={() => setLiveSyncError(null)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '2px 8px',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '0.74rem'
            }}
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Live Control & Synchronization Header */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={handleToggleLiveSync}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isLiveActive ? 'var(--color-sell)' : 'var(--color-buy)',
              color: '#080b10',
              fontWeight: 800,
              padding: '10px 22px',
              borderRadius: '5px',
              fontSize: '0.85rem',
              letterSpacing: '0.04em'
            }}
          >
            {isLiveActive ? <Square size={16} /> : <Play size={16} />}
            {isLiveActive ? 'STOP LIVE L2 SYNC' : 'START LIVE L2 SYNC (LOCAL API)'}
          </button>

          <button
            onClick={handleToggleSimulatedDemo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isSimulatedActive ? 'var(--color-sell)' : 'var(--bg-dark)',
              border: '1px solid var(--border-color)',
              color: isSimulatedActive ? '#fff' : 'var(--text-muted)',
              fontWeight: 600,
              padding: '10px 18px',
              borderRadius: '5px',
              fontSize: '0.82rem'
            }}
          >
            <Activity size={15} color={isSimulatedActive ? '#fff' : 'var(--color-gold)'} />
            {isSimulatedActive ? 'STOP SIMULATION' : 'SIMULATE PREVIEW (DEMO)'}
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
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>DATA STATUS:</span>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '3px',
                background:
                  dataStatus === 'LIVE_VERIFIED'
                    ? 'rgba(0, 229, 255, 0.15)'
                    : dataStatus === 'SIMULATED'
                    ? 'rgba(255, 145, 0, 0.15)'
                    : 'rgba(100, 116, 139, 0.2)',
                color:
                  dataStatus === 'LIVE_VERIFIED'
                    ? 'var(--color-buy)'
                    : dataStatus === 'SIMULATED'
                    ? 'var(--color-sell)'
                    : 'var(--text-dim)',
                border: `1px solid ${
                  dataStatus === 'LIVE_VERIFIED'
                    ? 'var(--color-buy)'
                    : dataStatus === 'SIMULATED'
                    ? 'var(--color-sell)'
                    : 'var(--border-color)'
                }`
              }}
            >
              {dataStatus === 'UNAVAILABLE' ? '未连接 / STANDBY' : dataStatus}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>ENGINE STATUS:</span>
            <span className={obStatus?.status === 'SYNCHRONIZED' ? 'badge-buy' : 'badge-gold'}>
              {obStatus?.status || '未连接 / STANDBY'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>SEQ ERRORS:</span>
            <span className="mono badge-buy">{isLiveActive || isSimulatedActive ? (obStatus?.sync_errors ?? 0) : '---'}</span>
          </div>
        </div>
      </div>

      {/* Real-Time Metrics 4-Grid */}
      <div className="grid-4">
        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>BID-ASK SPREAD</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? `$${metrics?.spread.toFixed(2)} (${metrics?.spread_bps.toFixed(3)} bps)` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-buy)', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? `Best: $${metrics?.best_bid?.toFixed(2)} / $${metrics?.best_ask?.toFixed(2)}` : 'Best: --- / ---'}
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>MICROPRICE</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-buy)', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? `$${metrics?.microprice.toFixed(2)}` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? `Mid: $${metrics?.mid_price?.toFixed(2)}` : 'Mid: ---'}
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>TOP 5 BOOK IMBALANCE</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: (metrics?.book_imbalance || 0) > 0 ? 'var(--color-buy)' : 'var(--color-sell)', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? metrics?.book_imbalance.toFixed(3) : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            (Depth_B5 - Depth_A5) / Sum
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>CUMULATIVE OFI</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-gold)', marginTop: '4px' }}>
            {(metrics?.is_valid || isSimulatedActive) && history.length > 0 ? `${history[history.length - 1].cumulative_ofi.toFixed(2)} BTC` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Quote-based Flow Imbalance
          </div>
        </div>
      </div>

      {/* Main Order Book Ladder & OFI Streaming Chart Grid */}
      <div className="responsive-orderbook-grid">
        {/* L2 Depth Ladder */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--color-buy)" /> L2 DEPTH LADDER
            </span>
            <span className="mono" style={{ fontSize: '0.72rem', color: dataStatus === 'SIMULATED' ? 'var(--color-sell)' : 'var(--color-gold)' }}>
              {dataStatus === 'SIMULATED' ? 'SIMULATED 100ms' : dataStatus === 'LIVE_VERIFIED' ? 'LIVE 100ms TICK' : 'STANDBY'}
            </span>
          </div>

          {!isLiveActive && !isSimulatedActive ? (
            <div style={{ height: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>
              <AlertCircle size={32} color="var(--color-gold)" />
              <div>Live WebSocket stream is currently in STANDBY.</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', maxWidth: '340px' }}>
                For authentic live L2 book synchronization, run the local Python FastAPI collector with <code>uvicorn apps.api.main:app</code>. Or click <strong>"SIMULATE PREVIEW"</strong> to inspect ladder rendering behavior.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem' }}>
              {/* ASKS (Reversed so lowest ask is at bottom near spread) */}
              <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '2px' }}>
                {asks.map((ask, idx) => {
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
                {bids.map((bid, idx) => {
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

            <MMLChart option={chartOption} style={{ height: '360px', width: '100%' }} />
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
