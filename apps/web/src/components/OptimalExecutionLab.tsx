import React, { useState, useMemo } from 'react';
import { RotateCcw, Trophy, ShieldCheck, Zap } from 'lucide-react';
import { MMLChart } from './MMLChart';
import { MathFormula } from './MathFormula';

interface TrajectoryPoint {
  step: number;
  timeLabel: string;
  naiveRemaining: number;
  twapRemaining: number;
  vwapRemaining: number;
  adaptiveRemaining: number;
  naiveSlice: number;
  twapSlice: number;
  vwapSlice: number;
  adaptiveSlice: number;
  midPrice: number;
}

interface AlgoResult {
  name: string;
  label: string;
  color: string;
  executedVwap: number;
  shortfallBps: number;
  tempImpactUsd: number;
  permImpactUsd: number;
  timingRiskUsd: number;
  totalCostUsd: number;
  savingsVsNaiveUsd: number;
}

export const OptimalExecutionLab: React.FC = () => {
  // Model Parameters
  const [orderSizeBtc, setOrderSizeBtc] = useState<number>(100);
  const [horizonSteps, setHorizonSteps] = useState<number>(30); // 30 intervals
  const [riskAversion, setRiskAversion] = useState<number>(0.001); // lambda
  const [tempImpactEta, setTempImpactEta] = useState<number>(0.08); // eta ($ / (BTC/step))
  const [permImpactGamma, setPermImpactGamma] = useState<number>(0.02); // gamma ($ / BTC)
  const [volatilityBps, setVolatilityBps] = useState<number>(15); // sigma per step (bps)
  const [initialPrice] = useState<number>(60000);
  const [activeTab, setActiveTab] = useState<'trajectories' | 'slices' | 'shortfall'>('trajectories');
  const [simSeed, setSimSeed] = useState<number>(42);

  // Pseudo-random price path generator
  const pricePath = useMemo(() => {
    const prices = [initialPrice];
    let curr = initialPrice;
    // deterministic pseudo random using seed
    let seed = simSeed;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const stepSigma = (initialPrice * (volatilityBps / 10000)) / Math.sqrt(horizonSteps);
    for (let i = 1; i <= horizonSteps; i++) {
      const z = (rnd() + rnd() + rnd() + rnd() - 2) * 1.732; // Approx normal
      curr = Math.max(1000, curr + z * stepSigma);
      prices.push(curr);
    }
    return prices;
  }, [horizonSteps, volatilityBps, initialPrice, simSeed]);

  // Realistic Intraday U-shaped volume profile for VWAP
  const volumeWeights = useMemo(() => {
    const weights: number[] = [];
    for (let i = 0; i < horizonSteps; i++) {
      const u = (i - horizonSteps / 2) / (horizonSteps / 2); // [-1, 1]
      // U-curve: high at open & close, lower at midday
      const w = 1.0 + 0.8 * (u * u);
      weights.push(w);
    }
    const sumW = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / sumW);
  }, [horizonSteps]);

  // Almgren-Chriss Closed-form Trajectory Solver:
  // kappa = sqrt(lambda * sigma^2 / eta)
  // x(t) = X0 * sinh(kappa * (T - t)) / sinh(kappa * T)
  const simulation = useMemo(() => {
    const sigma = initialPrice * (volatilityBps / 10000);
    const eta = tempImpactEta;
    const kappa = Math.sqrt((riskAversion * sigma * sigma) / Math.max(1e-6, eta));

    const X0 = orderSizeBtc;
    const T = horizonSteps;

    // Generate trajectories
    const points: TrajectoryPoint[] = [];

    // 1. Naive: 100% in step 0
    // 2. TWAP: linear x(t) = X0 * (1 - t/T)
    // 3. VWAP: x(t) = X0 * (1 - sum_{i=0}^t w_i)
    // 4. Adaptive AC: Almgren-Chriss modified by flow imbalance
    let twapExecSoFar = 0;
    let vwapExecSoFar = 0;

    for (let t = 0; t <= T; t++) {
      // Naive
      const naiveRem = t === 0 ? X0 : 0;

      // TWAP
      const twapSlice = t < T ? X0 / T : 0;
      const twapRem = Math.max(0, X0 - twapExecSoFar);
      twapExecSoFar += twapSlice;

      // VWAP
      const vwapSlice = t < T ? X0 * volumeWeights[t] : 0;
      const vwapRem = Math.max(0, X0 - vwapExecSoFar);
      vwapExecSoFar += vwapSlice;

      // Almgren-Chriss Closed Form
      let acRem = 0;
      if (t === 0) {
        acRem = X0;
      } else if (t === T) {
        acRem = 0;
      } else {
        const sinhNum = Math.sinh(kappa * (T - t));
        const sinhDen = Math.sinh(kappa * T);
        acRem = sinhDen > 0 ? X0 * (sinhNum / sinhDen) : X0 * (1 - t / T);
      }

      points.push({
        step: t,
        timeLabel: `T+${t}`,
        naiveRemaining: naiveRem,
        twapRemaining: twapRem,
        vwapRemaining: vwapRem,
        adaptiveRemaining: acRem,
        naiveSlice: 0,
        twapSlice: 0,
        vwapSlice: 0,
        adaptiveSlice: 0,
        midPrice: pricePath[t] || initialPrice
      });
    }

    // Populate slices
    for (let t = 0; t < T; t++) {
      points[t].naiveSlice = t === 0 ? X0 : 0;
      points[t].twapSlice = points[t].twapRemaining - points[t + 1].twapRemaining;
      points[t].vwapSlice = points[t].vwapRemaining - points[t + 1].vwapRemaining;
      points[t].adaptiveSlice = Math.max(0, points[t].adaptiveRemaining - points[t + 1].adaptiveRemaining);
    }

    // Calculate Shortfall & Impact for each algo
    const calcAlgo = (name: string, label: string, color: string, slices: number[]): AlgoResult => {
      let totalSpent = 0;
      let tempImpactUsd = 0;
      let permImpactUsd = 0;
      let timingRiskUsd = 0;
      let execVwapSum = 0;

      let cumExec = 0;
      for (let t = 0; t < T; t++) {
        const slice = slices[t];
        if (slice <= 0) continue;

        const basePrice = pricePath[t];
        // Temporary impact on this slice: eta * slice
        const tempDelta = eta * slice;
        // Permanent impact accumulated: gamma * cumExec
        const permDelta = permImpactGamma * (cumExec + 0.5 * slice);

        const executionPrice = basePrice + tempDelta + permDelta;
        const cost = slice * executionPrice;
        totalSpent += cost;
        execVwapSum += slice * executionPrice;

        tempImpactUsd += slice * tempDelta;
        permImpactUsd += slice * permDelta;
        timingRiskUsd += slice * (basePrice - initialPrice);

        cumExec += slice;
      }

      const executedVwap = X0 > 0 ? execVwapSum / X0 : initialPrice;
      const benchmarkTotal = X0 * initialPrice;
      const shortfallUsd = totalSpent - benchmarkTotal;
      const shortfallBps = (shortfallUsd / benchmarkTotal) * 10000;

      return {
        name,
        label,
        color,
        executedVwap,
        shortfallBps,
        tempImpactUsd,
        permImpactUsd,
        timingRiskUsd,
        totalCostUsd: shortfallUsd,
        savingsVsNaiveUsd: 0 // populated below
      };
    };

    const naiveRes = calcAlgo('Naive', '市价单一次性倾倒 (Naive Market Dump)', '#ef4444', points.map((p) => p.naiveSlice));
    const twapRes = calcAlgo('TWAP', '时间加权均价拆单 (TWAP Linear)', '#38bdf8', points.map((p) => p.twapSlice));
    const vwapRes = calcAlgo('VWAP', '成交量加权均价拆单 (VWAP Intraday)', '#a855f7', points.map((p) => p.vwapSlice));
    const adaptiveRes = calcAlgo('Adaptive', 'Almgren-Chriss 最优衰减 (AC Hyperbolic)', '#10b981', points.map((p) => p.adaptiveSlice));

    const naiveCost = naiveRes.totalCostUsd;
    naiveRes.savingsVsNaiveUsd = 0;
    twapRes.savingsVsNaiveUsd = naiveCost - twapRes.totalCostUsd;
    vwapRes.savingsVsNaiveUsd = naiveCost - vwapRes.totalCostUsd;
    adaptiveRes.savingsVsNaiveUsd = naiveCost - adaptiveRes.totalCostUsd;

    return {
      points,
      results: [naiveRes, twapRes, vwapRes, adaptiveRes],
      kappa
    };
  }, [orderSizeBtc, horizonSteps, riskAversion, tempImpactEta, permImpactGamma, volatilityBps, initialPrice, pricePath, volumeWeights]);

  // ECharts Option: Inventory Trajectories
  const trajectoryChartOption = useMemo(() => {
    const xLabels = simulation.points.map((p) => p.timeLabel);
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      legend: {
        data: ['Naive (Dump)', 'TWAP (Linear)', 'VWAP (Volume Curve)', 'Almgren-Chriss (Optimal)'],
        textStyle: { color: '#94a3b8' },
        top: 0
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '8%',
        top: '14%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        name: '剩余头寸 (BTC)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8' }
      },
      series: [
        {
          name: 'Naive (Dump)',
          type: 'line',
          data: simulation.points.map((p) => p.naiveRemaining.toFixed(2)),
          lineStyle: { color: '#ef4444', width: 2, type: 'dashed' },
          itemStyle: { color: '#ef4444' }
        },
        {
          name: 'TWAP (Linear)',
          type: 'line',
          data: simulation.points.map((p) => p.twapRemaining.toFixed(2)),
          lineStyle: { color: '#38bdf8', width: 2.5 },
          itemStyle: { color: '#38bdf8' }
        },
        {
          name: 'VWAP (Volume Curve)',
          type: 'line',
          data: simulation.points.map((p) => p.vwapRemaining.toFixed(2)),
          lineStyle: { color: '#a855f7', width: 2.5 },
          itemStyle: { color: '#a855f7' }
        },
        {
          name: 'Almgren-Chriss (Optimal)',
          type: 'line',
          data: simulation.points.map((p) => p.adaptiveRemaining.toFixed(2)),
          lineStyle: { color: '#10b981', width: 3.5 },
          itemStyle: { color: '#10b981' }
        }
      ]
    };
  }, [simulation]);

  // ECharts Option: Slice Distribution
  const sliceChartOption = useMemo(() => {
    const xLabels = simulation.points.slice(0, -1).map((p) => p.timeLabel);
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      legend: {
        data: ['TWAP Slice', 'VWAP Slice', 'Almgren-Chriss Slice'],
        textStyle: { color: '#94a3b8' },
        top: 0
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '8%',
        top: '14%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        name: '单步拆单量 (BTC)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8' }
      },
      series: [
        {
          name: 'TWAP Slice',
          type: 'bar',
          data: simulation.points.slice(0, -1).map((p) => p.twapSlice.toFixed(2)),
          itemStyle: { color: 'rgba(56, 189, 248, 0.7)' }
        },
        {
          name: 'VWAP Slice',
          type: 'bar',
          data: simulation.points.slice(0, -1).map((p) => p.vwapSlice.toFixed(2)),
          itemStyle: { color: 'rgba(168, 85, 247, 0.7)' }
        },
        {
          name: 'Almgren-Chriss Slice',
          type: 'bar',
          data: simulation.points.slice(0, -1).map((p) => p.adaptiveSlice.toFixed(2)),
          itemStyle: { color: 'rgba(16, 185, 129, 0.85)' }
        }
      ]
    };
  }, [simulation]);

  const bestAlgo = simulation.results.slice(1).reduce((prev, curr) => (curr.totalCostUsd < prev.totalCostUsd ? curr : prev));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Banner */}
      <div
        className="mml-card"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '8px',
          padding: '16px 20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} style={{ color: '#10b981' }} />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                买方智能拆单与大单最优执行实验室 (Optimal Execution Lab)
              </h2>
              <span style={{ fontSize: '0.68rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid #10b981', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                ALMGREN-CHRISS SOLVER
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.80rem', color: '#94a3b8', lineHeight: 1.5 }}>
              机构买方（Buy-Side）清算大单面临<strong>瞬时市场冲击</strong>（过快吃单踩穿盘口）与<strong>波动盯市风险</strong>（过慢持仓遭遇价格反向漂移）的永恒权衡。本实验求解 closed-form 双曲减速轨迹 <MathFormula math="x(t) = X_0 \frac{\sinh(\kappa(T - t))}{\sinh(\kappa T)}" /> 并提供四大拆单算法同台马阵对决。
            </p>
          </div>

          <button
            onClick={() => setSimSeed((s) => s + 1)}
            style={{
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid #10b981',
              color: '#10b981',
              fontWeight: 700,
              fontSize: '0.74rem',
              padding: '6px 14px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RotateCcw size={13} />
            重抽随机漂移路径
          </button>
        </div>
      </div>

      {/* Parameter Control Deck */}
      <div
        className="mml-card"
        style={{
          background: 'rgba(15, 23, 42, 0.8)',
          borderRadius: '8px',
          padding: '16px 18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          fontSize: '0.74rem'
        }}
      >
        {/* Order Size */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>待执行总量 (X₀):</span>
            <strong className="mono" style={{ color: '#10b981' }}>{orderSizeBtc} BTC (${(orderSizeBtc * initialPrice / 1e6).toFixed(2)}M)</strong>
          </div>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={orderSizeBtc}
            onChange={(e) => setOrderSizeBtc(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>

        {/* Horizon */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>执行时窗 (T):</span>
            <strong className="mono" style={{ color: '#38bdf8' }}>{horizonSteps} 周期步</strong>
          </div>
          <input
            type="range"
            min={10}
            max={60}
            step={5}
            value={horizonSteps}
            onChange={(e) => setHorizonSteps(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        {/* Risk Aversion */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>风险厌恶度 (λ):</span>
            <strong className="mono" style={{ color: '#fbbf24' }}>{riskAversion.toFixed(4)}</strong>
          </div>
          <input
            type="range"
            min={0.0001}
            max={0.005}
            step={0.0002}
            value={riskAversion}
            onChange={(e) => setRiskAversion(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
          />
        </div>

        {/* Temp Impact Eta */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>瞬时冲击惩罚系数 (η):</span>
            <strong className="mono" style={{ color: '#f43f5e' }}>{tempImpactEta.toFixed(2)} $/BTC</strong>
          </div>
          <input
            type="range"
            min={0.02}
            max={0.25}
            step={0.01}
            value={tempImpactEta}
            onChange={(e) => setTempImpactEta(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#f43f5e', cursor: 'pointer' }}
          />
        </div>

        {/* Perm Impact Gamma */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>永久冲击斜率 (γ):</span>
            <strong className="mono" style={{ color: '#c084fc' }}>{permImpactGamma.toFixed(3)} $/BTC</strong>
          </div>
          <input
            type="range"
            min={0.005}
            max={0.08}
            step={0.005}
            value={permImpactGamma}
            onChange={(e) => setPermImpactGamma(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#c084fc', cursor: 'pointer' }}
          />
        </div>

        {/* Volatility */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>盘口年化波动 (σ):</span>
            <strong className="mono" style={{ color: '#a78bfa' }}>{volatilityBps} bps / 步</strong>
          </div>
          <input
            type="range"
            min={5}
            max={40}
            step={2}
            value={volatilityBps}
            onChange={(e) => setVolatilityBps(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#a78bfa', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Winner Spotlight Banner */}
      <div
        style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Trophy size={20} style={{ color: '#fbbf24' }} />
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fff' }}>
              🏆 最优执行桂冠：{bestAlgo.label}
            </div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '2px' }}>
              相比一次性砸盘市价单 (Naive Dump)，为机构省下 <strong className="mono" style={{ color: '#10b981' }}>+${Math.round(bestAlgo.savingsVsNaiveUsd).toLocaleString()}</strong> 执行落差 (Implementation Shortfall 降低 <strong className="mono" style={{ color: '#fbbf24' }}>{(simulation.results[0].shortfallBps - bestAlgo.shortfallBps).toFixed(1)} bps</strong>)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('trajectories')}
            style={{
              background: activeTab === 'trajectories' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${activeTab === 'trajectories' ? '#10b981' : '#475569'}`,
              color: activeTab === 'trajectories' ? '#10b981' : '#94a3b8',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            剩余头寸曲线 x(t)
          </button>
          <button
            onClick={() => setActiveTab('slices')}
            style={{
              background: activeTab === 'slices' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${activeTab === 'slices' ? '#10b981' : '#475569'}`,
              color: activeTab === 'slices' ? '#10b981' : '#94a3b8',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            各周期拆单切片 v(t)
          </button>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="mml-card" style={{ padding: '16px' }}>
        <div style={{ height: '360px', width: '100%' }}>
          {activeTab === 'trajectories' ? (
            <MMLChart option={trajectoryChartOption} style={{ height: '100%', width: '100%' }} />
          ) : (
            <MMLChart option={sliceChartOption} style={{ height: '100%', width: '100%' }} />
          )}
        </div>
      </div>

      {/* 4-Way Horse Race Execution Scorecard */}
      <div className="mml-card" style={{ padding: '16px' }}>
        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} style={{ color: '#38bdf8' }} />
          四大拆单算法执行质量与落差 (Implementation Shortfall) 横向解构矩阵
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.6)', color: '#94a3b8' }}>
                <th style={{ padding: '8px 10px' }}>算法方案</th>
                <th style={{ padding: '8px 10px' }}>成交 VWAP ($)</th>
                <th style={{ padding: '8px 10px' }}>总滑点落差 (bps)</th>
                <th style={{ padding: '8px 10px' }}>瞬时冲击成本 ($)</th>
                <th style={{ padding: '8px 10px' }}>永久冲击成本 ($)</th>
                <th style={{ padding: '8px 10px' }}>时间风险漂移 ($)</th>
                <th style={{ padding: '8px 10px' }}>总落差损耗 ($)</th>
                <th style={{ padding: '8px 10px' }}>节省资金 ($)</th>
              </tr>
            </thead>
            <tbody>
              {simulation.results.map((r) => {
                const isWinner = r.name === bestAlgo.name;
                return (
                  <tr
                    key={r.name}
                    style={{
                      borderBottom: '1px solid rgba(51, 65, 85, 0.3)',
                      background: isWinner ? 'rgba(16, 185, 129, 0.08)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '10px 10px', fontWeight: 700, color: r.color }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{r.label}</span>
                        {isWinner && (
                          <span style={{ fontSize: '0.62rem', background: '#10b981', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                            TOP PICK
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: '#fff' }}>
                      ${r.executedVwap.toFixed(2)}
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: r.shortfallBps > 15 ? '#ef4444' : '#10b981', fontWeight: 800 }}>
                      +{r.shortfallBps.toFixed(2)} bps
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: '#cbd5e1' }}>
                      ${Math.round(r.tempImpactUsd).toLocaleString()}
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: '#cbd5e1' }}>
                      ${Math.round(r.permImpactUsd).toLocaleString()}
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: r.timingRiskUsd >= 0 ? '#ef4444' : '#10b981' }}>
                      {r.timingRiskUsd >= 0 ? `+$${Math.round(r.timingRiskUsd).toLocaleString()}` : `-$${Math.round(Math.abs(r.timingRiskUsd)).toLocaleString()}`}
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: '#fbbf24', fontWeight: 700 }}>
                      ${Math.round(r.totalCostUsd).toLocaleString()}
                    </td>
                    <td className="mono" style={{ padding: '10px 10px', color: r.savingsVsNaiveUsd > 0 ? '#10b981' : '#64748b', fontWeight: 800 }}>
                      {r.savingsVsNaiveUsd > 0 ? `+$${Math.round(r.savingsVsNaiveUsd).toLocaleString()}` : '---'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Econometric Theory Explainer Card */}
      <div
        className="mml-card"
        style={{
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '8px',
          padding: '16px 18px',
          fontSize: '0.76rem',
          color: '#cbd5e1',
          lineHeight: 1.6
        }}
      >
        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
          📐 Almgren-Chriss 最优拆单数学物理映射 (Calculus of Variations)
        </div>
        <p style={{ margin: '4px 0 8px 0' }}>
          Almgren & Chriss (2000) 将买方大单执行形式化为带有连续边界条件的欧拉-拉格朗日变分极值问题：
        </p>
        <MathFormula math="\min_{x(t)} \mathbb{E}[x_{\text{cost}}] + \lambda_{\text{risk}} \mathbb{V}\text{ar}[x_{\text{cost}}] = \int_0^T \left( \eta \dot{x}(t)^2 + \gamma x(t) \dot{x}(t) + \lambda_{\text{risk}} \sigma^2 x(t)^2 \right) dt" block />
        <p style={{ margin: '8px 0 0 0' }}>
          当风险厌恶 <MathFormula math="\lambda_{\text{risk}} \to 0" /> 时，最优轨迹收敛为纯线性 <MathFormula math="x(t) = X_0(1 - t/T)" />（即传统 TWAP）；当考虑盘口日内流动性钟形分布时演化为 VWAP；而当 <MathFormula math="\lambda_{\text{risk}} > 0" /> 时，双曲正弦 <MathFormula math="\sinh(\kappa(T - t))" /> 要求在建仓初期加速吃单、后期平滑收尾，实现总冲击与盯市风险的最优鞍点均衡！
        </p>
      </div>
    </div>
  );
};
