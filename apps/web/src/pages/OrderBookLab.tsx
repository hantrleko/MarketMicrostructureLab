import { useState, useEffect, useRef } from 'react';
import { fetchOrderBookStatus, controlOrderBook, fetchLiveOrderBook } from '../api/client';
import { OrderBookStatusResponse, OrderBookLadderResponse, DataSourceStatus } from '../types';
import { Wifi, Cpu, Database, Play, Square, Activity, Layers, ShieldAlert, Zap, RotateCcw } from 'lucide-react';
import { MMLChart } from '../components/MMLChart';

interface SandboxLevel {
  price: number;
  qty: number;
}

const DEFAULT_SANDBOX_ASKS: SandboxLevel[] = [
  { price: 68500.10, qty: 2.45 },
  { price: 68500.20, qty: 4.80 },
  { price: 68500.35, qty: 7.15 },
  { price: 68500.60, qty: 11.40 },
  { price: 68501.00, qty: 16.50 },
  { price: 68501.50, qty: 22.10 },
  { price: 68502.20, qty: 28.75 },
  { price: 68503.00, qty: 35.40 },
  { price: 68504.00, qty: 42.00 },
  { price: 68505.50, qty: 50.20 },
  { price: 68507.00, qty: 58.60 },
  { price: 68509.00, qty: 68.00 }
];

const DEFAULT_SANDBOX_BIDS: SandboxLevel[] = [
  { price: 68499.90, qty: 2.60 },
  { price: 68499.80, qty: 5.10 },
  { price: 68499.65, qty: 7.40 },
  { price: 68499.40, qty: 11.20 },
  { price: 68499.00, qty: 15.80 },
  { price: 68498.50, qty: 21.60 },
  { price: 68497.80, qty: 29.10 },
  { price: 68497.00, qty: 36.50 },
  { price: 68496.00, qty: 41.80 },
  { price: 68494.50, qty: 49.50 },
  { price: 68493.00, qty: 57.20 },
  { price: 68491.00, qty: 66.80 }
];

