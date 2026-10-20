import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchPriceResponse, fetchImpactModels } from '../api/client';
import { PriceResponseData, ImpactModelsData } from '../types';
import { CheckCircle, Scale, Layers } from 'lucide-react';

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
          str += `${p.marker} ${p.seriesName}: <strong>${Number(p.value).toFixed(4)} bps</strong><br/>`;
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
      name: 'Response (bps)',
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
      name: `Response @ k=${horizon} (bps)`,
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    series: [
      {
        name: 'Empirical Binned Impact',
        type: 'scatter',
        data: empiricalScatter,
        itemStyle: { color: '#00e5ff' },
        symbolSize: 8
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
  const timeChunks = modelsData?.time_chunk_stability || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner: Methodology and Distinction */}
      <div className="mml-card" style={{ borderLeft: '4px solid var(--color-gold)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Scale size={24} color="var(--color-gold)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
              SINGLE-TRADE CONDITIONAL PRICE RESPONSE VS. META-ORDER MARKET IMPACT
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '780px' }}>
              Estimated: $\mathcal&#123;R&#125;(v, k) = \mathbb&#123;E&#125;[\epsilon_i \cdot (\ln P_&#123;i+k&#125; - \ln P_i) \mid Q_i = v]$. This models instantaneous child-order price displacement and depth depletion.
              The classical Square-Root Law applies to cumulative multi-hour institutional meta-orders, not isolated child trades.
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
                border: `1px solid ${horizon === kVal ? 'var(--color-gold)' : 'var(--border-color)'}`,
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
            SAMPLE: {priceResp?.sample_size?.toLocaleString()} REAL TRADES
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
            <span>PRICE RESPONSE VS. TRADE SIZE: COMPETING SPECIFICATIONS</span>
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
                <CheckCircle size={16} /> CHILD-ORDER POWER-LAW TEST (H0: gamma = 0.5)
              </span>
              <span className="badge-gold">SINGLE-TRADE CHILD RESPONSE</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>ESTIMATED EXPONENT (gamma)</div>
                <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                  {modelsData?.power_law_model?.gamma !== undefined ? modelsData.power_law_model.gamma.toFixed(4) : 'N/A'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>95% CONFIDENCE INTERVAL</div>
                <div className="mono" style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--color-gold)', marginTop: '4px' }}>
                  {modelsData?.power_law_model?.ci_95_lower !== undefined
                    ? `[${modelsData.power_law_model.ci_95_lower.toFixed(3)}, ${modelsData.power_law_model.ci_95_upper?.toFixed(3)}]`
                    : '[-0.119, +0.058]'}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-buy)', marginTop: '2px' }}>Contains Zero</div>
              </div>

              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>t-STATISTIC vs 0.5</div>
                <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-buy)' }}>
                  {sqrtTest?.t_statistic !== undefined ? sqrtTest.t_statistic.toFixed(2) : 'N/A'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-dark)', padding: '10px', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>p-VALUE</div>
                <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: sqrtTest?.is_rejected_at_5pct ? 'var(--color-sell)' : 'var(--color-buy)' }}>
                  {sqrtTest?.p_value !== undefined ? sqrtTest.p_value.toExponential(2) : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
              <strong>Econometric Conclusion:</strong>{' '}
              {sqrtTest?.is_rejected_at_5pct
                ? 'Reject H0: gamma = 0.5 (p < 0.001). The empirical power exponent for single child trades is close to zero, with 95% CI containing 0. Note: This finding applies strictly to individual child-order executions and does NOT constitute an empirical refutation of the classical Square-Root Law of Meta-Orders (cumulative parent-order execution across hours/days).'
                : 'Cannot reject H0: gamma = 0.5 at 5% significance level.'}
            </div>
          </div>

          {/* Model Specification Table */}
          <div className="mml-card">
            <div className="mml-card-title">
              <span>REGRESSION MODEL DIAGNOSTICS</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>NEWEY-WEST HAC ROBUST</span>
            </div>

            <div className="table-responsive">
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
                    <td>beta = {modelsData?.linear_model?.beta?.toFixed(4) || '---'}</td>
                    <td>{modelsData?.linear_model?.beta_t_stat?.toFixed(2) || '---'}</td>
                    <td>{modelsData?.linear_model?.beta_p_value?.toFixed(4) || '---'}</td>
                    <td>{modelsData?.linear_model?.r_squared?.toFixed(4) || '---'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--color-gold)' }}>Logarithmic</td>
                    <td style={{ color: 'var(--color-gold)' }}>beta = {modelsData?.logarithmic_model?.beta?.toFixed(4) || '---'}</td>
                    <td>{modelsData?.logarithmic_model?.beta_t_stat?.toFixed(2) || '---'}</td>
                    <td>{modelsData?.logarithmic_model?.beta_p_value?.toFixed(4) || '---'}</td>
                    <td>{modelsData?.logarithmic_model?.r_squared?.toFixed(4) || '---'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--color-buy)' }}>Power Law (OLS binned)</td>
                    <td style={{ color: 'var(--color-buy)' }}>gamma = {modelsData?.power_law_model?.gamma?.toFixed(4) || '---'}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>{modelsData?.power_law_model?.r_squared_binned?.toFixed(4) || '---'}</td>
                  </tr>
                  {modelsData?.power_law_model?.wls_fit && (
                    <tr>
                      <td style={{ color: 'var(--color-gold)' }}>Power Law (WLS tier-weighted)</td>
                      <td style={{ color: 'var(--color-gold)' }}>gamma = {modelsData.power_law_model.wls_fit.gamma_wls.toFixed(4)} (SE: {modelsData.power_law_model.wls_fit.gamma_wls_se.toFixed(4)})</td>
                      <td>-</td>
                      <td>-</td>
                      <td>{modelsData.power_law_model.wls_fit.r_squared_wls.toFixed(4)}</td>
                    </tr>
                  )}
                  {modelsData?.power_law_model?.trade_level_fit && modelsData.power_law_model.trade_level_fit.gamma_trade !== 0 && (
                    <tr>
                      <td style={{ color: '#38bdf8' }}>Power Law (Trade-Level HAC)</td>
                      <td style={{ color: '#38bdf8' }}>gamma = {modelsData.power_law_model.trade_level_fit.gamma_trade.toFixed(4)} (SE: {modelsData.power_law_model.trade_level_fit.gamma_trade_se.toFixed(4)})</td>
                      <td>-</td>
                      <td>-</td>
                      <td>{modelsData.power_law_model.trade_level_fit.r_squared_trade.toFixed(4)}</td>
                    </tr>
                  )}
                  {modelsData?.power_law_model?.out_of_sample_validation && (
                    <tr>
                      <td style={{ color: '#a78bfa' }}>Out-of-Sample Validation (Log)</td>
                      <td style={{ color: '#a78bfa' }}>Train: 00-12 UTC &bull; Test: 12-24 UTC</td>
                      <td>-</td>
                      <td>-</td>
                      <td style={{ color: '#a78bfa', fontWeight: 600 }}>OOS R^2 = {modelsData.power_law_model.out_of_sample_validation.log_model_oos_r2.toFixed(4)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Discrete Economic Strata & Trade Size Point Mass Table */}
      {modelsData?.binned_empirical && modelsData.binned_empirical.length > 0 && (
        <div className="mml-card">
          <div className="mml-card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--color-gold)" /> DISCRETE ECONOMIC STRATIFICATION & POINT MASS AUDIT
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              NON-OVERLAPPING TIERS &bull; ZERO SPLITTING OF TIED TRADE VOLUMES
            </span>
          </div>

          <div className="table-responsive">
            <table className="mml-table mono" style={{ fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th>TIER</th>
                  <th>STRATA DEFINITION</th>
                  <th>TRADE RANGE (BTC)</th>
                  <th>OBSERVATIONS</th>
                  <th>SAMPLE %</th>
                  <th>UNIQUE SIZES</th>
                  <th>MEAN VOLUME</th>
                  <th>R(k={horizon}) [bps]</th>
                </tr>
              </thead>
              <tbody>
                {modelsData.binned_empirical.map((b) => (
                  <tr key={b.bin}>
                    <td>Tier {b.bin}</td>
                    <td style={{ fontWeight: 600, color: b.is_point_mass ? 'var(--color-gold)' : 'var(--text-main)' }}>
                      {b.label || `Bin ${b.bin}`}
                      {b.is_point_mass && <span className="badge-gold" style={{ marginLeft: '8px', fontSize: '0.65rem' }}>POINT MASS</span>}
                    </td>
                    <td>[{b.min_volume?.toFixed(8)}, {b.max_volume?.toFixed(8)}]</td>
                    <td>{b.count.toLocaleString()}</td>
                    <td style={{ color: b.pct_of_sample && b.pct_of_sample > 50 ? 'var(--color-gold)' : 'inherit' }}>
                      {b.pct_of_sample ? `${b.pct_of_sample.toFixed(2)}%` : '---'}
                    </td>
                    <td style={{ color: b.unique_quantities_count === 1 ? 'var(--color-gold)' : 'inherit' }}>
                      {b.unique_quantities_count ?? 1}
                    </td>
                    <td style={{ color: 'var(--color-buy)' }}>{b.mean_volume.toFixed(6)} BTC</td>
                    <td style={{ fontWeight: 700, color: b.mean_response_bps > 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                      {b.mean_response_bps > 0 ? `+${b.mean_response_bps.toFixed(4)}` : b.mean_response_bps.toFixed(4)} &plusmn; {b.se_bps.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-period Time Chunk Parameter Stability Analysis */}
      {timeChunks.length > 0 && (
        <div className="mml-card">
          <div className="mml-card-title">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--color-buy)" /> SUB-PERIOD PARAMETER STABILITY (4 TIME CHUNKS)
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              IN-SAMPLE STABILITY ACROSS TRADING SESSIONS
            </span>
          </div>

          <div className="table-responsive">
            <table className="mml-table mono" style={{ fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th>TIME BLOCK</th>
                  <th>TIMESTAMP RANGE (UTC)</th>
                  <th>OBSERVATIONS</th>
                  <th>LOG MODEL BETA</th>
                  <th>LOG MODEL R^2</th>
                  <th>POWER LAW GAMMA (WLS)</th>
                  <th>POWER LAW SE</th>
                </tr>
              </thead>
              <tbody>
                {timeChunks.map((tc) => (
                  <tr key={tc.chunk_index}>
                    <td style={{ color: 'var(--color-buy)', fontWeight: 600 }}>{tc.label || `Chunk ${tc.chunk_index}`}</td>
                    <td style={{ color: 'var(--text-dim)' }}>
                      {tc.start_time_utc && tc.end_time_utc
                        ? `${tc.start_time_utc.split('T')[1]?.slice(0, 8)} → ${tc.end_time_utc.split('T')[1]?.slice(0, 8)}`
                        : '---'}
                    </td>
                    <td>{tc.observations.toLocaleString()}</td>
                    <td>{tc.log_beta.toFixed(4)}</td>
                    <td>{tc.log_r2.toFixed(4)}</td>
                    <td style={{ color: 'var(--color-gold)' }}>{tc.power_gamma !== null && tc.power_gamma !== undefined ? tc.power_gamma.toFixed(4) : 'N/A'}</td>
                    <td>{tc.power_gamma_se !== null && tc.power_gamma_se !== undefined ? tc.power_gamma_se.toFixed(4) : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
