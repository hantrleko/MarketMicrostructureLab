import React, { useState, useMemo } from 'react';
import { RotateCcw, Trophy, ShieldCheck, Zap } from 'lucide-react';
import { MMLChart } from './MMLChart';
import { MathFormula } from './MathFormula';
import { PrecisionSlider, SegmentedControl, CollapsibleTheory } from './PrecisionUI';

interface TrajectoryPoint {
  step: number;
  timeLabel: string;
  naiveRemaining: number;
  twapRemaining: number;
  vwapRemaining: number;
  adaptiveRemaining: number;
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
  const [activeTab, setActiveTab] = useState<'trajectories' | 'slices'>('trajectories');
  const [simSeed, setSimSeed] = useState<number>(42);

  // Pseudo-random price path generator
  const pricePath = useMemo(() => {
    const prices = [initialPrice];
    let curr = initialPrice;
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
      const w = 1.0 + 0.8 * (u * u);
      weights.push(w);
    }
    const sumW = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / sumW);
  }, [horizonSteps]);

  // Almgren-Chriss Closed-form Trajectory Solver
  const simulation = useMemo(() => {
    const sigma = initialPrice * (volatilityBps / 10000);
    const eta = tempImpactEta;
    const kappa = Math.sqrt((riskAversion * sigma * sigma) / Math.max(1e-6, eta));

    const X0 = orderSizeBtc;
    const T = horizonSteps;

    const points: TrajectoryPoint[] = [];
    let twapExecSoFar = 0;
    let vwapExecSoFar = 0;

    for (let t = 0; t <= T; t++) {
      const naiveRem = t === 0 ? X0 : 0;

      const twapSlice = t < T ? X0 / T : 0;
      const twapRem = Math.max(0, X0 - twapExecSoFar);
      twapExecSoFar += twapSlice;

      const vwapSlice = t < T ? X0 * volumeWeights[t] : 0;
      const vwapRem = Math.max(0, X0 - vwapExecSoFar);
      vwapExecSoFar += vwapSlice;

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
        twapSlice: 0,
        vwapSlice: 0,
        adaptiveSlice: 0,
        midPrice: pricePath[t] || initialPrice
      });
    }

    for (let t = 0; t < T; t++) {
      points[t].twapSlice = points[t].twapRemaining - points[t + 1].twapRemaining;
      points[t].vwapSlice = points[t].vwapRemaining - points[t + 1].vwapRemaining;
      points[t].adaptiveSlice = Math.max(0, points[t].adaptiveRemaining - points[t + 1].adaptiveRemaining);
    }

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
        const tempDelta = eta * slice;
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
        savingsVsNaiveUsd: 0
      };
    };

    const naiveSlices = points.map((_, i) => (i === 0 ? X0 : 0));
    const naiveRes = calcAlgo('Naive', '市价单一次性倾倒 (Naive Market Dump)', '#ef4444', naiveSlices);
    const twapRes = calcAlgo('TWAP', '时间加权均价拆单 (TWAP Linear)', '#38bdf8', points.map((p) => p.twapSlice));
    const vwapRes = calcAlgo('VWAP', '成交量加权均价拆单 (VWAP Intraday)', '#c084fc', points.map((p) => p.vwapSlice));
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

  // ECharts Option: Inventory Trajectories with Linear-Style Glow & Confidence Area
  const trajectoryChartOption = useMemo(() => {
    const xLabels = simulation.points.map((p) => p.timeLabel);
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        backgroundColor: '#0a0f18',
        borderColor: '#26344b',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      legend: {
        data: ['Naive (Dump)', 'TWAP (Linear)', 'VWAP (Volume Curve)', 'Almgren-Chriss (Optimal)'],
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 0,
        right: 10
      },
      grid: {
        left: '3%',
        right: '3%',
        bottom: '8%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: '#26344b' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        name: '剩余头寸 (BTC)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(38, 52, 75, 0.4)' } },
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
          lineStyle: { color: '#38bdf8', width: 2.2 },
          itemStyle: { color: '#38bdf8' }
        },
        {
          name: 'VWAP (Volume Curve)',
          type: 'line',
          data: simulation.points.map((p) => p.vwapRemaining.toFixed(2)),
          lineStyle: { color: '#c084fc', width: 2.2 },
          itemStyle: { color: '#c084fc' }
        },
        {
          name: 'Almgren-Chriss (Optimal)',
          type: 'line',
          data: simulation.points.map((p) => p.adaptiveRemaining.toFixed(2)),
          lineStyle: { color: '#10b981', width: 3.5 },
          itemStyle: { color: '#10b981' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(16, 185, 129, 0.28)' },
                { offset: 1, color: 'rgba(16, 185, 129, 0.0)' }
              ]
            }
          }
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
        backgroundColor: '#0a0f18',
        borderColor: '#26344b',
        textStyle: { color: '#f8fafc', fontSize: 12 }
      },
      legend: {
        data: ['TWAP Slice', 'VWAP Slice', 'Almgren-Chriss Slice'],
        textStyle: { color: '#94a3b8', fontSize: 11 },
        top: 0,
        right: 10
      },
      grid: {
        left: '3%',
        right: '3%',
        bottom: '8%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: '#26344b' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        name: '单步拆单量 (BTC)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(38, 52, 75, 0.4)' } },
        axisLabel: { color: '#94a3b8' }
      },
      series: [
        {
          name: 'TWAP Slice',
          type: 'bar',
          data: simulation.points.slice(0, -1).map((p) => p.twapSlice.toFixed(2)),
          itemStyle: { color: 'rgba(56, 189, 248, 0.65)' }
        },
        {
          name: 'VWAP Slice',
          type: 'bar',
          data: simulation.points.slice(0, -1).map((p) => p.vwapSlice.toFixed(2)),
          itemStyle: { color: 'rgba(192, 132, 252, 0.65)' }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hero Header Banner */}
      <div
        className="mml-card"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(16, 185, 129, 0.08))',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          padding: '16px 20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} style={{ color: '#10b981' }} />
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                买方智能拆单与大单最优执行实验室 (Optimal Execution Lab)
              </h2>
              <span style={{ fontSize: '0.66rem', background: 'rgba(16, 185, 129, 0.18)', color: '#10b981', border: '1px solid #10b981', padding: '1px 7px', borderRadius: '4px', fontWeight: 800 }}>
                ALMGREN-CHRISS SOLVER
              </span>
            </div>
            <p style={{ margin: '5px 0 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
              机构买方清算大单面临<strong>瞬时市场冲击</strong>（过快吃单打穿盘口）与<strong>波动盯市风险</strong>（过慢遭遇价格漂移）的极值博弈。
            </p>
          </div>

          <button
            onClick={() => setSimSeed((s) => s + 1)}
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid #10b981',
              color: '#10b981',
              fontWeight: 700,
              fontSize: '0.72rem',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RotateCcw size={12} />
            重抽随机价格路径
          </button>
        </div>
      </div>

      {/* Split Cockpit: Left Parameters (Sticky) + Right Fluid Results */}
      <div className="split-cockpit-layout">
        {/* Left Sticky Parameters Cockpit */}
        <div className="cockpit-sticky-pane">
          <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="mml-card-title" style={{ marginBottom: '4px' }}>
              <span>🎛️ 变分参数控制台 (COCKPIT)</span>
              <span className="mono" style={{ fontSize: '0.68rem', color: '#10b981' }}>κ = {simulation.kappa.toFixed(3)}</span>
            </div>

            <PrecisionSlider
              label="待执行总量 (X₀)"
              value={orderSizeBtc}
              min={10}
              max={500}
              step={10}
              unit="BTC"
              color="emerald"
              formatter={(v) => `${v} BTC ($${(v * initialPrice / 1e6).toFixed(1)}M)`}
              onChange={setOrderSizeBtc}
              quickPresets={[50, 100, 200, 400]}
            />

            <PrecisionSlider
              label="执行时窗 (T)"
              value={horizonSteps}
              min={10}
              max={60}
              step={5}
              unit="步"
              color="cyan"
              onChange={setHorizonSteps}
              quickPresets={[15, 30, 45, 60]}
            />

            <PrecisionSlider
              label="风险厌恶度 (λ)"
              value={riskAversion}
              min={0.0001}
              max={0.005}
              step={0.0002}
              color="amber"
              formatter={(v) => v.toFixed(4)}
              onChange={setRiskAversion}
              quickPresets={[0.0002, 0.001, 0.003]}
            />

            <PrecisionSlider
              label="瞬时冲击惩罚系数 (η)"
              value={tempImpactEta}
              min={0.02}
              max={0.25}
              step={0.01}
              unit="$/BTC"
              color="rose"
              formatter={(v) => `${v.toFixed(2)} $/BTC`}
              onChange={setTempImpactEta}
            />

            <PrecisionSlider
              label="永久冲击斜率 (γ)"
              value={permImpactGamma}
              min={0.005}
              max={0.08}
              step={0.005}
              unit="$/BTC"
              color="purple"
              formatter={(v) => `${v.toFixed(3)} $/BTC`}
              onChange={setPermImpactGamma}
            />

            <PrecisionSlider
              label="盘口单步波动 (σ)"
              value={volatilityBps}
              min={5}
              max={40}
              step={2}
              unit="bps"
              color="cyan"
              onChange={setVolatilityBps}
            />
          </div>

          {/* Winner Spotlight Card */}
          <div
            className="mml-card"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Trophy size={16} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#fff' }}>
                最优执行桂冠：{bestAlgo.name}
              </span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.5 }}>
              相比市价单 (Naive Dump)，为机构节省资金：
              <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', margin: '4px 0' }}>
                +${Math.round(bestAlgo.savingsVsNaiveUsd).toLocaleString()}
              </div>
              <div>滑点损耗降低：<strong className="mono" style={{ color: '#fbbf24' }}>{(simulation.results[0].shortfallBps - bestAlgo.shortfallBps).toFixed(1)} bps</strong></div>
            </div>
          </div>
        </div>

        {/* Right Fluid Analytics Pane */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Main Visualizer Card */}
          <div className="mml-card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>
                📉 四大算法拆单轨迹实时解算对比
              </span>

              <SegmentedControl
                options={[
                  { id: 'trajectories', label: '剩余头寸曲线 x(t)' },
                  { id: 'slices', label: '各步拆单切片 v(t)' }
                ]}
                value={activeTab}
                onChange={setActiveTab}
                size="sm"
                activeColor="#10b981"
              />
            </div>

            <div style={{ height: '340px', width: '100%' }}>
              {activeTab === 'trajectories' ? (
                <MMLChart option={trajectoryChartOption} style={{ height: '100%', width: '100%' }} />
              ) : (
                <MMLChart option={sliceChartOption} style={{ height: '100%', width: '100%' }} />
              )}
            </div>
          </div>

          {/* 4-Way Horse Race Execution Scorecard */}
          <div className="mml-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} style={{ color: '#38bdf8' }} />
              四大拆单算法执行质量与落差 (Implementation Shortfall) 解构矩阵
            </div>

            <div className="table-responsive">
              <table className="mml-table">
                <thead>
                  <tr>
                    <th>算法方案</th>
                    <th>成交 VWAP</th>
                    <th>总落差 (bps)</th>
                    <th>瞬时冲击</th>
                    <th>永久冲击</th>
                    <th>时间漂移风险</th>
                    <th>总损耗 ($)</th>
                    <th>节省资金 ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.results.map((r) => {
                    const isWinner = r.name === bestAlgo.name;
                    return (
                      <tr key={r.name} style={{ background: isWinner ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                        <td style={{ fontWeight: 700, color: r.color }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{r.label}</span>
                            {isWinner && (
                              <span style={{ fontSize: '0.60rem', background: '#10b981', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                                WINNER
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="mono" style={{ color: '#fff' }}>${r.executedVwap.toFixed(2)}</td>
                        <td className="mono" style={{ color: r.shortfallBps > 15 ? '#ef4444' : '#10b981', fontWeight: 800 }}>
                          +{r.shortfallBps.toFixed(2)} bps
                        </td>
                        <td className="mono">${Math.round(r.tempImpactUsd).toLocaleString()}</td>
                        <td className="mono">${Math.round(r.permImpactUsd).toLocaleString()}</td>
                        <td className="mono" style={{ color: r.timingRiskUsd >= 0 ? '#ef4444' : '#10b981' }}>
                          {r.timingRiskUsd >= 0 ? `+$${Math.round(r.timingRiskUsd).toLocaleString()}` : `-$${Math.round(Math.abs(r.timingRiskUsd)).toLocaleString()}`}
                        </td>
                        <td className="mono" style={{ color: '#fbbf24', fontWeight: 700 }}>
                          ${Math.round(r.totalCostUsd).toLocaleString()}
                        </td>
                        <td className="mono" style={{ color: r.savingsVsNaiveUsd > 0 ? '#10b981' : '#64748b', fontWeight: 800 }}>
                          {r.savingsVsNaiveUsd > 0 ? `+$${Math.round(r.savingsVsNaiveUsd).toLocaleString()}` : '---'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collapsible Theory Accordion */}
          <CollapsibleTheory
            title="Almgren-Chriss 最优拆单数学变分法极值推导 (Calculus of Variations)"
            badge="MATH PROOF"
            summary="连续时间欧拉-拉格朗日极值方程推导出双曲减速曲线"
          >
            <p style={{ margin: '0 0 8px 0' }}>
              Almgren & Chriss (2000) 将买方大单执行形式化为带有连续边界条件的欧拉-拉格朗日变分极值问题：
            </p>
            <div className="math-block-container">
              <MathFormula math="\min_{x(t)} \mathbb{E}[x_{\text{cost}}] + \lambda_{\text{risk}} \mathbb{V}\text{ar}[x_{\text{cost}}] = \int_0^T \left( \eta \dot{x}(t)^2 + \gamma x(t) \dot{x}(t) + \lambda_{\text{risk}} \sigma^2 x(t)^2 \right) dt" block />
            </div>
            <p style={{ margin: '8px 0 0 0' }}>
              当风险厌恶 <MathFormula math="\lambda_{\text{risk}} \to 0" /> 时，最优轨迹收敛为纯线性 <MathFormula math="x(t) = X_0(1 - t/T)" />（即传统 TWAP）；当考虑盘口日内流动性钟形分布时演化为 VWAP；而当 <MathFormula math="\lambda_{\text{risk}} > 0" /> 时，双曲正弦 <MathFormula math="\sinh(\kappa(T - t))" /> 要求在建仓初期加速吃单、后期平滑收尾，实现总冲击与盯市风险的最优鞍点均衡！
            </p>
          </CollapsibleTheory>
        </div>
      </div>
    </div>
  );
};