export const OrderBookLab: React.FC = () => {
  const [obStatus, setObStatus] = useState<OrderBookStatusResponse | null>(null);
  const [ladder, setLadder] = useState<OrderBookLadderResponse | null>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [isSimulatedActive, setIsSimulatedActive] = useState<boolean>(false);
  const [liveSyncError, setLiveSyncError] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Counterfactual Sandbox State
  const [sandboxAsks, setSandboxAsks] = useState<SandboxLevel[]>(DEFAULT_SANDBOX_ASKS);
  const [sandboxBids, setSandboxBids] = useState<SandboxLevel[]>(DEFAULT_SANDBOX_BIDS);
  const [sandboxImpactSize, setSandboxImpactSize] = useState<number>(25);
  const [sandboxDirection, setSandboxDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [sandboxResult, setSandboxResult] = useState<{
    direction: 'BUY' | 'SELL';
    size: number;
    vwap: number;
    slippageBps: number;
    levelsCleared: number;
    spread: number;
    recoveringPct: number;
  } | null>(null);
  const recoveryTimerRef = useRef<any>(null);

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

  const fireSandboxImpact = () => {
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);

    let remainingQty = sandboxImpactSize;
    let filledValue = 0;
    let levelsCleared = 0;
    const isBuy = sandboxDirection === 'BUY';

    if (isBuy) {
      const newAsks = sandboxAsks.map((a) => ({ ...a }));
      const bestAsk = newAsks[0]?.price || 68500.10;

      for (let i = 0; i < newAsks.length && remainingQty > 0; i++) {
        const take = Math.min(newAsks[i].qty, remainingQty);
        filledValue += take * newAsks[i].price;
        newAsks[i].qty -= take;
        remainingQty -= take;
        if (newAsks[i].qty <= 0.001) levelsCleared++;
      }

      const activeAsks = newAsks.filter((a) => a.qty > 0.001);
      const newBestAsk = activeAsks[0]?.price || bestAsk + 5;
      const vwap = filledValue / (sandboxImpactSize - remainingQty || 1);
      const slippageBps = ((vwap - bestAsk) / bestAsk) * 10000;
      const bestBid = sandboxBids[0]?.price || 68499.90;
      const spread = newBestAsk - bestBid;

      setSandboxAsks(activeAsks);
      setSandboxResult({
        direction: 'BUY',
        size: sandboxImpactSize,
        vwap,
        slippageBps,
        levelsCleared,
        spread,
        recoveringPct: 20
      });
    } else {
      const newBids = sandboxBids.map((b) => ({ ...b }));
      const bestBid = newBids[0]?.price || 68499.90;

      for (let i = 0; i < newBids.length && remainingQty > 0; i++) {
        const take = Math.min(newBids[i].qty, remainingQty);
        filledValue += take * newBids[i].price;
        newBids[i].qty -= take;
        remainingQty -= take;
        if (newBids[i].qty <= 0.001) levelsCleared++;
      }

      const activeBids = newBids.filter((b) => b.qty > 0.001);
      const newBestBid = activeBids[0]?.price || bestBid - 5;
      const vwap = filledValue / (sandboxImpactSize - remainingQty || 1);
      const slippageBps = ((bestBid - vwap) / bestBid) * 10000;
      const bestAsk = sandboxAsks[0]?.price || 68500.10;
      const spread = bestAsk - newBestBid;

      setSandboxBids(activeBids);
      setSandboxResult({
        direction: 'SELL',
        size: sandboxImpactSize,
        vwap,
        slippageBps,
        levelsCleared,
        spread,
        recoveringPct: 20
      });
    }

    // Exponential liquidity recovery simulation (Hawkes decay)
    let step = 1;
    recoveryTimerRef.current = setInterval(() => {
      step++;
      const pct = Math.min(100, 20 + step * 14);
      setSandboxResult((prev) => prev ? { ...prev, recoveringPct: pct } : null);

      if (step >= 6) {
        clearInterval(recoveryTimerRef.current);
        setSandboxAsks(DEFAULT_SANDBOX_ASKS);
        setSandboxBids(DEFAULT_SANDBOX_BIDS);
        setSandboxResult((prev) => prev ? { ...prev, recoveringPct: 100 } : null);
      }
    }, 280);
  };

  const resetSandbox = () => {
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    setSandboxAsks(DEFAULT_SANDBOX_ASKS);
    setSandboxBids(DEFAULT_SANDBOX_BIDS);
    setSandboxResult(null);
  };

  const isStreaming = isLiveActive || isSimulatedActive;
  const bids = isStreaming ? (ladder?.bids || []) : sandboxBids;
  const asks = isStreaming ? (ladder?.asks || []) : sandboxAsks;
  const maxQty = Math.max(1, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty));

  const sandboxBestBid = sandboxBids[0]?.price || 68499.90;
  const sandboxBestAsk = sandboxAsks[0]?.price || 68500.10;
  const sandboxSpread = sandboxBestAsk - sandboxBestBid;
  const sandboxSpreadBps = (sandboxSpread / sandboxBestAsk) * 10000;
  const sandboxMid = (sandboxBestBid + sandboxBestAsk) / 2;
  const sandboxMicroprice = (sandboxBestBid * (sandboxAsks[0]?.qty || 1) + sandboxBestAsk * (sandboxBids[0]?.qty || 1)) / ((sandboxAsks[0]?.qty || 1) + (sandboxBids[0]?.qty || 1));
  const sandboxTop5BidDepth = sandboxBids.slice(0, 5).reduce((a, b) => a + b.qty, 0);
  const sandboxTop5AskDepth = sandboxAsks.slice(0, 5).reduce((a, b) => a + b.qty, 0);
  const sandboxImbalance = (sandboxTop5BidDepth - sandboxTop5AskDepth) / (sandboxTop5BidDepth + sandboxTop5AskDepth || 1);

  const metrics = isStreaming ? ladder?.metrics : {
    is_valid: true,
    best_bid: sandboxBestBid,
    best_ask: sandboxBestAsk,
    spread: sandboxSpread,
    spread_bps: sandboxSpreadBps,
    mid_price: sandboxMid,
    microprice: sandboxMicroprice,
    book_imbalance: sandboxImbalance,
    depth_imbalance: sandboxImbalance
  };

  const dataStatus: DataSourceStatus = isStreaming 
    ? (ladder?.data_status || obStatus?.data_status || 'UNAVAILABLE') 
    : 'SIMULATED';

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

          {!isStreaming && (
            <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-highlight)', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Zap size={13} /> COUNTERFACTUAL IMPACT SANDBOX (盘口冲击沙盒)
                </span>
                <button
                  onClick={resetSandbox}
                  style={{ background: 'transparent', color: 'var(--text-dim)', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}
                >
                  <RotateCcw size={11} /> Reset Book
                </button>
              </div>

              {/* Fire Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    onClick={() => setSandboxDirection('BUY')}
                    style={{
                      background: sandboxDirection === 'BUY' ? 'rgba(0, 229, 255, 0.25)' : 'var(--bg-card)',
                      color: sandboxDirection === 'BUY' ? '#00e5ff' : 'var(--text-dim)',
                      border: `1px solid ${sandboxDirection === 'BUY' ? '#00e5ff' : 'var(--border-color)'}`,
                      padding: '4px 8px',
                      borderRadius: '3px 0 0 3px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    BUY (+)
                  </button>
                  <button
                    onClick={() => setSandboxDirection('SELL')}
                    style={{
                      background: sandboxDirection === 'SELL' ? 'rgba(255, 145, 0, 0.25)' : 'var(--bg-card)',
                      color: sandboxDirection === 'SELL' ? '#ff9100' : 'var(--text-dim)',
                      border: `1px solid ${sandboxDirection === 'SELL' ? '#ff9100' : 'var(--border-color)'}`,
                      padding: '4px 8px',
                      borderRadius: '0 3px 3px 0',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    SELL (-)
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {[5, 15, 25, 50].map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setSandboxImpactSize(sz)}
                      style={{
                        background: sandboxImpactSize === sz ? 'rgba(255, 215, 0, 0.2)' : 'var(--bg-card)',
                        border: `1px solid ${sandboxImpactSize === sz ? 'var(--color-gold)' : 'var(--border-color)'}`,
                        color: sandboxImpactSize === sz ? 'var(--color-gold)' : 'var(--text-dim)',
                        padding: '4px 7px',
                        borderRadius: '3px',
                        fontSize: '0.70rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {sz} BTC
                    </button>
                  ))}
                </div>

                <button
                  onClick={fireSandboxImpact}
                  style={{
                    marginLeft: 'auto',
                    background: sandboxDirection === 'BUY' ? '#00e5ff' : '#ff9100',
                    color: '#080b10',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Play size={12} fill="#080b10" /> FIRE IMPACT
                </button>
              </div>

              {/* Dynamic Impact Readout Banner */}
              {sandboxResult && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    Filled: <strong style={{ color: sandboxResult.direction === 'BUY' ? '#00e5ff' : '#ff9100' }}>{sandboxResult.size} BTC @ ${sandboxResult.vwap.toFixed(2)}</strong> &bull; Slippage: <strong>+{sandboxResult.slippageBps.toFixed(2)} bps</strong> &bull; Cleared: <strong>{sandboxResult.levelsCleared} levels</strong>
                  </div>
                  <div style={{ color: 'var(--color-gold)', fontWeight: 600 }}>
                    {sandboxResult.recoveringPct < 100 ? `⚡ Resiliency Recovery: ${sandboxResult.recoveringPct}%` : `✓ Fully Restored`}
                  </div>
                </div>
              )}
            </div>
          )}

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
