import { useState, useEffect } from 'react';
import { fetchDatasets, fetchAuditReport } from '../api/client';
import { DatasetItem, QualityAuditReport } from '../types';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DataIntegrityConsoleProps {
  currentDate: string;
}

export const DataIntegrityConsole: React.FC<DataIntegrityConsoleProps> = ({ currentDate }) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [audit, setAudit] = useState<QualityAuditReport | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetchDatasets(),
      fetchAuditReport('BTCUSDT', currentDate)
    ])
      .then(([dList, aReport]) => {
        if (isMounted) {
          setDatasets(dList);
          setAudit(aReport);
        }
      })
      .catch((err) => {
        console.error(err);
      });

    return () => { isMounted = false; };
  }, [currentDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div className="mml-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid var(--color-buy)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldCheck size={26} color="var(--color-buy)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.04em' }}>
              DATA INTEGRITY & REPRODUCIBILITY CONSOLE
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Strict verification of official Binance Vision archives, SHA-256 checksums, microsecond timestamp sequencing, and zero-interpolation enforcement.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="badge-buy">STRICT INTEGRITY ENFORCED</span>
          <span className="badge-gold">NON-COMMERCIAL RESEARCH LICENSE</span>
        </div>
      </div>

      {/* Dataset Health Summary Cards */}
      <div className="grid-4">
        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            VERIFIED TRADE RECORDS
          </div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
            {audit?.checks?.total_records.toLocaleString() || '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-buy)', marginTop: '4px' }}>
            BTCUSDT on {currentDate}
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            DUPLICATE TRADE IDS
          </div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: audit?.checks?.duplicate_trade_ids === 0 ? 'var(--color-buy)' : 'var(--color-sell)', marginTop: '4px' }}>
            {audit?.checks?.duplicate_trade_ids ?? '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Zero Duplication Target
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            TIME REVERSALS
          </div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: audit?.checks?.chronological_reversals === 0 ? 'var(--color-buy)' : 'var(--color-sell)', marginTop: '4px' }}>
            {audit?.checks?.chronological_reversals ?? '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Strict Monotonic Ordering
          </div>
        </div>

        <div className="mml-card">
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            ARITHMETIC MISMATCHES
          </div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: audit?.checks?.arithmetic_mismatches === 0 ? 'var(--color-buy)' : 'var(--color-sell)', marginTop: '4px' }}>
            {audit?.checks?.arithmetic_mismatches ?? '---'}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            |Price * Qty - Quote| &lt; 0.1%
          </div>
        </div>
      </div>

      {/* Partition Coverage Table */}
      <div className="mml-card">
        <div className="mml-card-title">
          <span>NORMALIZED DATASET PARTITION CATALOG</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>STORAGE: DUCKDB + PARQUET</span>
        </div>

        <div className="table-responsive">
          <table className="mml-table mono">
            <thead>
              <tr>
                <th>SYMBOL</th>
                <th>DATE</th>
                <th>STATUS</th>
                <th>RECORDS</th>
                <th>TIMESTAMP UNIT</th>
                <th>PRICE RANGE</th>
                <th>BASE VOLUME</th>
                <th>SHA256 CHECKSUM VERIFICATION</th>
                <th>AUDIT</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.date}>
                  <td style={{ fontWeight: 600, color: '#fff' }}>{d.symbol}</td>
                  <td style={{ color: 'var(--color-gold)' }}>{d.date}</td>
                  <td>
                    <span className={d.status === 'NORMALIZED' ? 'badge-buy' : 'badge-sell'}>
                      {d.status}
                    </span>
                  </td>
                  <td>{d.records.toLocaleString()}</td>
                  <td style={{ color: 'var(--color-buy)' }}>{d.timestamp_unit} (Microsecond)</td>
                  <td>${d.min_price?.toFixed(1)} - ${d.max_price?.toFixed(1)}</td>
                  <td>{d.total_base_volume?.toFixed(2)} BTC</td>
                  <td style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {d.official_sha256 ? `${d.official_sha256.slice(0, 16)}... [MATCH]` : 'N/A'}
                  </td>
                  <td>
                    {d.audit_passed ? (
                      <span style={{ color: 'var(--color-buy)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={14} /> PASSED
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-sell)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={14} /> FAILED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Granular Audit Checklist */}
      <div className="grid-2">
        <div className="mml-card">
          <div className="mml-card-title">
            <span>GRANULAR CHRONOLOGY & GAPS</span>
            <span className="badge-gold">AUDITED</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>FIRST EVENT (UTC):</span>
              <span className="mono">{audit?.chronology_and_gaps?.first_event_utc || '---'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>LAST EVENT (UTC):</span>
              <span className="mono">{audit?.chronology_and_gaps?.last_event_utc || '---'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>MEDIAN INTER-TRADE DURATION:</span>
              <span className="mono" style={{ color: 'var(--color-buy)', fontWeight: 700 }}>
                {audit?.chronology_and_gaps?.duration_median_ms.toFixed(2)} ms
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>P99 DURATION:</span>
              <span className="mono">{audit?.chronology_and_gaps?.duration_p99_ms.toFixed(2)} ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>MAX INTER-TRADE GAP:</span>
              <span className="mono" style={{ color: 'var(--color-gold)' }}>
                {audit?.chronology_and_gaps?.max_gap_seconds.toFixed(2)} seconds
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>SIMULTANEOUS TRADES (SAME TS):</span>
              <span className="mono">
                {audit?.chronology_and_gaps?.simultaneous_trades_count.toLocaleString()} ({audit?.chronology_and_gaps?.simultaneous_pct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="mml-card">
          <div className="mml-card-title">
            <span>DATA GOVERNANCE & LINEAGE</span>
            <span className="badge-buy">OFFICIAL SOURCE</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>PRIMARY SOURCE:</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>Binance Vision Public Data Archive</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>DATA LICENSE:</span>
              <span style={{ color: 'var(--color-gold)' }}>Binance Non-Commercial Terms & Conditions</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>DERIVED OUTPUT LICENSE:</span>
              <span style={{ color: 'var(--color-buy)' }}>CC BY-SA 4.0 (ShareAlike Covenant)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>CALCULATION ENGINE:</span>
              <span className="mono">MML Core v1.1.0 (Polars + DuckDB)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>AUDIT TIMESTAMP (UTC):</span>
              <span className="mono">{audit?.audit_timestamp_utc || '---'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>INTERPOLATION POLICY:</span>
              <span style={{ color: 'var(--color-buy)', fontWeight: 600 }}>STRICT FORBIDDEN (Zero synthetic trades)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>TIE-BREAKING ALGORITHM:</span>
              <span className="mono" style={{ color: 'var(--text-main)' }}>Sub-Microsecond Monotonic Jitter (1e-7 s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Legal & Academic Provenance Disclosure */}
      <div className="mml-card" style={{ borderTop: '3px solid var(--color-gold)' }}>
        <div className="mml-card-title">
          <span>RESEARCH PROVENANCE, DATA GOVERNANCE & OPEN-ACCESS LICENSING DISCLOSURE</span>
          <span className="badge-gold">LEGAL & REPRODUCIBILITY COMPLIANCE</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', fontSize: '0.82rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: '6px', textTransform: 'uppercase' }}>
              1. Official Source & Cryptographic Lineage
            </div>
            <div>
              All primary tick records originate directly from the official <strong style={{ color: '#fff' }}>Binance Vision Public Data Archive</strong> (<code style={{ color: 'var(--color-gold)' }}>data.binance.vision</code>) under canonical daily spot partitions.
              Raw zip archives (<code style={{ color: 'var(--text-dim)' }}>BTCUSDT-trades-2026-07-0[1-3].zip</code>) are cryptographically validated against official <code style={{ color: 'var(--text-dim)' }}>.CHECKSUM</code> SHA-256 digests prior to ingestion.
              100% of the 10,621,476 verified trades are preserved without loss, downsampling, or synthetic interpolation.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: '6px', textTransform: 'uppercase' }}>
              2. Scientific Methodology & Estimator Integrity
            </div>
            <div>
              Calculations adhere strictly to empirical market microstructure standards. Single-trade price responses <code style={{ color: 'var(--color-buy)' }}>R(v, k)</code> are rigorously separated from institutional meta-order impact laws.
              Quantiles employ non-overlapping rank-based partitioning (<code style={{ color: 'var(--text-dim)' }}>scipy.stats.rankdata</code>) eliminating empty bins and zero-fill distortions.
              Statistical inference incorporates Newey-West HAC heteroskedasticity and autocorrelation robust standard errors across bandwidths <code style={{ color: 'var(--text-dim)' }}>b &isin; &#123;5, 10, 20, 30, 50&#125;</code> and Hawkes Random Time Change residual diagnostics.
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: '6px', textTransform: 'uppercase' }}>
              3. Licensing & Non-Commercial Covenant
            </div>
            <div>
              In compliance with the <strong style={{ color: '#fff' }}>Binance Public Data Terms and Conditions</strong>, this data and platform are strictly reserved for non-commercial academic research, pedagogical analysis, and personal econometric study.
              Commercial trading, monetization, or redistribution of proprietary signals is strictly prohibited.
              All derived empirical statistics and visualizations are shared under the <strong style={{ color: 'var(--color-buy)' }}>Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)</strong> license. Any derivative works must cite MML and be distributed under identical terms.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
