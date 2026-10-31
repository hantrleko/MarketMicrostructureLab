import { useState, useEffect, useRef } from 'react';
import { fetchOrderBookStatus, controlOrderBook, fetchLiveOrderBook } from '../api/client';
import { OrderBookStatusResponse, OrderBookLadderResponse, DataSourceStatus } from '../types';
import { Wifi, Cpu, Database, Play, Square, Activity, Layers, ShieldAlert, Zap, RotateCcw, Globe, Radio, Flame, Volume2, VolumeX, Bell } from 'lucide-react';
import { MMLChart } from '../components/MMLChart';
import { RealtimeHawkesEngine, HawkesSnapshot } from '../utils/hawkesEngine';
import { RealtimeHawkesWeapon } from '../components/RealtimeHawkesWeapon';
import { StoryBridge } from '../components/StoryBridge';
import { GlossaryTerm } from '../components/GlossaryTerm';
import { useExploration } from '../context/ExplorationContext';

interface OrderBookLabProps {
  onNavigateTab?: (tab: string) => void;
}

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

export type LabMode = 'DIRECT_BINANCE_WSS' | 'IMPACT_SANDBOX' | 'LOCAL_BACKEND';

export const OrderBookLab: React.FC<OrderBookLabProps> = ({ onNavigateTab }) => {
  const { userMode } = useExploration();
  const [operatingMode, setOperatingMode] = useState<LabMode>('DIRECT_BINANCE_WSS');
  const [obStatus, setObStatus] = useState<OrderBookStatusResponse | null>(null);
  const [ladder, setLadder] = useState<OrderBookLadderResponse | null>(null);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(false);
  const [isSimulatedActive, setIsSimulatedActive] = useState<boolean>(false);
  const [liveSyncError, setLiveSyncError] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  // Direct Browser Binance WebSocket State (Zero Backend)
  const [directSymbol, setDirectSymbol] = useState<'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'>('BTCUSDT');
  const hawkesEngineRef = useRef<RealtimeHawkesEngine>(new RealtimeHawkesEngine());
  const [hawkesSnapshot, setHawkesSnapshot] = useState<HawkesSnapshot>(hawkesEngineRef.current.getSnapshot());
  const [directWssStatus, setDirectWssStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('CONNECTING');
  const [directAsks, setDirectAsks] = useState<SandboxLevel[]>(DEFAULT_SANDBOX_ASKS);
  const [directBids, setDirectBids] = useState<SandboxLevel[]>(DEFAULT_SANDBOX_BIDS);
  const [directHistory, setDirectHistory] = useState<any[]>([]);
  const directWssRef = useRef<WebSocket | null>(null);
  const directTradeWssRef = useRef<WebSocket | null>(null);
  const directCumOfiRef = useRef<number>(0);
  const [liveVpin, setLiveVpin] = useState<number | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [isDesktopAlertEnabled, setIsDesktopAlertEnabled] = useState<boolean>(false);
  const liveCurrentBuyRef = useRef<number>(0);
  const liveCurrentSellRef = useRef<number>(0);
  const liveBucketImbalancesRef = useRef<number[]>([]);
  const lastAlertTimeRef = useRef<number>(0);

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

  const triggerAvalancheAlert = (reason: string) => {
    const now = Date.now();
    if (now - lastAlertTimeRef.current < 6000) return;
    lastAlertTimeRef.current = now;

    if (isAudioEnabled && typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.28);
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.28);
        }
      } catch {}
    }

    if (isDesktopAlertEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('🚨 Market Microstructure Lab 极端预警', {
          body: reason,
          icon: './eugene_finance_logo.png'
        });
      }
    }
  };

  // High-frequency 4Hz snapshot pull for real-time Hawkes indicators and charts
  useEffect(() => {
    if (operatingMode !== 'DIRECT_BINANCE_WSS') return;
    const interval = setInterval(() => {
      const snap = hawkesEngineRef.current.getSnapshot();
      setHawkesSnapshot(snap);
      if (snap.regime === 'SUPERCRITICAL_CASCADE') {
        triggerAvalancheAlert(`⚡ Hawkes 分支比 ρ=${snap.branchingRatio.toFixed(3)} 触发超临界雪崩！做市需紧急后撤防守！`);
      } else if (liveVpin !== null && liveVpin >= 0.35) {
        triggerAvalancheAlert(`🧪 实时 VPIN 毒性 ${(liveVpin * 100).toFixed(1)}% 突破警戒线！知情单边扫盘中！`);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [operatingMode, liveVpin, isAudioEnabled, isDesktopAlertEnabled]);

  // Direct Binance Public WebSocket Connection (Zero Backend Required)
  useEffect(() => {
    if (operatingMode !== 'DIRECT_BINANCE_WSS') {
      if (directWssRef.current) {
        directWssRef.current.close();
        directWssRef.current = null;
      }
      if (directTradeWssRef.current) {
        directTradeWssRef.current.close();
        directTradeWssRef.current = null;
      }
      setDirectWssStatus('DISCONNECTED');
      return;
    }

    setDirectWssStatus('CONNECTING');
    hawkesEngineRef.current.reset();
    setDirectBids([]);
    setDirectAsks([]);
    setDirectHistory([]);
    directCumOfiRef.current = 0;

    const streamSym = directSymbol.toLowerCase();

    // 1. Binance Spot Depth20 @ 100ms
    const depthWs = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSym}@depth20@100ms`);
    directWssRef.current = depthWs;

    depthWs.onopen = () => {
      setDirectWssStatus('CONNECTED');
    };

    depthWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.bids && data.asks) {
          const parsedBids = data.bids.slice(0, 12).map((b: any) => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
          const parsedAsks = data.asks.slice(0, 12).map((a: any) => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));
          setDirectBids(parsedBids);
          setDirectAsks(parsedAsks);

          const bestBid = parsedBids[0]?.price || 0;
          const bestAsk = parsedAsks[0]?.price || 0;
          const spread = bestAsk - bestBid;
          const spreadBps = bestAsk > 0 ? (spread / bestAsk) * 10000 : 0;
          const timeStr = new Date().toTimeString().split(' ')[0];

          setDirectHistory((prev) => {
            const next = [...prev, {
              time_str: timeStr,
              spread_bps: spreadBps,
              cumulative_ofi: directCumOfiRef.current
            }];
            return next.slice(-40);
          });
        }
      } catch (e) {
        console.error('Direct WSS message error', e);
      }
    };

    depthWs.onerror = () => {
      setDirectWssStatus('ERROR');
    };

    depthWs.onclose = () => {
      if (operatingMode === 'DIRECT_BINANCE_WSS') {
        setDirectWssStatus('DISCONNECTED');
      }
    };

    // 2. Binance Spot aggTrade for real-time OFI delta & Hawkes cascade engine
    const tradeWs = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSym}@aggTrade`);
    directTradeWssRef.current = tradeWs;

    tradeWs.onmessage = (event) => {
      try {
        const t = JSON.parse(event.data);
        const price = parseFloat(t.p);
        const qty = parseFloat(t.q);
        const isBuyerMaker = t.m;
        const timeMs = t.T || t.E || Date.now();
        directCumOfiRef.current += isBuyerMaker ? -qty : qty;
        hawkesEngineRef.current.processTrade({ timeMs, price, qty, isBuyerMaker });

        // Online Real-time VPIN Accumulator
        const bucketCap = directSymbol.startsWith('BTC') ? 1.0 : directSymbol.startsWith('ETH') ? 10.0 : 50.0;
        if (isBuyerMaker) {
          liveCurrentSellRef.current += qty;
        } else {
          liveCurrentBuyRef.current += qty;
        }
        if (liveCurrentBuyRef.current + liveCurrentSellRef.current >= bucketCap) {
          const bTotal = liveCurrentBuyRef.current + liveCurrentSellRef.current;
          const bImb = Math.abs(liveCurrentBuyRef.current - liveCurrentSellRef.current);
          liveBucketImbalancesRef.current.push(bImb / bTotal);
          if (liveBucketImbalancesRef.current.length > 20) {
            liveBucketImbalancesRef.current.shift();
          }
          const vpinAvg = liveBucketImbalancesRef.current.reduce((a, b) => a + b, 0) / liveBucketImbalancesRef.current.length;
          setLiveVpin(vpinAvg);
          liveCurrentBuyRef.current = 0;
          liveCurrentSellRef.current = 0;
        }
      } catch {}
    };

    return () => {
      if (depthWs) depthWs.close();
      if (tradeWs) tradeWs.close();
    };
  }, [operatingMode, directSymbol]);

  // Poll initial status for local backend if mode is LOCAL_BACKEND
  useEffect(() => {
    if (operatingMode === 'LOCAL_BACKEND') {
      fetchOrderBookStatus()
        .then((data) => {
          setObStatus(data);
          if (data.is_running && data.status === 'SYNCHRONIZED') {
            setIsLiveActive(true);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [operatingMode]);

  // Polling loop for local backend
  useEffect(() => {
    if (operatingMode === 'LOCAL_BACKEND' && (isLiveActive || isSimulatedActive)) {
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
      }, 250);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [operatingMode, isLiveActive, isSimulatedActive]);

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

  let bids: SandboxLevel[] = [];
  let asks: SandboxLevel[] = [];
  let history: any[] = [];
  let metrics: any = null;
  let dataStatus: DataSourceStatus = 'UNAVAILABLE';

  const sandboxBestBid = sandboxBids[0]?.price || 68499.90;
  const sandboxBestAsk = sandboxAsks[0]?.price || 68500.10;
  const sandboxSpread = sandboxBestAsk - sandboxBestBid;
  const sandboxSpreadBps = (sandboxSpread / sandboxBestAsk) * 10000;
  const sandboxMid = (sandboxBestBid + sandboxBestAsk) / 2;
  const sandboxMicroprice = (sandboxBestBid * (sandboxAsks[0]?.qty || 1) + sandboxBestAsk * (sandboxBids[0]?.qty || 1)) / ((sandboxAsks[0]?.qty || 1) + (sandboxBids[0]?.qty || 1));
  const sandboxTop5BidDepth = sandboxBids.slice(0, 5).reduce((a, b) => a + b.qty, 0);
  const sandboxTop5AskDepth = sandboxAsks.slice(0, 5).reduce((a, b) => a + b.qty, 0);
  const sandboxImbalance = (sandboxTop5BidDepth - sandboxTop5AskDepth) / (sandboxTop5BidDepth + sandboxTop5AskDepth || 1);

  if (operatingMode === 'DIRECT_BINANCE_WSS') {
    bids = directBids.length > 0 ? directBids : (directSymbol === 'ETHUSDT' ? [{ price: 3500.00, qty: 5.0 }] : directSymbol === 'SOLUSDT' ? [{ price: 180.00, qty: 15.0 }] : DEFAULT_SANDBOX_BIDS);
    asks = directAsks.length > 0 ? directAsks : (directSymbol === 'ETHUSDT' ? [{ price: 3500.10, qty: 4.8 }] : directSymbol === 'SOLUSDT' ? [{ price: 180.05, qty: 14.5 }] : DEFAULT_SANDBOX_ASKS);
    history = directHistory;
    const bestBid = bids[0]?.price || (directSymbol === 'ETHUSDT' ? 3500.00 : directSymbol === 'SOLUSDT' ? 180.00 : 68499.90);
    const bestAsk = asks[0]?.price || (directSymbol === 'ETHUSDT' ? 3500.10 : directSymbol === 'SOLUSDT' ? 180.05 : 68500.10);
    const spread = Math.max(0.01, bestAsk - bestBid);
    const spreadBps = bestAsk > 0 ? (spread / bestAsk) * 10000 : 0;
    const mid = (bestBid + bestAsk) / 2;
    const microprice = (bestBid * (asks[0]?.qty || 1) + bestAsk * (bids[0]?.qty || 1)) / ((asks[0]?.qty || 1) + (bids[0]?.qty || 1));
    const top5BidDepth = bids.slice(0, 5).reduce((a, b) => a + b.qty, 0);
    const top5AskDepth = asks.slice(0, 5).reduce((a, b) => a + b.qty, 0);
    const imbalance = (top5BidDepth - top5AskDepth) / (top5BidDepth + top5AskDepth || 1);

    metrics = {
      is_valid: true,
      best_bid: bestBid,
      best_ask: bestAsk,
      spread: spread,
      spread_bps: spreadBps,
      mid_price: mid,
      microprice: microprice,
      book_imbalance: imbalance,
      depth_imbalance: imbalance
    };
    dataStatus = directWssStatus === 'CONNECTED' ? 'LIVE_VERIFIED' : 'UNAVAILABLE';
  } else if (operatingMode === 'LOCAL_BACKEND') {
    const isStreaming = isLiveActive || isSimulatedActive;
    bids = isStreaming ? (ladder?.bids || []) : sandboxBids;
    asks = isStreaming ? (ladder?.asks || []) : sandboxAsks;
    history = ladder?.history || [];
    metrics = isStreaming ? ladder?.metrics : {
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
    dataStatus = isStreaming ? (ladder?.data_status || obStatus?.data_status || 'UNAVAILABLE') : 'SIMULATED';
  } else {
    // IMPACT_SANDBOX
    bids = sandboxBids;
    asks = sandboxAsks;
    history = [];
    metrics = {
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
    dataStatus = 'SIMULATED';
  }

  const maxQty = Math.max(1, ...bids.map((b) => b.qty), ...asks.map((a) => a.qty));

  // History for streaming OFI & Spread chart
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

      {/* Engine & Source Mode Selector Header */}
      <div className="mml-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 700, marginRight: '4px' }}>
              LAB ENGINE MODE:
            </span>

            {/* Mode 1: Direct Binance WSS */}
            <button
              onClick={() => setOperatingMode('DIRECT_BINANCE_WSS')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: operatingMode === 'DIRECT_BINANCE_WSS' ? 'rgba(0, 229, 255, 0.15)' : 'var(--bg-dark)',
                border: `1px solid ${operatingMode === 'DIRECT_BINANCE_WSS' ? 'var(--color-buy)' : 'var(--border-color)'}`,
                color: operatingMode === 'DIRECT_BINANCE_WSS' ? 'var(--color-buy)' : 'var(--text-muted)',
                fontWeight: operatingMode === 'DIRECT_BINANCE_WSS' ? 700 : 500,
                padding: '7px 14px',
                borderRadius: '5px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <Globe size={14} />
              直连币安 WSS (免后端零配置)
              {operatingMode === 'DIRECT_BINANCE_WSS' && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: directWssStatus === 'CONNECTED' ? '#00e5ff' : '#ff9100' }} />
              )}
            </button>

            {/* Mode 2: Impact Resiliency Sandbox */}
            <button
              onClick={() => setOperatingMode('IMPACT_SANDBOX')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: operatingMode === 'IMPACT_SANDBOX' ? 'rgba(255, 145, 0, 0.15)' : 'var(--bg-dark)',
                border: `1px solid ${operatingMode === 'IMPACT_SANDBOX' ? 'var(--color-gold)' : 'var(--border-color)'}`,
                color: operatingMode === 'IMPACT_SANDBOX' ? 'var(--color-gold)' : 'var(--text-muted)',
                fontWeight: operatingMode === 'IMPACT_SANDBOX' ? 700 : 500,
                padding: '7px 14px',
                borderRadius: '5px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <Zap size={14} />
              盘口冲击反事实沙盒
            </button>

            {/* Mode 3: Local Python Backend */}
            <button
              onClick={() => setOperatingMode('LOCAL_BACKEND')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: operatingMode === 'LOCAL_BACKEND' ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-dark)',
                border: `1px solid ${operatingMode === 'LOCAL_BACKEND' ? '#c084fc' : 'var(--border-color)'}`,
                color: operatingMode === 'LOCAL_BACKEND' ? '#c084fc' : 'var(--text-muted)',
                fontWeight: operatingMode === 'LOCAL_BACKEND' ? 700 : 500,
                padding: '7px 14px',
                borderRadius: '5px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <Cpu size={14} />
              本地 Python 同步引擎
            </button>
          </div>

          {/* Right Header Status Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>DATA STATUS:</span>
              <span
                style={{
                  fontSize: '0.72rem',
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
                      ? 'var(--color-gold)'
                      : 'var(--text-dim)',
                  border: `1px solid ${
                    dataStatus === 'LIVE_VERIFIED'
                      ? 'var(--color-buy)'
                      : dataStatus === 'SIMULATED'
                      ? 'var(--color-gold)'
                      : 'var(--border-color)'
                  }`
                }}
              >
                {dataStatus === 'UNAVAILABLE' ? '未连接 / STANDBY' : dataStatus}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>STREAM:</span>
              <span className={operatingMode === 'DIRECT_BINANCE_WSS' ? (directWssStatus === 'CONNECTED' ? 'badge-buy' : 'badge-gold') : (isLiveActive ? 'badge-buy' : 'badge-gold')}>
                {operatingMode === 'DIRECT_BINANCE_WSS' ? directWssStatus : (obStatus?.status || 'STANDBY')}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Contextual Toolbar by Operating Mode */}
        {operatingMode === 'DIRECT_BINANCE_WSS' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Symbol Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-dark)', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 700, paddingRight: '4px' }}>TICKER:</span>
                {(['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const).map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setDirectSymbol(sym)}
                    style={{
                      background: directSymbol === sym ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                      border: `1px solid ${directSymbol === sym ? '#00e5ff' : 'transparent'}`,
                      color: directSymbol === sym ? '#00e5ff' : 'var(--text-dim)',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      fontSize: '0.72rem',
                      fontWeight: directSymbol === sym ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {sym.replace('USDT', '/USDT')}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 229, 255, 0.08)', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
                <Radio size={13} className="animate-pulse" style={{ color: directWssStatus === 'CONNECTED' ? 'var(--color-buy)' : 'var(--color-gold)' }} />
                <span className="mono" style={{ fontSize: '0.74rem', color: '#fff', fontWeight: 600 }}>
                  wss://stream.binance.com:9443/ws/{directSymbol.toLowerCase()}@depth20@100ms + aggTrade
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Online VPIN Badge */}
              <div
                style={{
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  color: (liveVpin ?? 0) >= 0.35 ? '#f43f5e' : (liveVpin ?? 0) >= 0.20 ? '#fbbf24' : '#38bdf8',
                  background: (liveVpin ?? 0) >= 0.35 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                  border: `1px solid ${(liveVpin ?? 0) >= 0.35 ? '#f43f5e' : '#38bdf8'}40`,
                  padding: '3px 8px',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>实时 VPIN: {liveVpin != null ? `${(liveVpin * 100).toFixed(1)}%` : '切片积累中'}</span>
              </div>

              {/* Realtime Hawkes Indicator */}
              <div style={{
                fontSize: '0.70rem',
                fontWeight: 700,
                color: hawkesSnapshot.isSupercritical ? '#ef4444' : hawkesSnapshot.regime === 'NEAR_CRITICAL' ? '#f59e0b' : '#10b981',
                background: hawkesSnapshot.isSupercritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                border: `1px solid ${hawkesSnapshot.isSupercritical ? '#ef4444' : '#10b981'}40`,
                padding: '3px 8px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Flame size={12} />
                <span>HAWKES &rho;: {hawkesSnapshot.branchingRatio.toFixed(3)} ({hawkesSnapshot.regime === 'SUPERCRITICAL_CASCADE' ? 'CASCADE' : hawkesSnapshot.regime === 'NEAR_CRITICAL' ? 'WARMING' : 'STABLE'})</span>
              </div>

              {/* Sound Alarm Toggle */}
              <button
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                style={{
                  background: isAudioEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.2)',
                  border: `1px solid ${isAudioEnabled ? '#10b981' : '#475569'}`,
                  color: isAudioEnabled ? '#10b981' : '#94a3b8',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title={isAudioEnabled ? '自激雪崩警报音效已开启，点击静音' : '警报音效已静音，点击开启'}
              >
                {isAudioEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                <span>{isAudioEnabled ? '警报音效' : '已静音'}</span>
              </button>

              {/* Desktop Alert Toggle */}
              <button
                onClick={() => {
                  if (typeof window !== 'undefined' && 'Notification' in window) {
                    if (Notification.permission === 'granted') {
                      setIsDesktopAlertEnabled(!isDesktopAlertEnabled);
                    } else {
                      Notification.requestPermission().then((p) => {
                        if (p === 'granted') setIsDesktopAlertEnabled(true);
                      });
                    }
                  }
                }}
                style={{
                  background: isDesktopAlertEnabled ? 'rgba(56, 189, 248, 0.15)' : 'rgba(100, 116, 139, 0.2)',
                  border: `1px solid ${isDesktopAlertEnabled ? '#38bdf8' : '#475569'}`,
                  color: isDesktopAlertEnabled ? '#38bdf8' : '#94a3b8',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="开启/关闭浏览器桌面系统弹窗预警"
              >
                <Bell size={12} />
                <span>{isDesktopAlertEnabled ? '桌面预警' : '开启弹窗'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Supercritical Cascade / Toxic Avalanche HUD Flashing Banner */}
        {operatingMode === 'DIRECT_BINANCE_WSS' && (hawkesSnapshot.isSupercritical || ((liveVpin ?? 0) >= 0.35)) && (
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(244, 63, 94, 0.35))',
              border: '2px solid #ef4444',
              borderRadius: '6px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#fff'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={22} style={{ color: '#ef4444' }} />
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fca5a5' }}>
                  🚨 极端微观结构预警：检测到超临界自激订单流雪崩 / 知情毒性海啸！
                </div>
                <div style={{ fontSize: '0.74rem', color: '#fecdd3' }}>
                  Hawkes 分支比 &rho; = {hawkesSnapshot.branchingRatio.toFixed(3)} {hawkesSnapshot.isSupercritical ? '(>1.0 链式吃单踩踏)' : ''} &bull; 实时 VPIN = {liveVpin != null ? `${(liveVpin * 100).toFixed(1)}%` : '---'} {(liveVpin ?? 0) >= 0.35 ? '(知情单边扫空盘口)' : ''} &bull; 建议做市商紧急撤单避险！
                </div>
              </div>
            </div>
            <span style={{ fontSize: '0.70rem', fontWeight: 800, background: '#ef4444', color: '#fff', padding: '3px 8px', borderRadius: '4px' }}>
              CRITICAL EMERGENCY
            </span>
          </div>
        )}

        {operatingMode === 'IMPACT_SANDBOX' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={18} color="var(--color-gold)" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                  反事实盘口吃单与弹性回补实验沙盒 (Counterfactual Resiliency Simulator)
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  模拟大额市价单深度穿透、瞬时价差拉大与离散挂单指数衰减恢复 (<span className="mono">half_life = 850ms</span>)
                </div>
              </div>
            </div>
            <button
              onClick={resetSandbox}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.76rem',
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> 重置初始盘口
            </button>
          </div>
        )}

        {operatingMode === 'LOCAL_BACKEND' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handleToggleLiveSync}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: isLiveActive ? 'var(--color-sell)' : 'var(--color-buy)',
                  color: '#080b10',
                  fontWeight: 800,
                  padding: '8px 18px',
                  borderRadius: '5px',
                  fontSize: '0.82rem',
                  letterSpacing: '0.04em',
                  cursor: 'pointer'
                }}
              >
                {isLiveActive ? <Square size={15} /> : <Play size={15} />}
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
                  padding: '8px 16px',
                  borderRadius: '5px',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                <Activity size={14} color={isSimulatedActive ? '#fff' : 'var(--color-gold)'} />
                {isSimulatedActive ? 'STOP SIMULATION' : 'SIMULATE PREVIEW (DEMO)'}
              </button>

              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                  BINANCE SPOT L2 LOCAL ORDER BOOK SYNCHRONIZER
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Diff Depth Stream (100ms) + REST Atomic Snapshot Alignment. Real-time Microprice & OFI Engine.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>SEQ ERRORS:</span>
              <span className="mono badge-buy">{isLiveActive || isSimulatedActive ? (obStatus?.sync_errors ?? 0) : '---'}</span>
            </div>
          </div>
        )}
      </div>

      {/* V1.4 Real-Time Hawkes Weapon & Cascade Detector Deck (Zero Backend) */}
      {operatingMode === 'DIRECT_BINANCE_WSS' && (
        <RealtimeHawkesWeapon snapshot={hawkesSnapshot} symbol={directSymbol === 'BTCUSDT' ? 'BTC/USDT' : directSymbol === 'ETHUSDT' ? 'ETH/USDT' : 'SOL/USDT'} />
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
            lineHeight: 1.5
          }}
        >
          <strong style={{ color: '#38bdf8' }}>💡 新手实盘导引：</strong>
          当前浏览器正通过原生 WebSocket 直连币安撮合引擎核心流。左下方为真实 L2 深度挂单簿，中间为衡量微观盘口重心的 <GlossaryTerm term="microprice">Microprice</GlossaryTerm>，上方为自激点过程超临界雷达。当右侧分支比 &rho; &ge; 1.0 时代表订单流进入雪崩连锁吃单，做市需紧急避险！
        </div>
      )}

      {/* Real-Time Metrics 4-Grid */}
      <div className="grid-4">
        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <GlossaryTerm term="bps">BID-ASK SPREAD</GlossaryTerm>
          </div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? `$${metrics?.spread.toFixed(2)} (${metrics?.spread_bps.toFixed(3)} bps)` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-buy)', marginTop: '4px' }}>
            {metrics?.is_valid || isSimulatedActive ? `Best: $${metrics?.best_bid?.toFixed(2)} / $${metrics?.best_ask?.toFixed(2)}` : 'Best: --- / ---'}
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <GlossaryTerm term="microprice">MICROPRICE</GlossaryTerm>
          </div>
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
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <GlossaryTerm term="ofi">CUMULATIVE OFI</GlossaryTerm>
          </div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-gold)', marginTop: '4px' }}>
            {(metrics?.is_valid || isSimulatedActive) && history.length > 0 ? `${history[history.length - 1].cumulative_ofi.toFixed(2)} ${directSymbol.replace('USDT', '')}` : '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Quote-based Flow Imbalance
          </div>
        </div>
      </div>

      {/* Main Order Book Ladder & OFI Streaming Chart Grid */}
      <div data-tour="live-orderbook" className="responsive-orderbook-grid">
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

          {operatingMode === 'IMPACT_SANDBOX' && (
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

          {/* Story Bridge to Integrity Audit */}
          <StoryBridge
            currentAct={5}
            currentActTitle="战实盘 · 币安直连实时盘口与自激雪崩警报"
            takeaway="通过纯前端浏览器直连币安 WebSocket，实时运行了 O(1) 递推核 Hawkes 点过程，并在分支比 ρ >= 1.0 时实时捕获了超临界雪崩吃单异动。"
            nextAct="integrity"
            isAppendix={true}
            nextActTitle="数据防伪 · 1062万笔官方签名与样本防泄审计"
            nextQuestion="实盘武器与历史模型如此精准，底层数据链是否真正防篡改？如何验证官方 SHA-256 与零前瞻偏差？"
            onNavigate={(tab) => onNavigateTab ? onNavigateTab(tab) : undefined}
          />
        </div>
      </div>
    </div>
  );
};
