import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchPriceResponse, fetchImpactModels } from '../api/client';
import { PriceResponseData, ImpactModelsData } from '../types';
import { CheckCircle, Scale } from 'lucide-react';

interface MarketImpactResearchProps {
  date: string;
}

export const MarketImpactResearch: React.FC<MarketImpactResearchProps> = ({ date }) => {
  const [horizon, setHorizon] = useState<number>(20);
  const [priceResp, setPriceResp] = useState<PriceResponseData | null>(null);
  const [modelsData, setModelsData] = useState<ImpactModelsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      fetchPriceResponse('BTCUSDT', date),
      fetchImpactModels('BTCUSDT', date, horizon)
    ])
      .then(([pr, md]) => {
        if (isMounted) {
          setPriceResp(pr);
          setModelsData(md);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [date, horizon]);

  // Price response curves
  const lags = priceResp?.curves.map((c) => `${c.lag_events}`) || [];
  const meanResp = priceResp?.curves.map((c) => c.response_bps) || [];
  const ciUpper = priceResp?.curves.map((c) => c.ci_upper_95) || [];
  const ciLower = priceResp?.curves.map((c) => c.ci_lower_95) || [];
  const buyResp = priceResp?.curves.map((c) => c.buy_response_bps) || [];
  const sellResp = priceResp?.curves.map((c) => c.sell_response_bps) || [];

  const responseOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' },
      formatter: (params: any) => {
        let str = `Lag: ${params[0].axisValue} events<br/>`;
        params.forEach((p: any) => {
          str += `${p.marker} ${p.seriesName}: <strong>${Number(p.value).toFixed(2)} bps</strong><br/>`;
        });
        return str;
      }
    },
    legend: {
      data: ['Mean Response R(k)', 'Buy Response', 'Sell Response', '95% HAC Upper', '95% HAC Lower'],
      textStyle: { color: '#94a3b8' },
      top: '2%'
    },
    grid: { left: '5%', right: '4%', top: '15%', bottom: '12%' },
    xAxis: {
      type: 'category',
      name: 'Event Lag k',
      data: lags,
      axisLine: { lineStyle: { color: '#202b3d' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    yAxis: {
      type: 'value',
      name: 'Response (basis points)',
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    series: [
      {
        name: 'Mean Response R(k)',
        type: 'line',
        data: meanResp,
        lineStyle: { color: '#ffd700', width: 2.5 },
        itemStyle: { color: '#ffd700' }
      },
      {
        name: 'Buy Response',
        type: 'line',
        data: buyResp,
        lineStyle: { color: '#00e5ff', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#00e5ff' }
      },
      {
        name: 'Sell Response',
        type: 'line',
        data: sellResp,
        lineStyle: { color: '#ff9100', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#ff9100' }
      },
      {
        name: '95% HAC Upper',
        type: 'line',
        data: ciUpper,
        lineStyle: { opacity: 0 },
        showSymbol: false
      },
      {
        name: '95% HAC Lower',
        type: 'line',
        data: ciLower,
        lineStyle: { opacity: 0 },
        areaStyle: { color: 'rgba(255, 215, 0, 0.12)' },
        showSymbol: false
      }
    ]
  };

  // Nonlinear Impact Scatter & Fits
  const empiricalScatter = modelsData?.binned_empirical.map((b) => [b.mean_volume, b.mean_response_bps]) || [];
  
  // Create fitted line points across volumes
  const volumes = modelsData?.binned_empirical.map((b) => b.mean_volume) || [];
  const linFit = volumes.map((q) => {
    const m = modelsData?.linear_model;
    return [q, m ? m.alpha + (m.beta || 0) * q : 0];
  });
  const logFit = volumes.map((q) => {
    const m = modelsData?.logarithmic_model;
    return [q, m ? m.alpha + (m.beta || 0) * Math.log(q) : 0];
  });
  const powerFit = volumes.map((q) => {
    const m = modelsData?.power_law_model;
    return [q, m ? m.alpha * Math.pow(q, m.gamma || 0.5) : 0];
  });

  const impactFitOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' }
    },
    legend: {
      data: ['Empirical Binned Impact', 'Linear Fit', 'Logarithmic Fit', 'Power Law Fit'],
      textStyle: { color: '#94a3b8' },
      top: '2%'
    },
    grid: { left: '5%', right: '4%', top: '15%', bottom: '12%' },
    xAxis: {
      type: 'value',
      name: 'Trade Size Q (BTC)',
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    yAxis: {
      type: 'value',
      name: `Impact @ k=${horizon} (bps)`,
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    series: [
      {
        name: 'Empirical Binned Impact',
        type: 'scatter',
        data: empiricalScatter,
        itemStyle: { color: '#00e5ff' },
        symbolSize: 10
      },
      {
        name: 'Linear Fit',
        type: 'line',
        data: linFit,
        lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' },
        showSymbol: false
      },
      {
        name: 'Logarithmic Fit',
        type: 'line',
        data: logFit,
        lineStyle: { color: '#ffd700', width: 2 },
        showSymbol: false
      },
      {
        name: 'Power Law Fit',
        type: 'line',
        data: powerFit,
        lineStyle: { color: '#ff9100', width: 2 },
        showSymbol: false
      }
    ]
  };

  const sqrtTest = modelsData?.power_law_model?.hypothesis_test_sqrt_law;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner: Methodology and Warning */}
      <div className="mml-card" style={{ borderLeft: '4px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Scale size={24} color="var(--color-gold)" />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
              ECONOMETRIC IDENTIFICATION & PRICE RESPONSE FRAMEWORK
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Trade-price response R(k) = E[eps_i * (ln P_i+k - ln P_i)]. Overlapping return windows are adjusted using Newey-West HAC covariance estimators.
            </div>
          </div>
        </div>

        {/* Horizon Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>HORIZON LAG k:</span>
          {[5, 10, 20, 50, 100].map((kVal) => (
            <button
              key={kVal}
              onClick={() => setHorizon(kVal)}
              style={{
                background: horizon === kVal ? 'var(--color-gold)' : 'var(--bg-dark)',
                color: horizon === kVal ? '#080b10' : 'var(--text-muted)',
                fontWeight: horizon === kVal ? 700 : 500,
                border: '1px solid var(--border-color)',
                padding: '4px 10px',
                borderRadius: '3px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)'
              }}
            >
              k={kVal}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Chart: Price Response Function */}
      <div className="mml-card">
        <div className="mml-card-title">
          <span>EVENT-TIME PRICE RESPONSE CURVES R(k) & 95% HAC CONFIDENCE BANDS</span>
          <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-buy)' }}>
            SAMPLE: {priceResp?.sample_size.toLocaleString()} REAL TRADES
          </span>
        </div>
        {loading ? (
          <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Calculating event-time price responses...
          </div>
        ) : (
          <ReactECharts option={responseOption} style={{ height: '360px', width: '100%' }} />
        )}
      </div>

      {/* Model Comparison & Hypothesis Testing Grid */}
      <div className="grid-2">
        {/* Empirical Scatter & Fitted Curves */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>IMPACT VS. TRADE SIZE: COMPETING SPECIFICATIONS</span>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-gold)' }}>
              HORIZON: k={horizon} EVENTS
            </span>
          </div>
          <ReactECharts option={impactFitOption} style={{ height: '320px', width: '100%' }} />
        </div>

        {/* Statistical Test Card & Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Square Root Law Hypothesis Card */}
          <div className="mml-card" style={{ border: '1px solid rgba(255, 215, 0, 0.4)' }}>
            <div className="mml-card-title">
              <span style={{ color: 'var(--color-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={16} /> SQUARE-ROOT LAW HYPOTHESIS TEST
              </span>
              <span className="badge-gold">H0: gamma = 0.5</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>ESTIMATED EXPONENT (gamma)</div>
                <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                  {modelsData?.power_law_model?.gamma?.toFixed(4) || 'N/A'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>t-STATISTIC vs 0.5</div>
                <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-buy)' }}>
                  {sqrtTest?.t_statistic?.toFixed(2) || 'N/A'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>p-VALUE</div>
                <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: sqrtTest?.reject_null_at_5pct ? 'var(--color-sell)' : 'var(--color-buy)' }}>
                  {sqrtTest?.p_value?.toFixed(4) || 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <strong>Hypothesis Conclusion:</strong>{' '}
              {sqrtTest?.reject_null_at_5pct
                ? 'Reject null hypothesis at 5% significance level. Real high-frequency tick data exhibits sub-square-root or concave logarithmic saturation rather than exact gamma=0.5.'
                : 'Cannot reject null hypothesis at 5% significance level. The empirical concave impact is consistent with square-root scaling within the confidence interval.'}
            </div>
          </div>

          {/* Model Specification Table */}
          <div className="mml-card">
            <div className="mml-card-title">
              <span>REGRESSION MODEL DIAGNOSTICS</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>NEWEY-WEST HAC ROBUST</span>
            </div>

            <table className="mml-table mono" style={{ fontSize: '0.76rem' }}>
              <thead>
                <tr>
                  <th>MODEL</th>
                  <th>COEFFICIENT / EXPONENT</th>
                  <th>HAC t-STAT</th>
                  <th>p-VAL</th>
                  <th>R^2</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Linear</td>
                  <td>beta = {modelsData?.linear_model?.beta?.toFixed(4)}</td>
                  <td>{modelsData?.linear_model?.beta_t_stat?.toFixed(2)}</td>
                  <td>{modelsData?.linear_model?.beta_p_value?.toFixed(4)}</td>
                  <td>{modelsData?.linear_model?.r_squared?.toFixed(4)}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--color-gold)' }}>Logarithmic</td>
                  <td style={{ color: 'var(--color-gold)' }}>beta = {modelsData?.logarithmic_model?.beta?.toFixed(4)}</td>
                  <td>{modelsData?.logarithmic_model?.beta_t_stat?.toFixed(2)}</td>
                  <td>{modelsData?.logarithmic_model?.beta_p_value?.toFixed(4)}</td>
                  <td>{modelsData?.logarithmic_model?.r_squared?.toFixed(4)}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--color-buy)' }}>Power Law</td>
                  <td style={{ color: 'var(--color-buy)' }}>gamma = {modelsData?.power_law_model?.gamma?.toFixed(4)}</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{modelsData?.power_law_model?.r_squared_binned?.toFixed(4)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
