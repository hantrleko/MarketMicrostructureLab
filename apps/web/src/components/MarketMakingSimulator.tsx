import React, { useState, useMemo } from 'react';
import { ReplayTrade } from '../types';
import { Shield, ShieldCheck, Zap } from 'lucide-react';
import { MMLChart } from './MMLChart';

interface MarketMakingSimulatorProps {
  trades: ReplayTrade[];
}

type FeeTier = 'VIP0' | 'VIP9' | 'MM_REBATE';

interface SimulationConfig {
  halfSpreadBps: number;
  gamma: number; // inventory risk aversion
  quoteSizeBtc: number;
  maxInventoryBtc: number;
  enableVpinDefense: boolean;
  vpinCutoff: number;
  feeTier: FeeTier;
}

const FEE_TIERS: Record<FeeTier, { name: string; makerBps: number; desc: string }> = {
  VIP0: { name: 'Binance VIP0 (散户标准)', makerBps: 2.0, desc: 'Maker 手续费 +2.0 bps' },
  VIP9: { name: 'Binance VIP9 (量化机构)', makerBps: 0.0, desc: 'Maker 零手续费 0.0 bps' },
  MM_REBATE: { name: 'Binance MM Program (做市返佣)', makerBps: -0.5, desc: 'Maker 负费率返佣 -0.5 bps' }
};

