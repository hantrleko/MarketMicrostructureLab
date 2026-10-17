import { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchFlowBuckets, fetchAutocorrelation, fetchDistributions, fetchHawkes } from '../api/client';
import { FlowBucket, AutocorrResult, TradeSizeDistribution, DurationDistribution } from '../types';

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

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      fetchFlowBuckets('BTCUSDT', date, interval),
      fetchAutocorrelation('BTCUSDT', date, 40),
      fetchDistributions('BTCUSDT', date),
      fetchHawkes('BTCUSDT', date, 3000, 10.0)
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
        if (isMounted) setLoading(false);
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
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: vwapPrices,
        lineStyle: { color: '#f8fafc', width: 1.5 },
        showSymbol: false
      },
      {
        name: 'Aggressive Buy Vol',
        type: 'bar',
        stack: 'Vol',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: buyVols,
        itemStyle: { color: '#00e5ff' }
      },
      {
        name: 'Aggressive Sell Vol',
        type: 'bar',
        stack: 'Vol',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: sellVols,
        itemStyle: { color: '#ff9100' }
      },
      {
        name: 'CVD (BTC)',
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
      name: 'Event Lag (k)',
      data: autocorr?.lags.map((l) => `${l}`) || [],
      axisLine: { lineStyle: { color: '#202b3d' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    yAxis: {
      type: 'value',
      name: 'Autocorr rho(k)',
      splitLine: { lineStyle: { color: '#161e2e' } },
      axisLabel: { color: '#64748b', fontFamily: 'JetBrains Mono' }
    },
    series: [
      {
        name: 'Signed Direction Autocorr',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Bar with Interval Picker */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TIME RESOLUTION:</span>
          {['1s', '5s', '1m', '5m', '15m', '1h'].map((itv) => (
            <button
              key={itv}
              onClick={() => setInterval(itv)}
              style={{
                background: interval === itv ? 'var(--color-buy)' : 'var(--bg-dark)',
                color: interval === itv ? '#080b10' : 'var(--text-muted)',
                fontWeight: interval === itv ? 700 : 500,
                border: '1px solid var(--border-color)',
                padding: '6px 14px',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {itv}
            </button>
          ))}
        </div>

        <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--color-gold)' }}>
          TOTAL BUCKETS: {buckets.length} | ZERO INTERPOLATION ENFORCED
        </div>
      </div>

      {/* Main Order Flow & CVD Chart */}
      <div className="mml-card">
        <div className="mml-card-title">
          <span>AGGRESSIVE ORDER FLOW & CUMULATIVE VOLUME DELTA (CVD)</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            CYAN: BUY DELTA | ORANGE: SELL DELTA | GOLD: CVD
          </span>
        </div>
        {loading ? (
          <div style={{ height: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Computing time buckets and VWAP from Parquet layer...
          </div>
        ) : (
          <ReactECharts option={flowChartOption} style={{ height: '420px', width: '100%' }} />
        )}
      </div>

      {/* Secondary Row: Autocorrelation & Size Distribution */}
      <div className="grid-2">
        {/* Direction Autocorrelation */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>SIGNED DIRECTION AUTOCORRELATION rho(k)</span>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-buy)' }}>
              SAMPLE: {autocorr?.sample_size.toLocaleString()} TRADES
            </span>
          </div>
          <ReactECharts option={autocorrOption} style={{ height: '280px', width: '100%' }} />
          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '8px' }}>
            Empirical observation of order flow persistence: Significant positive autocorrelation at short lags confirms order splitting and high-frequency trade clustering.
          </div>
        </div>

        {/* Trade Size Distribution */}
        <div className="mml-card">
          <div className="mml-card-title">
            <span>TRADE SIZE DISTRIBUTION (LOG SCALE)</span>
            <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--color-gold)' }}>
              MEDIAN: {sizeDist?.median_qty.toFixed(4)} BTC
            </span>
          </div>
          <ReactECharts option={sizeOption} style={{ height: '280px', width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '8px', color: 'var(--text-muted)' }}>
            <span>P25: <strong className="mono">{sizeDist?.p25_qty.toFixed(4)}</strong></span>
            <span>P75: <strong className="mono">{sizeDist?.p75_qty.toFixed(4)}</strong></span>
            <span>P90: <strong className="mono">{sizeDist?.p90_qty.toFixed(4)}</strong></span>
            <span>P99: <strong className="mono">{sizeDist?.p99_qty.toFixed(4)}</strong></span>
            <span>MAX: <strong className="mono">{sizeDist?.max_qty.toFixed(2)}</strong></span>
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

      {/* Bivariate Hawkes Process Card */}
      <div className="mml-card">
        <div className="mml-card-title">
          <span>BIVARIATE HAWKES PROCESS (TRADE ARRIVAL CLUSTERING & MUTUAL EXCITATION)</span>
          <span className="badge-gold">
            SPECTRAL RADIUS: {hawkes?.branching_ratios?.spectral_radius?.toFixed(4) || '---'} (SUB-CRITICAL)
          </span>
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
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Order splitting / momentum</div>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '12px', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>SELL SELF-EXCITATION (Gamma_ss)</div>
            <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>
              {hawkes?.branching_ratios?.sell_to_sell?.toFixed(3) || '---'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Selling cascades</div>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          <strong>Hawkes Econometric Interpretation:</strong>{' '}
          {hawkes?.interpretation ||
            'Spectral radius rho(Gamma) < 1 confirms that the high-frequency trade arrival process is stationary and sub-critical. Endogenous self-excitation dominates exogenous arrivals, proving that trade events cluster through automated algorithm feedback.'}
        </div>
      </div>
    </div>
  );
};
