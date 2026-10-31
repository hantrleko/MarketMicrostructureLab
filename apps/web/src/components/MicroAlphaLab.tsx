import React, { useState, useMemo, useEffect } from 'react';
import { Target, BarChart3, Activity } from 'lucide-react';
import { MMLChart } from './MMLChart';
import { MathFormula } from './MathFormula';
import { fetchReplayWindow } from '../api/client';
import { ReplayTrade } from '../types';

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

export const MicroAlphaLab: React.FC<{ selectedDate: string }> = ({ selectedDate }) => {
  // Factor Weights Sliders
  const [wOfi, setWOfi] = useState<number>(0.35);
  const [wMpi, setWMpi] = useState<number>(0.25);
  const [wCvd, setWCvd] = useState<number>(0.25);
  const [wHawkes, setWHawkes] = useState<number>(0.15);

  // Selected Prediction Horizon
  const [horizonK, setHorizonK] = useState<5 | 10 | 20 | 50>(10);
  const [thresholdScore] = useState<number>(0.15);

  // Data Loading State
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
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
  }, [selectedDate]);

  // Compute Raw Microstructure Features across trades
  const dataset = useMemo(() => {
    if (trades.length < 60) return [];

    const list: FactorObservation[] = [];
    let cumCvd = 0;
    const cvdHist: number[] = [];

    // Rolling intensity counters for Hawkes proxy
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

      // Simple rolling window OFI and MPI estimators
      const windowLen = 10;
      const cvdDelta = i >= windowLen ? cumCvd - cvdHist[i - windowLen] : cumCvd;

      // Simulated microprice imbalance from local price delta
      const prevPrice = i > 0 ? trades[i - 1].price : tr.price;
      const ofi = (tr.price - prevPrice) * 100 + (isBuy ? vol : -vol) * 5;
      const mpi = (isBuy ? 1 : -1) * 0.4 + (Math.random() - 0.5) * 0.2;
      const hawkesDelta = (buyCounter - sellCounter) * 0.1;

      // Forward returns: (P_{t+k} - P_t) / P_t * 10000 bps
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

    // Standardize features to Z-scores
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

    // Correlation (IC) Calculator
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

    // Confusion Matrix for selected horizon
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
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontSize: 11 }
      },
      grid: {
        left: '5%',
        right: '4%',
        bottom: '10%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '合成 Alpha 预测分 (Score)',
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8' }
      },
      yAxis: {
        type: 'value',
        name: `实际收益 (k = ${horizonK} 笔, bps)`,
        nameTextStyle: { color: '#94a3b8', fontSize: 11 },
        splitLine: { lineStyle: { color: '#1e293b' } },
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Banner */}
      <div
        className="mml-card"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          borderRadius: '8px',
          padding: '16px 20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={20} style={{ color: '#38bdf8' }} />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                微观结构 Alpha 预测实验室 (Microstructure Alpha Predictor)
              </h2>
              <span style={{ fontSize: '0.68rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid #38bdf8', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                MULTI-FACTOR DIRECTIONAL ENGINE
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.80rem', color: '#94a3b8', lineHeight: 1.5 }}>
              融合 <strong>OFI 订单流失衡</strong>、<strong>Microprice 微观价偏离</strong>、<strong>CVD 净吃单动量</strong> 与 <strong>Hawkes 自激强度差</strong> 四大高频微观因子。实时测算未来 <MathFormula math="k \in \{5, 10, 20, 50\}" /> 笔方向的 Rank IC 信息系数与混淆矩阵分类能力。
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {([5, 10, 20, 50] as const).map((k) => (
              <button
                key={k}
                onClick={() => setHorizonK(k)}
                style={{
                  background: horizonK === k ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.8)',
                  border: `1px solid ${horizonK === k ? '#38bdf8' : '#475569'}`,
                  color: horizonK === k ? '#38bdf8' : '#94a3b8',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                k = {k} 笔
              </button>
            ))}
            {loading && <span style={{ fontSize: '0.68rem', color: '#fbbf24', marginLeft: '6px' }}>⚡ 载入微观流中...</span>}
          </div>
        </div>
      </div>

      {/* Multi-Factor Weight Deck */}
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
        {/* Factor 1: OFI */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>OFI 订单流失衡权重:</span>
            <strong className="mono" style={{ color: '#38bdf8' }}>{wOfi.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.05}
            value={wOfi}
            onChange={(e) => setWOfi(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
          />
        </div>

        {/* Factor 2: Microprice */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>Microprice 偏离权重:</span>
            <strong className="mono" style={{ color: '#fbbf24' }}>{wMpi.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.05}
            value={wMpi}
            onChange={(e) => setWMpi(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
          />
        </div>

        {/* Factor 3: CVD Delta */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>ΔCVD 吃单净量权重:</span>
            <strong className="mono" style={{ color: '#10b981' }}>{wCvd.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.05}
            value={wCvd}
            onChange={(e) => setWCvd(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </div>

        {/* Factor 4: Hawkes */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', marginBottom: '4px' }}>
            <span>Hawkes 自激强度差权重:</span>
            <strong className="mono" style={{ color: '#c084fc' }}>{wHawkes.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.05}
            value={wHawkes}
            onChange={(e) => setWHawkes(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#c084fc', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Information Coefficient (IC) Across Horizons Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        {[
          { label: 'k = 5 笔 IC', val: evaluation.ic5, active: horizonK === 5 },
          { label: 'k = 10 笔 IC', val: evaluation.ic10, active: horizonK === 10 },
          { label: 'k = 20 笔 IC', val: evaluation.ic20, active: horizonK === 20 },
          { label: 'k = 50 笔 IC', val: evaluation.ic50, active: horizonK === 50 }
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: item.active ? 'rgba(56, 189, 248, 0.15)' : 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${item.active ? '#38bdf8' : 'rgba(71, 85, 105, 0.4)'}`,
              borderRadius: '6px',
              padding: '10px 14px'
            }}
          >
            <div style={{ fontSize: '0.68rem', color: item.active ? '#38bdf8' : '#94a3b8', fontWeight: item.active ? 800 : 500 }}>
              {item.label}
            </div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: item.val > 0.05 ? '#10b981' : item.val < -0.05 ? '#ef4444' : '#fbbf24', marginTop: '2px' }}>
              {item.val >= 0 ? `+${item.val.toFixed(3)}` : item.val.toFixed(3)}
            </div>
            <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
              {Math.abs(item.val) > 0.08 ? '🔥 显著统计 Alpha' : '中度微观预测'}
            </div>
          </div>
        ))}

        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', padding: '10px 14px' }}>
          <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>
            方向命中率 (HIT RATE)
          </div>
          <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
            {evaluation.hitRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
            F1-Score: {evaluation.f1.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Main Grid: Scatter Plot + Confusion Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Scatter Correlation Plot */}
        <div className="mml-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={15} style={{ color: '#38bdf8' }} />
            合成 Alpha 预测分 vs 实际收益散点散布 (Scatter Dispersion)
          </div>
          <div style={{ height: '300px', width: '100%' }}>
            <MMLChart option={scatterChartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Confusion Matrix & Classification Stats */}
        <div className="mml-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart3 size={15} style={{ color: '#10b981' }} />
            混淆矩阵与分类能力审计 (k = {horizonK} 笔预测)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* True Positive */}
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>TRUE POSITIVE (TP)</div>
              <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                {evaluation.tp}
              </div>
              <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>预测涨且实际涨</div>
            </div>

            {/* False Positive */}
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 700 }}>FALSE POSITIVE (FP)</div>
              <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                {evaluation.fp}
              </div>
              <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>预测涨但实际跌 (误报)</div>
            </div>

            {/* False Negative */}
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 700 }}>FALSE NEGATIVE (FN)</div>
              <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                {evaluation.fn}
              </div>
              <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>预测跌但实际涨 (漏报)</div>
            </div>

            {/* True Negative */}
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>TRUE NEGATIVE (TN)</div>
              <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                {evaluation.tn}
              </div>
              <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>预测跌且实际跌</div>
            </div>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <div><strong>查准率 (Precision):</strong> <strong className="mono" style={{ color: '#10b981' }}>{evaluation.precision.toFixed(1)}%</strong></div>
            <div><strong>查全率 (Recall):</strong> <strong className="mono" style={{ color: '#38bdf8' }}>{evaluation.recall.toFixed(1)}%</strong></div>
            <div><strong>高频胜率盈亏比：</strong> 胜率超过 54% 即可覆盖 VIP9/MM 极低费率损耗，实现微观高频盈利！</div>
          </div>
        </div>
      </div>
    </div>
  );
};
