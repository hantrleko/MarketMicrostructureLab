import React, { useState, useMemo } from 'react';
import { ReplayTrade } from '../types';
import { Shield } from 'lucide-react';
import { MMLChart } from './MMLChart';

interface MarketMakingSimulatorProps {
  trades: ReplayTrade[];
}

interface SimulationConfig {
  halfSpreadBps: number;
  gamma: number; // inventory risk aversion
  quoteSizeBtc: number;
  maxInventoryBtc: number;
  vpinCutoff: number;
}

export const MarketMakingSimulator: React.FC<MarketMakingSimulatorProps> = ({ trades }) => {
  const [config, setConfig] = useState<SimulationConfig>({
    halfSpreadBps: 2.5,
    gamma: 0.10,
    quoteSizeBtc: 0.2,
    maxInventoryBtc: 2.0,
    vpinCutoff: 0.35
  });

  const [selectedPreset, setSelectedPreset] = useState<string>('balanced');

  const applyPreset = (preset: 'aggressive' | 'balanced' | 'defensive') => {
    setSelectedPreset(preset);
    if (preset === 'aggressive') {
      setConfig({
        halfSpreadBps: 1.2,
        gamma: 0.03,
        quoteSizeBtc: 0.3,
        maxInventoryBtc: 3.0,
        vpinCutoff: 0.45
      });
    } else if (preset === 'balanced') {
      setConfig({
        halfSpreadBps: 2.5,
        gamma: 0.10,
        quoteSizeBtc: 0.2,
        maxInventoryBtc: 2.0,
        vpinCutoff: 0.35
      });
    } else {
      setConfig({
        halfSpreadBps: 5.0,
        gamma: 0.30,
        quoteSizeBtc: 0.1,
        maxInventoryBtc: 1.0,
        vpinCutoff: 0.25
      });
    }
  };

  // Run backtesting simulation in pure frontend monotonic loop
  const simulationResults = useMemo(() => {
    if (!trades || trades.length < 20) {
      return null;
    }

    const { halfSpreadBps, gamma, quoteSizeBtc, maxInventoryBtc } = config;
    let inventory = 0;
    let cash = 0;
    let totalFills = 0;
    let buyFills = 0;
    let sellFills = 0;
    let spreadCapture = 0;
    let adverseSelectionLoss = 0;

    const pnlHistory: number[] = [];
    const inventoryHistory: number[] = [];
    const timestamps: string[] = [];

    const N = trades.length;
    const initialPrice = trades[0].price;

    for (let i = 0; i < N; i++) {
      const t = trades[i];
      const mid = t.price;

      // Avellaneda-Stoikov Reservation price skew
      // r(s, q) = s - q * gamma * sigma^2
      const reservation = mid - (inventory * gamma * 0.0002 * mid);
      const halfSpreadDollar = (halfSpreadBps / 10000) * mid;

      const myBid = reservation - halfSpreadDollar;
      const myAsk = reservation + halfSpreadDollar;

      // Check fills against aggressive incoming market flow
      const isAggressiveBuy = t.aggressor_side === 'BUY';
      const isAggressiveSell = t.aggressor_side === 'SELL';

      // If market aggressor sells, hits our passive bid
      if (isAggressiveSell && inventory < maxInventoryBtc && t.price <= myBid) {
        const fillQty = Math.min(quoteSizeBtc, t.base_quantity);
        inventory += fillQty;
        cash -= fillQty * myBid;
        buyFills++;
        totalFills++;
        spreadCapture += fillQty * halfSpreadDollar;

        // Measure adverse selection: price move 10 ticks later
        const futureIdx = Math.min(N - 1, i + 10);
        const futurePrice = trades[futureIdx].price;
        if (futurePrice < myBid) {
          adverseSelectionLoss += fillQty * (myBid - futurePrice);
        }
      }

      // If market aggressor buys, lifts our passive ask
      if (isAggressiveBuy && inventory > -maxInventoryBtc && t.price >= myAsk) {
        const fillQty = Math.min(quoteSizeBtc, t.base_quantity);
        inventory -= fillQty;
        cash += fillQty * myAsk;
        sellFills++;
        totalFills++;
        spreadCapture += fillQty * halfSpreadDollar;

        // Measure adverse selection
        const futureIdx = Math.min(N - 1, i + 10);
        const futurePrice = trades[futureIdx].price;
        if (futurePrice > myAsk) {
          adverseSelectionLoss += fillQty * (futurePrice - myAsk);
        }
      }

      // Mark-to-market net equity
      const mtmEquity = cash + (inventory * mid);
      pnlHistory.push(mtmEquity);
      inventoryHistory.push(inventory);

      if (i % Math.max(1, Math.floor(N / 40)) === 0 || i === N - 1) {
        const timeStr = t.event_time_utc ? t.event_time_utc.slice(11, 19) : `#${i}`;
        timestamps.push(timeStr);
      }
    }

    const finalPnl = pnlHistory[pnlHistory.length - 1] || 0;
    const finalInventory = inventory;
    const finalMid = trades[trades.length - 1].price;
    const inventoryMtm = finalInventory * (finalMid - initialPrice);

    // Compute Sharpe ratio approximation (annualized)
    const returns: number[] = [];
    for (let i = 1; i < pnlHistory.length; i++) {
      returns.push(pnlHistory[i] - pnlHistory[i - 1]);
    }
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const varReturn = returns.length > 0
      ? returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / returns.length
      : 0.0001;
    const sharpe = Math.sqrt(varReturn) > 0 ? (meanReturn / Math.sqrt(varReturn)) * Math.sqrt(252 * 24 * 3600) : 0;

    // Max drawdown
    let peak = -Infinity;
    let maxDd = 0;
    for (const p of pnlHistory) {
      if (p > peak) peak = p;
      const dd = peak - p;
      if (dd > maxDd) maxDd = dd;
    }

    const fillRate = (totalFills / Math.max(1, trades.length)) * 100;

    return {
      finalPnl,
      spreadCapture,
      adverseSelectionLoss,
      inventoryMtm,
      totalFills,
      buyFills,
      sellFills,
      fillRate,
      sharpe,
      maxDd,
      pnlHistory,
      inventoryHistory,
      timestamps,
      finalInventory
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
              AVELLANEDA-STOIKOV 高频做市策略实盘回测模拟器 (MML v3.0)
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              基于逐笔真实成交驱动 · 实时计算最优买卖挂单、库存惩罚、点差捕获与逆向选择损益分解
            </div>
          </div>
        </div>

        {/* Strategy Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.70rem', color: '#64748b' }}>典型策略配置：</span>
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
            ⚡ 激进抢单型 (1.2 bps)
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
            🎯 经典平衡型 (2.5 bps)
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
            🛡️ 避险防御型 (5.0 bps)
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: '#94a3b8' }}>
            <span>挂单半点差 (Half Spread)</span>
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
            <span>库存风险厌恶系数 (gamma)</span>
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
            <span>单笔挂单体量 (Quote Size)</span>
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
            <span>持仓库存上限 (Max Position)</span>
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
      </div>

      {/* KPI Cards Grid */}
      {simulationResults && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>NET REALIZED PNL</div>
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
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>逆向选择割肉亏损</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f43f5e', marginTop: '2px' }}>
              -${simulationResults.adverseSelectionLoss.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              Informed Flow Drag
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>成交笔数 / 成交率</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {simulationResults.totalFills} <span style={{ fontSize: '0.74rem' }}>({simulationResults.fillRate.toFixed(1)}%)</span>
            </div>
            <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
              买 {simulationResults.buyFills} / 卖 {simulationResults.sellFills}
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
