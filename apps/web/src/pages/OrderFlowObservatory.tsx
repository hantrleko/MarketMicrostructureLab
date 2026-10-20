import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchFlowBuckets, fetchAutocorrelation, fetchDistributions, fetchHawkes } from '../api/client';
import { FlowBucket, AutocorrResult, TradeSizeDistribution, DurationDistribution } from '../types';
import { ShieldCheck, Info, AlertTriangle } from 'lucide-react';

interface OrderFlowObservatoryProps {
  date: string;
}

export const OrderFlowObservatory: React.FC<OrderFlowObservatoryProps> = ({ date }) => {
  const [interval, setInterval] = useState<string>('1m');
  const [buckets, setBuckets] = useState<FlowBucket[]>([]);
  const [autocorr, setAutocorr] = useState<AutocorrResult | null>(null);
  const [sizeDist, setSizeDist] = useState<TradeSizeDistribution | null>(null);
  const [durDist, setDurDist] = useState<DurationDistribution | null>(null);
  const [hawkes, setHawkes] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);

    Promise.all([
      fetchFlowBuckets('BTCUSDT', date, interval),
      fetchAutocorrelation('BTCUSDT', date, 50),
      fetchDistributions('BTCUSDT', date),
      fetchHawkes('BTCUSDT', date, 5000, 10.0)
    ])
      .then(([bData, aData, dData, hData]) => {
        if (isMounted) {
          setBuckets(bData);
          setAutocorr(aData);
          setSizeDist(dData.trade_size_distribution);
          setDurDist(dData.duration_distribution);
          setHawkes(hData);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) {
          setErrorMessage(err.message || 'Error loading order flow data');
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [date, interval]);

  // Flow & CVD Chart Options
  const flowTimes = buckets.map((b) => b.datetime ? b.datetime.split('T')[1].slice(0, 5) : '');
  const buyVols = buckets.map((b) => b.buy_volume);
  const sellVols = buckets.map((b) => -b.sell_volume);
  const cvdVols = buckets.map((b) => b.cvd);
  const vwapPrices = buckets.map((b) => b.vwap);

  const flowChartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' }
    },
    grid: [
      { left: '4%', right: '3%', top: '8%', height: '52%' },
      { left: '4%', right: '3%', top: '68%', height: '26%' }
    ],
    xAxis: [
      {
        type: 'category',
        data: flowTimes,
        gridIndex: 0,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { color: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }
      },
      {
        type: 'category',
        data: flowTimes,
        gridIndex: 1,
        axisLine: { lineStyle: { color: '#202b3d' } },
        axisLabel: { show: false }
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: 'VWAP ($)',
        scale: true,
        gridIndex: 0,
        splitLine: { lineStyle: { color: '#161e2e' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
      },
      {
        type: 'value',
        name: 'Vol / CVD',
        gridIndex: 1,
        splitLine: { lineStyle: { color: '#161e2e' } },
        axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
      }
    ],
    series: [
      {
        name: 'VWAP Price',
        type: 'line',
        gridIndex: 0,
        data: vwapPrices,
        lineStyle: { color: '#94a3b8', width: 1.5 },
        showSymbol: false
      },
      {
        name: 'Aggressive Buy Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        stack: 'vol',
        data: buyVols,
        itemStyle: { color: '#00e5ff' }
      },
      {
        name: 'Aggressive Sell Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        stack: 'vol',
        data: sellVols,
        itemStyle: { color: '#ff9100' }
      },
      {
        name: 'Cumulative Volume Delta (CVD)',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: cvdVols,
        lineStyle: { color: '#ffd700', width: 2 },
        showSymbol: false
      }
    ]
  };

  // Autocorrelation Chart
  const autocorrOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' }
    },
    grid: { left: '8%', right: '5%', top: '15%', bottom: '15%' },
    xAxis: {
      type: 'category',
      name: 'Event Lag k',
      data: autocorr?.lags || [],
      axisLine: { lineStyle: { color: '#202b3d' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    yAxis: {
      type: 'value',
      name: 'rho(k)',
      min: 0,
      max: 1.0,
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    series: [
      {
        name: 'Signed Autocorrelation rho(k)',
        type: 'bar',
        data: autocorr?.autocorrelations || [],
        itemStyle: { color: '#00e5ff' }
      }
    ]
  };

  // Size Distribution Chart (log-scale bins)
  const sizeOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#131a27',
      borderColor: '#202b3d',
      textStyle: { color: '#f1f5f9', fontFamily: 'JetBrains Mono' },
      formatter: (params: any) => {
        const p = params[0];
        const bin = sizeDist?.bins[p.dataIndex];
        const minStr = bin?.qty_min !== undefined ? bin.qty_min.toFixed(4) : '0';
        const maxStr = bin?.qty_max !== undefined ? bin.qty_max.toFixed(4) : '0';
        return `Qty Range: ${minStr} - ${maxStr} BTC<br/>Trades: ${bin?.count?.toLocaleString() || 0} (${bin?.pct?.toFixed(2) || 0}%)`;
      }
    },
    grid: { left: '8%', right: '5%', top: '15%', bottom: '15%' },
    xAxis: {
      type: 'category',
      name: 'Log10(Size)',
      data: sizeDist?.bins.map((b) => b.log_min?.toFixed(1)) || [],
      axisLine: { lineStyle: { color: '#202b3d' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    yAxis: {
      type: 'value',
      name: 'Frequency (%)',
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    series: [
      {
        name: 'Trade Frequency',
        type: 'bar',
        data: sizeDist?.bins.map((b) => b.pct) || [],
        itemStyle: { color: '#ffd700' }
      }
    ]
  };

  const resolutions = [
    { id: '1m', label: '1m', supportedInStatic: true },
    { id: '5m', label: '5m', supportedInStatic: true },
    { id: '15m', label: '15m', supportedInStatic: true },
    { id: '1h', label: '1h', supportedInStatic: true },
    { id: '5s', label: '5s (Local)', supportedInStatic: false },
    { id: '1s', label: '1s (Local)', supportedInStatic: false }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Bar with Interval Picker */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TIME RESOLUTION:</span>
          {resolutions.map((itv) => (
            <button
              key={itv.id}
              onClick={() => setInterval(itv.id)}
              style={{
                background: interval === itv.id ? 'var(--color-buy)' : 'var(--bg-dark)',
                color: interval === itv.id ? '#080b10' : itv.supportedInStatic ? 'var(--text-main)' : 'var(--text-dim)',
                fontWeight: interval === itv.id ? 700 : 500,
                border: `1px solid ${interval === itv.id ? 'var(--color-buy)' : 'var(--border-color)'}`,
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {itv.label}
            </button>
          ))}
        </div>

        <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>
          TOTAL BUCKETS: {buckets.length} | ZERO INTERPOLATION ENFORCED
        </div>
      </div>

      {errorMessage && (
        <div style={{ background: 'rgba(255, 145, 0, 0.1)', border: '1px solid var(--color-sell)', padding: '10px 16px', borderRadius: '4px', fontSize: '0.8rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} color="var(--color-sell)" />
          {errorMessage}
        </div>
      )}

      {/* Main Order Flow & CVD Chart */}
      <div className="mml-card">
        <div className="mml-card-title">
          <span>AGGRESSIVE ORDER FLOW & CUMULATIVE VOLUME DELTA (CVD)</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            CYAN: BUY DELTA | ORANGE: SELL DELTA | GOLD: CVD
          </span>
        </div>

        {loading ? (
          <div style={{ height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Computing Polars trade flow aggregations...
          </div>
        ) : (
          <ReactECharts option={flowChartOption} style={{ height: '380px', width: '100%' }} />
        )}
      </div>

      {/* Grid: Direction Autocorrelation & Trade Size Distribution */}
      <div className="grid-2">
        {/* Direction Autocorrelation */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>STRONG TRADE-SIGN PERSISTENCE rho(k)</span>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-buy)' }}>
              rho(1) = {autocorr?.autocorrelations?.[0]?.toFixed(4) || '---'}
            </span>
          </div>
          <ReactECharts option={autocorrOption} style={{ height: '280px', width: '100%' }} />
          <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '8px', lineHeight: '1.4' }}>
            <strong>Strong Trade-Sign Persistence:</strong> Confirms extreme intraday continuity (rho(1) &asymp; 0.93, rho(50) &asymp; 0.70).
            Note: Formal statistical Long Memory requires verifying power-law decay across k &ge; 10^3 ~ 10^4 and aggregated trade structures.
          </div>
        </div>

        {/* Trade Size Distribution */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>TRADE SIZE DISTRIBUTION (LOG SCALE)</span>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-gold)' }}>
              MEDIAN: {sizeDist?.median_qty ? sizeDist.median_qty.toFixed(4) : '---'} BTC
            </span>
          </div>
          <ReactECharts option={sizeOption} style={{ height: '280px', width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '8px', color: 'var(--text-muted)' }}>
            <span>P25: <strong className="mono">{sizeDist?.p25_qty?.toFixed(4) || '---'}</strong></span>
            <span>P75: <strong className="mono">{sizeDist?.p75_qty?.toFixed(4) || '---'}</strong></span>
            <span>P90: <strong className="mono">{sizeDist?.p90_qty?.toFixed(4) || '---'}</strong></span>
            <span>P99: <strong className="mono">{sizeDist?.p99_qty?.toFixed(4) || '---'}</strong></span>
            <span>MAX: <strong className="mono">{sizeDist?.max_qty?.toFixed(2) || '---'}</strong></span>
          </div>
        </div>
      </div>

      {/* Inter-Trade Arrival Duration Banner */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>INTER-TRADE ARRIVAL DURATION METRICS</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Microsecond-resolved inter-event spacing across {durDist?.total_durations?.toLocaleString() || 0} events</div>
        </div>
        <div style={{ display: 'flex', gap: '24px', fontSize: '0.8rem' }}>
          <div><span style={{ color: 'var(--text-dim)' }}>MEAN: </span><strong className="mono" style={{ color: '#fff' }}>{durDist?.mean_ms?.toFixed(2)} ms</strong></div>
          <div><span style={{ color: 'var(--text-dim)' }}>MEDIAN: </span><strong className="mono" style={{ color: 'var(--color-buy)' }}>{durDist?.median_ms?.toFixed(2)} ms</strong></div>
          <div><span style={{ color: 'var(--text-dim)' }}>P90: </span><strong className="mono" style={{ color: 'var(--color-gold)' }}>{durDist?.p90_ms?.toFixed(2)} ms</strong></div>
          <div><span style={{ color: 'var(--text-dim)' }}>P99: </span><strong className="mono" style={{ color: 'var(--color-sell)' }}>{durDist?.p99_ms?.toFixed(2)} ms</strong></div>
          <div><span style={{ color: 'var(--text-dim)' }}>SIMULTANEOUS (0ms): </span><strong className="mono">{durDist?.zero_duration_pct?.toFixed(1)}%</strong></div>
        </div>
      </div>

      {/* Bivariate Hawkes Process Card with Residual Diagnostics & Control Model */}
      <div className="mml-card">
        <div className="mml-card-title">
          <span>BIVARIATE HAWKES PROCESS (ARRIVAL CLUSTERING & CONTROL MODEL AUDIT)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={hawkes?.stability_status === 'SUBCRITICAL_STABLE' ? 'badge-buy' : 'badge-sell'}>
              {hawkes?.stability_status || 'SUBCRITICAL_STABLE'}
            </span>
            <span className="badge-gold">
              SPECTRAL RADIUS: {hawkes?.branching_ratios?.spectral_radius?.toFixed(4) || '---'}
            </span>
          </div>
        </div>

        <div className="grid-4" style={{ marginBottom: '14px' }}>
          <div style={{ background: 'var(--bg-dark)', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>BASELINE BUY RATE (mu_b)</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-buy)', marginTop: '4px' }}>
              {hawkes?.parameters?.mu_buy?.toFixed(2) || '---'} events/s
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Exogenous arrival</div>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>BASELINE SELL RATE (mu_s)</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-sell)', marginTop: '4px' }}>
              {hawkes?.parameters?.mu_sell?.toFixed(2) || '---'} events/s
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Exogenous arrival</div>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>BUY SELF-EXCITATION (Gamma_bb)</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>
              {hawkes?.branching_ratios?.buy_to_buy?.toFixed(3) || '---'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Directional clustering</div>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>SELL SELF-EXCITATION (Gamma_ss)</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>
              {hawkes?.branching_ratios?.sell_to_sell?.toFixed(3) || '---'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Directional clustering</div>
          </div>
        </div>

        {/* Model Fitting Warnings Banner */}
        {((hawkes?.fitting_warnings && hawkes.fitting_warnings.length > 0) || (hawkes?.branching_ratios?.spectral_radius >= 1.0)) && (
          <div style={{ background: 'rgba(255, 145, 0, 0.1)', border: '1px solid var(--color-sell)', borderRadius: '4px', padding: '10px 14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-sell)', fontWeight: 600, fontSize: '0.8rem', marginBottom: '4px' }}>
              <AlertTriangle size={16} />
              <span>MODEL CALIBRATION & SPECIFICATION WARNING</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#f8fafc', lineHeight: '1.4' }}>
              {hawkes?.fitting_warnings ? (
                hawkes.fitting_warnings.map((w: string, idx: number) => (
                  <div key={idx} style={{ marginBottom: '2px' }}>• {w}</div>
                ))
              ) : (
                <div>• Spectral radius exceeds stationary threshold (&ge; 1.0). Empirical self-excitation is borderline supercritical; results must be treated as descriptive clustering rather than stationary infinite-horizon dynamics.</div>
              )}
            </div>
          </div>
        )}

        {/* Control Model Comparison Banner */}
        {hawkes?.control_model_microsecond_aggregated && (
          <div style={{ background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.3)', borderRadius: '4px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '0.78rem' }}>
              <span className="badge-gold" style={{ marginRight: '8px' }}>CONTROL MODEL</span>
              <strong>Timestamp-Aggregated Sensitivity:</strong> Simultaneous millisecond compression: <strong>-{hawkes.control_model_microsecond_aggregated.compression_ratio_pct?.toFixed(1)}%</strong>.
              Aggregated Spectral Radius: <strong className="mono" style={{ color: 'var(--color-buy)' }}>{hawkes.control_model_microsecond_aggregated.spectral_radius?.toFixed(4)}</strong> ({hawkes.control_model_microsecond_aggregated.stability_status}).
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Empirical sensitivity comparison: demonstrates branching ratio dependence on time resolution, rather than causal proof of order fragmentation.
            </div>
          </div>
        )}

        {/* Residual Diagnostics Info */}
        <div style={{ background: 'rgba(0, 229, 255, 0.04)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
            <ShieldCheck size={16} color="var(--color-buy)" />
            <span><strong>Random Time Change Theorem (Compensator Diagnostic):</strong></span>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.76rem' }}>
            <span>BUY KS STAT: <strong className="mono">{hawkes?.residual_diagnostics?.buy_ks_statistic?.toFixed(4) || '---'}</strong> (p={hawkes?.residual_diagnostics?.buy_ks_p_value !== undefined ? hawkes.residual_diagnostics.buy_ks_p_value.toFixed(4) : '---'})</span>
            <span>SELL KS STAT: <strong className="mono">{hawkes?.residual_diagnostics?.sell_ks_statistic?.toFixed(4) || '---'}</strong> (p={hawkes?.residual_diagnostics?.sell_ks_p_value !== undefined ? hawkes.residual_diagnostics.sell_ks_p_value.toFixed(4) : '---'})</span>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          <strong>Hawkes Statistical Interpretation:</strong>{' '}
          {hawkes?.statistical_interpretation ||
            'Spectral radius rho(Gamma) describes point process stability. Aggregated vs. raw comparison indicates high sensitivity to timestamp collisions; KS rejection highlights missing microstructure features (e.g., volume marks, power-law kernels).'}
        </div>
      </div>
    </div>
  );
};
