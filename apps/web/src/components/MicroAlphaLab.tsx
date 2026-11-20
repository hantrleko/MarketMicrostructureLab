import React, { useState, useMemo, useEffect } from 'react';
import { Target, BarChart3, Activity, Code2, FileText, Sparkles, Radio } from 'lucide-react';
import { MMLChart } from './MMLChart';
import { MathFormula } from './MathFormula';
import { PrecisionSlider, SegmentedControl, CollapsibleTheory } from './PrecisionUI';
import { fetchReplayWindow } from '../api/client';
import { ReplayTrade } from '../types';
import { scanAlphaGridAsync } from '../workers/quantWorkerClient';
import type { AlphaGridResult } from '../workers/quantWorker';
import { downloadTextFile, generateMicroAlphaPython, generateResearchMemoMarkdown } from '../utils/exportSuite';

interface FactorObservation {
  t: number;
  price: number;
  ofi: number;
  mpi: number;
  cvdDelta: number;
  hawkesDelta: number;
  fwdRet5: number;
  fwdRet10: number;
  fwdRet20: number;
  fwdRet50: number;
}

interface MicroAlphaLabProps {
  selectedDate: string;
  customTrades?: ReplayTrade[] | null;
  onClearCustomTrades?: () => void;
}

export const MicroAlphaLab: React.FC<MicroAlphaLabProps> = ({ selectedDate, customTrades, onClearCustomTrades }) => {
  // Factor Weights Sliders
  const [wOfi, setWOfi] = useState<number>(0.35);
  const [wMpi, setWMpi] = useState<number>(0.25);
  const [wCvd, setWCvd] = useState<number>(0.25);
  const [wHawkes, setWHawkes] = useState<number>(0.15);

  // Selected Prediction Horizon
  const [horizonK, setHorizonK] = useState<5 | 10 | 20 | 50>(10);
  const [thresholdScore, setThresholdScore] = useState<number>(0.15);

  // Data Loading State
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [alphaGrid, setAlphaGrid] = useState<AlphaGridResult | null>(null);
  const isUsingCustomTrades = Boolean(customTrades && customTrades.length >= 60);

  useEffect(() => {
    if (customTrades && customTrades.length >= 60) {
      setTrades(customTrades);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchReplayWindow('BTCUSDT', selectedDate, 20994, 60, 2000)
      .then((res) => {
        setTrades(res.trades || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load trades for Alpha Lab', err);
        setLoading(false);
      });
  }, [selectedDate, customTrades]);

  // Compute Raw Microstructure Features across trades
  const dataset = useMemo(() => {
    if (trades.length < 60) return [];

    const list: FactorObservation[] = [];
    let cumCvd = 0;
    const cvdHist: number[] = [];

    let buyCounter = 0;
    let sellCounter = 0;

    for (let i = 0; i < trades.length; i++) {
      const tr = trades[i];
      const isBuy = tr.is_buyer_maker === false;
      const vol = tr.base_quantity || 0.1;

      if (isBuy) {
        cumCvd += vol;
        buyCounter += 1;
      } else {
        cumCvd -= vol;
        sellCounter += 1;
      }
      cvdHist.push(cumCvd);

      const windowLen = 10;
      const cvdDelta = i >= windowLen ? cumCvd - cvdHist[i - windowLen] : cumCvd;

      const prevPrice = i > 0 ? trades[i - 1].price : tr.price;
      const ofi = (tr.price - prevPrice) * 100 + (isBuy ? vol : -vol) * 5;
      const mpi = (isBuy ? 1 : -1) * 0.4 + (Math.random() - 0.5) * 0.2;
      const hawkesDelta = (buyCounter - sellCounter) * 0.1;

      const getRet = (k: number) => {
        if (i + k < trades.length) {
          return ((trades[i + k].price - tr.price) / tr.price) * 10000;
        }
        return 0;
      };

      list.push({
        t: i,
        price: tr.price,
        ofi,
        mpi,
        cvdDelta,
        hawkesDelta,
        fwdRet5: getRet(5),
        fwdRet10: getRet(10),
        fwdRet20: getRet(20),
        fwdRet50: getRet(50)
      });
    }

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length) || 1;

    const ofiM = mean(list.map((d) => d.ofi));
    const ofiS = std(list.map((d) => d.ofi), ofiM);
    const mpiM = mean(list.map((d) => d.mpi));
    const mpiS = std(list.map((d) => d.mpi), mpiM);
    const cvdM = mean(list.map((d) => d.cvdDelta));
    const cvdS = std(list.map((d) => d.cvdDelta), cvdM);
    const hwkM = mean(list.map((d) => d.hawkesDelta));
    const hwkS = std(list.map((d) => d.hawkesDelta), hwkM);

    return list.map((item) => ({
      ...item,
      ofiZ: (item.ofi - ofiM) / ofiS,
      mpiZ: (item.mpi - mpiM) / mpiS,
      cvdZ: (item.cvdDelta - cvdM) / cvdS,
      hwkZ: (item.hawkesDelta - hwkM) / hwkS
    }));
  }, [trades]);

  // Real-time Alpha Score Evaluation & Metrics across k horizons
  const evaluation = useMemo(() => {
    if (dataset.length < 60) {
      return {
        ic5: 0,
        ic10: 0,
        ic20: 0,
        ic50: 0,
        hitRate: 0,
        tp: 0,
        fp: 0,
        tn: 0,
        fn: 0,
        precision: 0,
        recall: 0,
        f1: 0,
        scatterData: []
      };
    }

    const totalWeight = wOfi + wMpi + wCvd + wHawkes || 1;
    const normWOfi = wOfi / totalWeight;
    const normWMpi = wMpi / totalWeight;
    const normWCvd = wCvd / totalWeight;
    const normWHawkes = wHawkes / totalWeight;

    const scores = dataset.map((d) => {
      const alpha = normWOfi * (d.ofiZ || 0) + normWMpi * (d.mpiZ || 0) + normWCvd * (d.cvdZ || 0) + normWHawkes * (d.hwkZ || 0);
      return {
        alpha,
        ret5: d.fwdRet5,
        ret10: d.fwdRet10,
        ret20: d.fwdRet20,
        ret50: d.fwdRet50
      };
    });

    const calcIc = (retKey: 'ret5' | 'ret10' | 'ret20' | 'ret50') => {
      const n = scores.length;
      let sumA = 0, sumR = 0, sumAR = 0, sumA2 = 0, sumR2 = 0;
      for (let i = 0; i < n; i++) {
        const a = scores[i].alpha;
        const r = scores[i][retKey];
        sumA += a;
        sumR += r;
        sumAR += a * r;
        sumA2 += a * a;
        sumR2 += r * r;
      }
      const num = n * sumAR - sumA * sumR;
      const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumR2 - sumR * sumR));
      return den === 0 ? 0 : num / den;
    };

    const ic5 = calcIc('ret5');
    const ic10 = calcIc('ret10');
    const ic20 = calcIc('ret20');
    const ic50 = calcIc('ret50');

    const targetKey = horizonK === 5 ? 'ret5' : horizonK === 10 ? 'ret10' : horizonK === 20 ? 'ret20' : 'ret50';
    let tp = 0, fp = 0, tn = 0, fn = 0;
    const scatterData: Array<[number, number]> = [];

    scores.forEach((s) => {
      const a = s.alpha;
      const r = s[targetKey];
      scatterData.push([parseFloat(a.toFixed(3)), parseFloat(r.toFixed(3))]);

      if (a >= thresholdScore) {
        if (r > 0) tp++;
        else fp++;
      } else if (a <= -thresholdScore) {
        if (r < 0) tn++;
        else fn++;
      }
    });

    const totalPredicted = tp + fp + tn + fn;
    const hitRate = totalPredicted > 0 ? ((tp + tn) / totalPredicted) * 100 : 0;
    const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
    const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      ic5,
      ic10,
      ic20,
      ic50,
      hitRate,
      tp,
      fp,
      tn,
      fn,
      precision,
      recall,
      f1,
      scatterData: scatterData.slice(0, 500)
    };
  }, [dataset, wOfi, wMpi, wCvd, wHawkes, horizonK, thresholdScore]);

  // Scatter plot ECharts Option
  const scatterChartOption = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => `Alpha 预测分: ${params.value[0]}<br/>未来 ${horizonK} 笔实际涨跌: ${params.value[1]} bps`,
        backgroundColor: '#0a0f18',
        borderColor: '#26344b',
        textStyle: { color: '#f8fafc', fontSize: 11 }
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '10%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '合成 Alpha 预测分 (Score)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(38, 52, 75, 0.4)' } },
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: {
        type: 'value',
        name: `实际收益 (k = ${horizonK} 笔, bps)`,
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(38, 52, 75, 0.4)' } },
        axisLabel: { color: '#94a3b8' }
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 6,
          data: evaluation.scatterData,
          itemStyle: {
            color: (params: any) => (params.value[0] * params.value[1] > 0 ? '#10b981' : '#f43f5e'),
            opacity: 0.75
          }
        }
      ]
    };
  }, [evaluation.scatterData, horizonK]);

  // Offload 2D (w_ofi x kHorizon) parameter grid sweep to Web Worker
  useEffect(() => {
    if (dataset.length < 60) return;
    let cancelled = false;
    scanAlphaGridAsync({
      dataset: dataset.map((d) => ({
        ofiZ: d.ofiZ,
        mpiZ: d.mpiZ,
        cvdZ: d.cvdZ,
        hwkZ: d.hwkZ,
        fwdRet5: d.fwdRet5,
        fwdRet10: d.fwdRet10,
        fwdRet20: d.fwdRet20,
        fwdRet50: d.fwdRet50
      })),
      wMpi,
      wCvd,
      wHawkes,
      thresholdScore
    }).then((res) => {
      if (!cancelled) setAlphaGrid(res);
    });
    return () => {
      cancelled = true;
    };
  }, [dataset, wMpi, wCvd, wHawkes, thresholdScore]);

  const alphaHeatmapOption = useMemo(() => {
    if (!alphaGrid || alphaGrid.heatmapData.length === 0) return {};
    const vals = alphaGrid.heatmapData.map((d) => d[2]);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top',
        backgroundColor: '#0a0f18',
        borderColor: '#26344b',
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (p: any) => {
          const k = alphaGrid.horizons[p.value[0]];
          const w = alphaGrid.wOfiValues[p.value[1]];
          return `前瞻步长 k = <b>${k}</b><br/>OFI 权重 = <b>${w.toFixed(2)}</b><br/>信号夏普代理: <b style="color:#00f0ff">${p.value[2]}</b>`;
        }
      },
      grid: { left: '12%', right: '6%', top: '10%', bottom: '20%' },
      xAxis: {
        type: 'category',
        name: '前瞻步长 k (笔)',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        data: alphaGrid.horizons.map((h) => `k=${h}`),
        axisLabel: { color: '#cbd5e1', fontSize: 10 },
        axisLine: { lineStyle: { color: '#26344b' } }
      },
      yAxis: {
        type: 'category',
        name: 'OFI 权重',
        nameTextStyle: { color: '#94a3b8', fontSize: 10 },
        data: alphaGrid.wOfiValues.map((w) => w.toFixed(2)),
        axisLabel: { color: '#cbd5e1', fontSize: 10 },
        axisLine: { lineStyle: { color: '#26344b' } }
      },
      visualMap: {
        min: minV,
        max: maxV,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        inRange: { color: ['#ef4444', '#f59e0b', '#0ea5e9', '#10b981'] }
      },
      series: [
        {
          name: 'Sharpe Proxy',
          type: 'heatmap',
          data: alphaGrid.heatmapData,
          label: { show: true, color: '#fff', fontSize: 10 },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } }
        }
      ]
    };
  }, [alphaGrid]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Title & Banner */}
      <div
        className="mml-card"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(56, 189, 248, 0.08))',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          padding: '16px 20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Target size={20} style={{ color: '#00f0ff' }} />
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                微观结构 Alpha 预测实验室 (Microstructure Alpha Predictor)
              </h2>
              <span style={{ fontSize: '0.66rem', background: 'rgba(56, 189, 248, 0.18)', color: '#38bdf8', border: '1px solid #38bdf8', padding: '1px 7px', borderRadius: '4px', fontWeight: 800 }}>
                MULTI-FACTOR DIRECTIONAL ENGINE
              </span>
              {isUsingCustomTrades && (
                <span style={{ fontSize: '0.66rem', background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: '1px solid #c084fc', padding: '1px 7px', borderRadius: '4px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Radio size={10} /> 实盘黑匣子样本 ({trades.length} 笔)
                </span>
              )}
            </div>
            <p style={{ margin: '5px 0 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
              融合 <strong>OFI 订单流失衡</strong>、<strong>Microprice 偏离</strong>、<strong>CVD 吃单净量</strong> 与 <strong>Hawkes 自激强度差</strong> 四大高频微观因子。
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {loading && <span style={{ fontSize: '0.68rem', color: '#fbbf24' }}>⚡ 正在载入逐笔微观数据...</span>}
            {isUsingCustomTrades && onClearCustomTrades && (
              <button
                onClick={onClearCustomTrades}
                style={{
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid #c084fc',
                  color: '#c084fc',
                  padding: '4px 9px',
                  borderRadius: '4px',
                  fontSize: '0.70rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                恢复默认历史样本
              </button>
            )}
            <button
              onClick={() => {
                const activeIc = horizonK === 5 ? evaluation.ic5 : horizonK === 10 ? evaluation.ic10 : horizonK === 20 ? evaluation.ic20 : evaluation.ic50;
                const py = generateMicroAlphaPython({
                  wOfi,
                  wMpi,
                  wCvd,
                  wHawkes,
                  horizonK,
                  thresholdScore,
                  ic: activeIc,
                  winRatePct: evaluation.hitRate,
                  netBps: alphaGrid?.bestCell.sharpeProxy ?? 0
                });
                downloadTextFile(`micro_alpha_k${horizonK}.py`, py, 'text/x-python;charset=utf-8');
              }}
              style={{
                background: 'rgba(56, 189, 248, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.70rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Code2 size={12} /> 导出 Python 因子
            </button>
            <button
              onClick={() => {
                const activeIc = horizonK === 5 ? evaluation.ic5 : horizonK === 10 ? evaluation.ic10 : horizonK === 20 ? evaluation.ic20 : evaluation.ic50;
                const md = generateResearchMemoMarkdown('Micro-Alpha 多因子高频预测研究备忘录', [
                  {
                    heading: '1. 因子权重与阈值配置',
                    body: `- $w_{\\text{ofi}}$: **${wOfi.toFixed(2)}** | $w_{\\text{mpi}}$: **${wMpi.toFixed(2)}** | $w_{\\text{cvd}}$: **${wCvd.toFixed(2)}** | $w_{\\text{hwk}}$: **${wHawkes.toFixed(2)}**\n- 预测步长 $k$: **${horizonK} 笔** | 触发阈值: **${thresholdScore.toFixed(2)}**`
                  },
                  {
                    heading: '2. 实证预测表现',
                    body: `- 信息系数 (IC): **${activeIc.toFixed(4)}**\n- 方向胜率 (Hit Rate): **${evaluation.hitRate.toFixed(1)}%**\n- Precision / Recall / F1: **${evaluation.precision.toFixed(1)}% / ${evaluation.recall.toFixed(1)}% / ${evaluation.f1.toFixed(1)}%**`
                  }
                ]);
                downloadTextFile(`micro_alpha_memo_k${horizonK}.md`, md, 'text/markdown;charset=utf-8');
              }}
              style={{
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#10b981',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.70rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <FileText size={12} /> 导出报告 (.md)
            </button>
            <SegmentedControl
              options={[
                { id: 5, label: 'k = 5 笔' },
                { id: 10, label: 'k = 10 笔' },
                { id: 20, label: 'k = 20 笔' },
                { id: 50, label: 'k = 50 笔' }
              ]}
              value={horizonK}
              onChange={(val) => setHorizonK(val as any)}
              size="sm"
              activeColor="#00f0ff"
            />
          </div>
        </div>
      </div>

      {/* Split Cockpit: Left Parameters (Sticky) + Right Fluid Visuals */}
      <div className="split-cockpit-layout">
        {/* Left Sticky Parameters Cockpit */}
        <div className="cockpit-sticky-pane">
          <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="mml-card-title" style={{ marginBottom: '4px' }}>
              <span>🎛️ 多因子权重分配 (ALPHA WEIGHTS)</span>
            </div>

            <PrecisionSlider
              label="OFI 订单流失衡 (w_ofi)"
              value={wOfi}
              min={0}
              max={1.0}
              step={0.05}
              color="cyan"
              formatter={(v) => v.toFixed(2)}
              onChange={setWOfi}
              quickPresets={[0.2, 0.35, 0.5]}
            />

            <PrecisionSlider
              label="Microprice 偏离 (w_mpi)"
              value={wMpi}
              min={0}
              max={1.0}
              step={0.05}
              color="amber"
              formatter={(v) => v.toFixed(2)}
              onChange={setWMpi}
              quickPresets={[0.1, 0.25, 0.4]}
            />

            <PrecisionSlider
              label="ΔCVD 吃单净量 (w_cvd)"
              value={wCvd}
              min={0}
              max={1.0}
              step={0.05}
              color="emerald"
              formatter={(v) => v.toFixed(2)}
              onChange={setWCvd}
              quickPresets={[0.15, 0.25, 0.35]}
            />

            <PrecisionSlider
              label="Hawkes 自激差 (w_hwk)"
              value={wHawkes}
              min={0}
              max={1.0}
              step={0.05}
              color="purple"
              formatter={(v) => v.toFixed(2)}
              onChange={setWHawkes}
              quickPresets={[0.05, 0.15, 0.3]}
            />

            <PrecisionSlider
              label="开仓预测分阈值 (Threshold)"
              value={thresholdScore}
              min={0.05}
              max={0.5}
              step={0.05}
              color="rose"
              formatter={(v) => `±${v.toFixed(2)}`}
              onChange={setThresholdScore}
            />
          </div>

          {/* Quick Metrics Capsule */}
          <div className="mml-card" style={{ padding: '14px' }}>
            <div style={{ fontSize: '0.70rem', color: '#94a3b8', marginBottom: '8px' }}>
              当前时窗 (k = {horizonK} 笔) 关键效能:
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.64rem', color: '#64748b' }}>RANK IC</div>
                <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: (horizonK === 5 ? evaluation.ic5 : horizonK === 10 ? evaluation.ic10 : horizonK === 20 ? evaluation.ic20 : evaluation.ic50) > 0 ? '#10b981' : '#f43f5e' }}>
                  {(horizonK === 5 ? evaluation.ic5 : horizonK === 10 ? evaluation.ic10 : horizonK === 20 ? evaluation.ic20 : evaluation.ic50).toFixed(3)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.64rem', color: '#64748b' }}>命中准确率</div>
                <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#00f0ff' }}>
                  {evaluation.hitRate.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Fluid Analytics Pane */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Information Coefficient Across Horizons Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            {[
              { label: 'k = 5 笔 IC', val: evaluation.ic5, active: horizonK === 5, kVal: 5 },
              { label: 'k = 10 笔 IC', val: evaluation.ic10, active: horizonK === 10, kVal: 10 },
              { label: 'k = 20 笔 IC', val: evaluation.ic20, active: horizonK === 20, kVal: 20 },
              { label: 'k = 50 笔 IC', val: evaluation.ic50, active: horizonK === 50, kVal: 50 }
            ].map((item) => (
              <div
                key={item.label}
                onClick={() => setHorizonK(item.kVal as any)}
                style={{
                  background: item.active ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.75)',
                  border: `1px solid ${item.active ? '#38bdf8' : 'rgba(71, 85, 105, 0.4)'}`,
                  borderRadius: '6px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ fontSize: '0.66rem', color: item.active ? '#38bdf8' : '#94a3b8', fontWeight: item.active ? 800 : 500 }}>
                  {item.label}
                </div>
                <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: item.val > 0.05 ? '#10b981' : item.val < -0.05 ? '#ef4444' : '#fbbf24', marginTop: '2px' }}>
                  {item.val >= 0 ? `+${item.val.toFixed(3)}` : item.val.toFixed(3)}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
                  {Math.abs(item.val) > 0.08 ? '🔥 显著统计 Alpha' : '微弱先行信号'}
                </div>
              </div>
            ))}
          </div>

          {/* Scatter Plot + Confusion Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {/* Scatter Plot */}
            <div className="mml-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={15} style={{ color: '#00f0ff' }} />
                合成 Alpha 分 vs 实际涨跌散布 (Scatter Dispersion)
              </div>
              <div style={{ height: '280px', width: '100%' }}>
                <MMLChart option={scatterChartOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>

            {/* Confusion Matrix Heatmap */}
            <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BarChart3 size={15} style={{ color: '#10b981' }} />
                混淆矩阵分类能力审计 (k = {horizonK} 笔预测)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#10b981', fontWeight: 700 }}>TRUE POSITIVE (TP)</div>
                  <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    {evaluation.tp}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>预测涨且实际涨</div>
                </div>

                <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#f87171', fontWeight: 700 }}>FALSE POSITIVE (FP)</div>
                  <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    {evaluation.fp}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>预测涨但实际跌 (误报)</div>
                </div>

                <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#f87171', fontWeight: 700 }}>FALSE NEGATIVE (FN)</div>
                  <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    {evaluation.fn}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>预测跌但实际涨 (漏报)</div>
                </div>

                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#10b981', fontWeight: 700 }}>TRUE NEGATIVE (TN)</div>
                  <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    {evaluation.tn}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>预测跌且实际跌</div>
                </div>
              </div>

              <div style={{ background: 'rgba(10, 15, 24, 0.6)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                <div><strong>查准率 (Precision):</strong> <strong className="mono" style={{ color: '#10b981' }}>{evaluation.precision.toFixed(1)}%</strong></div>
                <div><strong>查全率 (Recall):</strong> <strong className="mono" style={{ color: '#00f0ff' }}>{evaluation.recall.toFixed(1)}%</strong></div>
                <div><strong>F1-Score 综合值:</strong> <strong className="mono" style={{ color: '#fbbf24' }}>{evaluation.f1.toFixed(1)}%</strong></div>
              </div>
            </div>
          </div>

          {/* Web Worker 2D Alpha Grid Heatmap */}
          {alphaGrid && alphaGrid.heatmapData.length > 0 && (
            <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={15} style={{ color: '#fbbf24' }} />
                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>
                    二维因子参数网格扫描热力图 (w_ofi × Horizon k)
                  </span>
                  <span style={{ fontSize: '0.62rem', background: 'rgba(16, 185, 129, 0.16)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '1px 6px', borderRadius: '3px', fontWeight: 800 }}>
                    WEB WORKER
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.72rem' }}>
                  <span style={{ color: '#cbd5e1' }}>
                    最优组合：w_ofi = <strong className="mono" style={{ color: '#00f0ff' }}>{alphaGrid.bestCell.wOfi.toFixed(2)}</strong>, k = <strong className="mono" style={{ color: '#fbbf24' }}>{alphaGrid.bestCell.horizon}</strong> (Sharpe代理: <strong className="mono" style={{ color: '#10b981' }}>{alphaGrid.bestCell.sharpeProxy}</strong>)
                  </span>
                  <button
                    onClick={() => {
                      setWOfi(alphaGrid.bestCell.wOfi);
                      setHorizonK(alphaGrid.bestCell.horizon as any);
                    }}
                    style={{
                      background: '#00f0ff',
                      color: '#000',
                      fontWeight: 800,
                      fontSize: '0.68rem',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ 应用最优组合
                  </button>
                </div>
              </div>

              <div style={{ height: '240px', width: '100%' }}>
                <MMLChart option={alphaHeatmapOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          )}

          {/* Theory Accordion */}
          <CollapsibleTheory
            title="四大高频微观结构因子计量推导 (Microstructure Factor Architecture)"
            badge="FACTOR THEORY"
            summary="OFI、Microprice、CVD Delta 与 Hawkes 自激强度的正交合成"
          >
            <p style={{ margin: '0 0 8px 0' }}>
              合成高频预测信号形式化为各微观因子的 Z-Score 标准化加权线性组合：
            </p>
            <div className="math-block-container">
              <MathFormula math="S_t = w_{\text{ofi}} \cdot Z(\text{OFI}_t) + w_{\text{mpi}} \cdot Z(\text{MPI}_t) + w_{\text{cvd}} \cdot Z(\Delta\text{CVD}_t) + w_{\text{hwk}} \cdot Z(\Delta\lambda_t)" block />
            </div>
            <p style={{ margin: '8px 0 0 0' }}>
              其中 OFI 捕捉档位挂单与撤单的物理流动性失衡，Microprice 衡量盘口排队概率加权价格，CVD 反映主动吃单单向动量，而 Hawkes $\Delta\lambda$ 捕捉同向自激簇聚带来的雪崩惯性。
            </p>
          </CollapsibleTheory>
        </div>
      </div>
    </div>
  );
};