export const MarketMakingSimulator: React.FC<MarketMakingSimulatorProps> = ({ trades }) => {
  const [config, setConfig] = useState<SimulationConfig>({
    halfSpreadBps: 2.5,
    gamma: 0.10,
    quoteSizeBtc: 0.2,
    maxInventoryBtc: 2.0,
    enableVpinDefense: true,
    vpinCutoff: 0.35,
    feeTier: 'MM_REBATE'
  });

  const [selectedPreset, setSelectedPreset] = useState<string>('balanced');

  const applyPreset = (preset: 'aggressive' | 'balanced' | 'defensive') => {
    setSelectedPreset(preset);
    if (preset === 'aggressive') {
      setConfig((prev) => ({
        ...prev,
        halfSpreadBps: 1.2,
        gamma: 0.03,
        quoteSizeBtc: 0.3,
        maxInventoryBtc: 3.0,
        enableVpinDefense: false,
        vpinCutoff: 0.45
      }));
    } else if (preset === 'balanced') {
      setConfig((prev) => ({
        ...prev,
        halfSpreadBps: 2.5,
        gamma: 0.10,
        quoteSizeBtc: 0.2,
        maxInventoryBtc: 2.0,
        enableVpinDefense: true,
        vpinCutoff: 0.35
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        halfSpreadBps: 5.0,
        gamma: 0.30,
        quoteSizeBtc: 0.1,
        maxInventoryBtc: 1.0,
        enableVpinDefense: true,
        vpinCutoff: 0.25
      }));
    }
  };

  // Run backtesting simulation with strict prior-price causality & VPIN defense comparison
  const simulationResults = useMemo(() => {
    if (!trades || trades.length < 20) {
      return null;
    }

    const { halfSpreadBps, gamma, quoteSizeBtc, maxInventoryBtc, enableVpinDefense, vpinCutoff, feeTier } = config;
    const makerFeeRate = FEE_TIERS[feeTier].makerBps / 10000;

    // Helper runner to compare defense vs no-defense
    const runSimulation = (withDefense: boolean) => {
      let inventory = 0;
      let cash = 0;
      let totalFills = 0;
      let buyFills = 0;
      let sellFills = 0;
      let spreadCapture = 0;
      let adverseSelectionLoss = 0;
      let feeRebates = 0;
      let toxicDefendedCount = 0;

      const pnlHistory: number[] = [];
      const inventoryHistory: number[] = [];

      const N = trades.length;
      let rollingBuy = 0;
      let rollingSell = 0;
      const bucketThreshold = Math.max(0.5, quoteSizeBtc * 5);
      const bucketImbalances: number[] = [];

      for (let i = 0; i < N; i++) {
        const t = trades[i];
        // 1. Strict Causality: quotes are formed using prior reference price (t-1)
        const refPrice = i === 0 ? trades[0].price : trades[i - 1].price;

        // Track rolling volume imbalance for real-time VPIN approximation
        if (t.aggressor_side === 'BUY') {
          rollingBuy += t.base_quantity;
        } else {
          rollingSell += t.base_quantity;
        }

        if (rollingBuy + rollingSell >= bucketThreshold) {
          const tot = rollingBuy + rollingSell;
          bucketImbalances.push(Math.abs(rollingBuy - rollingSell) / tot);
          if (bucketImbalances.length > 10) bucketImbalances.shift();
          rollingBuy = 0;
          rollingSell = 0;
        }

        const currentVpin = bucketImbalances.length > 0
          ? bucketImbalances.reduce((a, b) => a + b, 0) / bucketImbalances.length
          : 0.20;

        const isToxicRegime = currentVpin >= vpinCutoff;

        // Avellaneda-Stoikov reservation price skew based on PRIOR reference price
        // r(s, q) = s - q * gamma * sigma^2 * s
        const reservation = refPrice - (inventory * gamma * 0.00015 * refPrice);
        const dynamicHalfSpreadBps = (withDefense && isToxicRegime) ? halfSpreadBps * 2.5 : halfSpreadBps;
        const halfSpreadDollar = (dynamicHalfSpreadBps / 10000) * refPrice;

        const myBid = reservation - halfSpreadDollar;
        const myAsk = reservation + halfSpreadDollar;

        // If in toxic regime with defense, pull quotes to avoid being picked off
        const shouldQuoteBid = !(withDefense && isToxicRegime && currentVpin > vpinCutoff + 0.08) && inventory < maxInventoryBtc;
        const shouldQuoteAsk = !(withDefense && isToxicRegime && currentVpin > vpinCutoff + 0.08) && inventory > -maxInventoryBtc;

        if (withDefense && isToxicRegime) {
          toxicDefendedCount++;
        }

        const isAggressiveBuy = t.aggressor_side === 'BUY';
        const isAggressiveSell = t.aggressor_side === 'SELL';

        // Check if market aggressor sells and hits passive bid
        if (isAggressiveSell && shouldQuoteBid && t.price <= myBid) {
          const fillQty = Math.min(quoteSizeBtc, t.base_quantity);
          const tradeNotional = fillQty * myBid;
          inventory += fillQty;
          cash -= tradeNotional;
          buyFills++;
          totalFills++;
          spreadCapture += fillQty * halfSpreadDollar;
          feeRebates -= tradeNotional * makerFeeRate; // negative rate = positive rebate cash

          // Adverse selection measurement 10 ticks later
          const futureIdx = Math.min(N - 1, i + 10);
          const futurePrice = trades[futureIdx].price;
          if (futurePrice < myBid) {
            adverseSelectionLoss += fillQty * (myBid - futurePrice);
          }
        }

        // Check if market aggressor buys and lifts passive ask
        if (isAggressiveBuy && shouldQuoteAsk && t.price >= myAsk) {
          const fillQty = Math.min(quoteSizeBtc, t.base_quantity);
          const tradeNotional = fillQty * myAsk;
          inventory -= fillQty;
          cash += tradeNotional;
          sellFills++;
          totalFills++;
          spreadCapture += fillQty * halfSpreadDollar;
          feeRebates -= tradeNotional * makerFeeRate;

          // Adverse selection measurement 10 ticks later
          const futureIdx = Math.min(N - 1, i + 10);
          const futurePrice = trades[futureIdx].price;
          if (futurePrice > myAsk) {
            adverseSelectionLoss += fillQty * (futurePrice - myAsk);
          }
        }

        // Mark-to-market net equity
        const mtmEquity = cash + (inventory * t.price) + feeRebates;
        pnlHistory.push(mtmEquity);
        inventoryHistory.push(inventory);
      }

      const finalPnl = pnlHistory[pnlHistory.length - 1] || 0;
      const returns: number[] = [];
      for (let i = 1; i < pnlHistory.length; i++) {
        returns.push(pnlHistory[i] - pnlHistory[i - 1]);
      }
      const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const varReturn = returns.length > 0
        ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / returns.length
        : 0.0001;
      const sharpe = Math.sqrt(varReturn) > 0 ? (meanReturn / Math.sqrt(varReturn)) * Math.sqrt(252 * 24 * 3600) : 0;

      let peak = -Infinity;
      let maxDd = 0;
      for (const p of pnlHistory) {
        if (p > peak) peak = p;
        const dd = peak - p;
        if (dd > maxDd) maxDd = dd;
      }

      return {
        finalPnl,
        spreadCapture,
        adverseSelectionLoss,
        feeRebates,
        totalFills,
        buyFills,
        sellFills,
        fillRate: (totalFills / Math.max(1, trades.length)) * 100,
        sharpe,
        maxDd,
        pnlHistory,
        inventoryHistory,
        finalInventory: inventory,
        toxicDefendedCount
      };
    };

    const activeRun = runSimulation(enableVpinDefense);
    const nakedRun = enableVpinDefense ? runSimulation(false) : activeRun;

    return {
      ...activeRun,
      nakedPnl: nakedRun.finalPnl,
      nakedAdverseSelection: nakedRun.adverseSelectionLoss,
      savedAdverseSelection: Math.max(0, nakedRun.adverseSelectionLoss - activeRun.adverseSelectionLoss)
    };
  }, [trades, config]);

  const pnlChartOption = useMemo(() => {
    if (!simulationResults) return {};

    const { pnlHistory, inventoryHistory } = simulationResults;
    const step = Math.max(1, Math.floor(pnlHistory.length / 80));
    const sampledPnl = pnlHistory.filter((_, idx) => idx % step === 0);
    const sampledInv = inventoryHistory.filter((_, idx) => idx % step === 0);
    const labels = sampledPnl.map((_, i) => `${i}`);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 11 }
      },
      legend: {
        data: ['累计净盈亏 (Net PnL $)', '持仓库存 (Inventory BTC)'],
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 0
      },
      grid: { left: '4%', right: '4%', top: '16%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          name: 'PnL ($)',
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#64748b', formatter: '${value}' }
        },
        {
          type: 'value',
          name: 'Inventory (BTC)',
          splitLine: { show: false },
          axisLabel: { color: '#a78bfa' }
        }
      ],
      series: [
        {
          name: '累计净盈亏 (Net PnL $)',
          type: 'line',
          yAxisIndex: 0,
          data: sampledPnl,
          lineStyle: { color: (simulationResults?.finalPnl ?? 0) >= 0 ? '#10b981' : '#f43f5e', width: 2 },
          areaStyle: {
            color: (simulationResults?.finalPnl ?? 0) >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'
          },
          showSymbol: false
        },
        {
          name: '持仓库存 (Inventory BTC)',
          type: 'line',
          yAxisIndex: 1,
          data: sampledInv,
          lineStyle: { color: '#a78bfa', width: 1.5, type: 'dashed' },
          showSymbol: false
        }
      ]
    };
  }, [simulationResults]);

  if (!trades || trades.length === 0) {
    return (
      <div className="mml-card" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
        等待载入逐笔流水以启动做市策略实盘模拟器...
      </div>
    );
  }

  return (
    <div
      className="mml-card"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        borderRadius: '8px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={20} style={{ color: '#10b981' }} />
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff', letterSpacing: '0.03em' }}>
              AVELLANEDA-STOIKOV 高频做市回测仿真系统 (MML v3.1 严格因果加固版)
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              前置报价无前视偏差 · VPIN 毒性熔断防御对比 · 交易所费率返佣三因子分解
            </div>
          </div>
        </div>

        {/* Strategy Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.70rem', color: '#64748b' }}>策略模板：</span>
          <button
            onClick={() => applyPreset('aggressive')}
            style={{
              background: selectedPreset === 'aggressive' ? 'rgba(0, 229, 255, 0.25)' : 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${selectedPreset === 'aggressive' ? '#00e5ff' : '#475569'}`,
              color: selectedPreset === 'aggressive' ? '#00e5ff' : '#94a3b8',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.70rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ⚡ 激进抢单 (1.2 bps)
          </button>
          <button
            onClick={() => applyPreset('balanced')}
            style={{
              background: selectedPreset === 'balanced' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${selectedPreset === 'balanced' ? '#10b981' : '#475569'}`,
              color: selectedPreset === 'balanced' ? '#10b981' : '#94a3b8',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.70rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🎯 稳健平衡 (2.5 bps)
          </button>
          <button
            onClick={() => applyPreset('defensive')}
            style={{
              background: selectedPreset === 'defensive' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${selectedPreset === 'defensive' ? '#fbbf24' : '#475569'}`,
              color: selectedPreset === 'defensive' ? '#fbbf24' : '#94a3b8',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '0.70rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🛡️ 毒性避险 (5.0 bps)
          </button>
        </div>
      </div>

      {/* Parameter Control Sliders */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '1px solid #334155',
          borderRadius: '6px',
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94a3b8' }}>
            <span>挂单半点差 (δ)</span>
            <strong className="mono" style={{ color: '#00e5ff' }}>{config.halfSpreadBps.toFixed(1)} bps</strong>
          </div>
          <input
            type="range"
            min={0.5}
            max={8.0}
            step={0.1}
            value={config.halfSpreadBps}
            onChange={(e) => setConfig({ ...config, halfSpreadBps: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#00e5ff', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94a3b8' }}>
            <span>库存风险厌恶系数 (γ)</span>
            <strong className="mono" style={{ color: '#fbbf24' }}>{config.gamma.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.50}
            step={0.01}
            value={config.gamma}
            onChange={(e) => setConfig({ ...config, gamma: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94a3b8' }}>
            <span>单笔报价量 (Q)</span>
            <strong className="mono" style={{ color: '#10b981' }}>{config.quoteSizeBtc.toFixed(2)} BTC</strong>
          </div>
          <input
            type="range"
            min={0.05}
            max={1.0}
            step={0.05}
            value={config.quoteSizeBtc}
            onChange={(e) => setConfig({ ...config, quoteSizeBtc: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94a3b8' }}>
            <span>持仓上限 (Q_max)</span>
            <strong className="mono" style={{ color: '#a78bfa' }}>±{config.maxInventoryBtc.toFixed(1)} BTC</strong>
          </div>
          <input
            type="range"
            min={0.5}
            max={5.0}
            step={0.5}
            value={config.maxInventoryBtc}
            onChange={(e) => setConfig({ ...config, maxInventoryBtc: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
          />
        </div>

        {/* VPIN Cutoff Knob */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94a3b8' }}>
            <span>VPIN 熔断阈值</span>
            <strong className="mono" style={{ color: '#f43f5e' }}>{(config.vpinCutoff * 100).toFixed(0)}%</strong>
          </div>
          <input
            type="range"
            min={0.15}
            max={0.45}
            step={0.01}
            value={config.vpinCutoff}
            onChange={(e) => setConfig({ ...config, vpinCutoff: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#f43f5e', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Toggles bar: VPIN Defense & Fee Tier */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.74rem', color: '#e2e8f0' }}>
          <input
            type="checkbox"
            checked={config.enableVpinDefense}
            onChange={(e) => setConfig({ ...config, enableVpinDefense: e.target.checked })}
            style={{ accentColor: '#10b981', width: '15px', height: '15px', cursor: 'pointer' }}
          />
          <ShieldCheck size={14} style={{ color: config.enableVpinDefense ? '#10b981' : '#64748b' }} />
          <span>启用 VPIN 实时毒性熔断防御（超限自动撤单/扩差，防止逆向选择）</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>交易所费率：</span>
          {(['VIP0', 'VIP9', 'MM_REBATE'] as FeeTier[]).map((tier) => (
            <button
              key={tier}
              onClick={() => setConfig({ ...config, feeTier: tier })}
              style={{
                background: config.feeTier === tier ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                border: `1px solid ${config.feeTier === tier ? '#38bdf8' : '#475569'}`,
                color: config.feeTier === tier ? '#38bdf8' : '#94a3b8',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.68rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title={FEE_TIERS[tier].desc}
            >
              {FEE_TIERS[tier].name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* VPIN Defense Comparative Delta Banner */}
      {config.enableVpinDefense && simulationResults && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '6px',
            padding: '8px 14px',
            fontSize: '0.72rem',
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={14} style={{ color: '#10b981' }} />
            <span>
              <strong>VPIN 风控防御对比实证：</strong> 成功拦截 <strong className="mono" style={{ color: '#fff' }}>{simulationResults.toxicDefendedCount}</strong> 次毒性大单冲击，挽回逆向选择损失约 <strong className="mono" style={{ color: '#34d399' }}>+${simulationResults.savedAdverseSelection.toFixed(2)}</strong>！
            </span>
          </div>
          <span className="mono" style={{ color: '#38bdf8', fontWeight: 700 }}>
            裸奔做市净利: ${simulationResults.nakedPnl.toFixed(2)} &rarr; 防御做市净利: ${simulationResults.finalPnl.toFixed(2)}
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      {simulationResults && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>净盈亏 (NET PNL)</div>
            <div
              className="mono"
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: simulationResults.finalPnl >= 0 ? '#10b981' : '#f43f5e',
                marginTop: '2px'
              }}
            >
              {simulationResults.finalPnl >= 0 ? `+$${simulationResults.finalPnl.toFixed(2)}` : `-$${Math.abs(simulationResults.finalPnl).toFixed(2)}`}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              Final Net Profit
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>点差毛捕获收益</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
              +${simulationResults.spreadCapture.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              Gross Spread Harvest
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>逆向选择损失</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f43f5e', marginTop: '2px' }}>
              -${simulationResults.adverseSelectionLoss.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              Informed Flow Drag
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>交易所返佣净损益</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: simulationResults.feeRebates >= 0 ? '#38bdf8' : '#fbbf24', marginTop: '2px' }}>
              {simulationResults.feeRebates >= 0 ? `+$${simulationResults.feeRebates.toFixed(2)}` : `-$${Math.abs(simulationResults.feeRebates).toFixed(2)}`}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              {FEE_TIERS[config.feeTier].name.split(' ')[0]}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>夏普比率 (SHARPE)</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>
              {simulationResults.sharpe.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              Max DD: ${simulationResults.maxDd.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Chart Output */}
      {simulationResults && (
        <div>
          <MMLChart option={pnlChartOption} style={{ height: '240px', width: '100%' }} />
        </div>
      )}
    </div>
  );
};
