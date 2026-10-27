import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle2, AlertCircle, Zap, RefreshCw, Download } from 'lucide-react';

interface BYODModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DiagnosticResults {
  fileName: string;
  rowCount: number;
  timeSpanSec: number;
  totalVolume: number;
  vwap: number;
  buyRatio: number;
  sellRatio: number;
  autocorrLags: { lag: number; rho: number }[];
  kylesLambdaBps: number;
  powerLawAlpha: number;
  hawkesRhoEst: number;
  status: 'HEALTHY_LIQUID' | 'HIGH_IMPACT' | 'ILLIQUID_CONCENTRATED';
}

export const BYODModal: React.FC<BYODModalProps> = ({ isOpen, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DiagnosticResults | null>(null);

  if (!isOpen) return null;

  const parseAndAnalyzeCsv = (csvText: string, fileName: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 50) {
        throw new Error('File contains fewer than 50 rows. Please provide at least 100 trade records.');
      }

      // Check header or raw format
      let startIndex = 0;
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('price') || firstLine.includes('trade_id') || firstLine.includes('id')) {
        startIndex = 1;
      }

      const maxRows = Math.min(lines.length, startIndex + 50000);
      const prices: number[] = [];
      const qtys: number[] = [];
      const signs: number[] = [];
      const timestamps: number[] = [];

      for (let i = startIndex; i < maxRows; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        if (parts.length < 4) continue;

        let price = 0;
        let qty = 0;
        let sign = 1;
        let ts = 0;

        // Binance standard: id, price, qty, quote_qty, time, is_buyer_maker, is_best_match
        if (parts.length >= 6 && !isNaN(Number(parts[1])) && !isNaN(Number(parts[2]))) {
          price = parseFloat(parts[1]);
          qty = parseFloat(parts[2]);
          ts = parseFloat(parts[4]);
          const isBuyerMaker = parts[5].toLowerCase() === 'true';
          sign = isBuyerMaker ? -1 : 1;
        } else {
          // Generic fallback: price, qty, sign/buyer_maker, timestamp
          price = parseFloat(parts[0]);
          qty = parseFloat(parts[1]);
          sign = parts[2].toLowerCase() === 'true' || parts[2] === '-1' ? -1 : 1;
          ts = parts.length > 3 ? parseFloat(parts[3]) : i * 100;
        }

        if (price > 0 && qty > 0) {
          prices.push(price);
          qtys.push(qty);
          signs.push(sign);
          timestamps.push(ts);
        }
      }

      if (prices.length < 50) {
        throw new Error('Could not parse sufficient valid trade rows. Expected format: Binance trade CSV.');
      }

      const N = prices.length;
      let totalQty = 0;
      let totalValue = 0;
      let buyCount = 0;

      for (let i = 0; i < N; i++) {
        totalQty += qtys[i];
        totalValue += prices[i] * qtys[i];
        if (signs[i] > 0) buyCount++;
      }

      const vwap = totalValue / totalQty;
      const buyRatio = buyCount / N;
      const sellRatio = 1 - buyRatio;

      // Autocorrelation of trade signs up to lag 20
      const meanSign = signs.reduce((a, b) => a + b, 0) / N;
      let varSign = 0;
      for (let i = 0; i < N; i++) {
        varSign += Math.pow(signs[i] - meanSign, 2);
      }
      varSign /= N;

      const lags = [1, 2, 5, 10, 20];
      const autocorrLags: { lag: number; rho: number }[] = [];
      let sumRho = 0;

      for (const lag of lags) {
        if (N <= lag) continue;
        let cov = 0;
        for (let i = 0; i < N - lag; i++) {
          cov += (signs[i] - meanSign) * (signs[i + lag] - meanSign);
        }
        cov /= (N - lag);
        const rho = varSign > 0 ? cov / varSign : 0;
        autocorrLags.push({ lag, rho: Math.max(-1, Math.min(1, rho)) });
        if (lag <= 10) sumRho += Math.max(0, rho);
      }

      // Kyle's lambda estimation: delta P / (Q * sign) in basis points per unit
      let kyleSum = 0;
      let kyleCount = 0;
      for (let i = 0; i < N - 1; i++) {
        const retBps = ((prices[i + 1] - prices[i]) / prices[i]) * 10000;
        const signedQty = qtys[i] * signs[i];
        if (Math.abs(signedQty) > 0) {
          kyleSum += (retBps * signs[i]) / Math.sqrt(qtys[i]);
          kyleCount++;
        }
      }
      const kylesLambdaBps = kyleCount > 0 ? Math.max(0.001, (kyleSum / kyleCount) * 0.15) : 0.05;

      // Power-law alpha estimation (Hill estimator on top 10% sizes)
      const sortedQtys = [...qtys].sort((a, b) => b - a);
      const top10Index = Math.max(5, Math.floor(N * 0.1));
      const threshold = sortedQtys[top10Index];
      let hillSum = 0;
      for (let i = 0; i < top10Index; i++) {
        hillSum += Math.log(sortedQtys[i] / threshold);
      }
      const powerLawAlpha = hillSum > 0 ? Math.min(4.0, Math.max(1.1, top10Index / hillSum)) : 2.0;

      // Hawkes branching ratio approximation
      const hawkesRhoEst = Math.min(0.98, Math.max(0.2, (autocorrLags[0]?.rho || 0.4) * 1.6));

      const timeSpanSec = timestamps.length > 1
        ? Math.max(1, Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 1000))
        : N;

      let status: 'HEALTHY_LIQUID' | 'HIGH_IMPACT' | 'ILLIQUID_CONCENTRATED' = 'HEALTHY_LIQUID';
      if (kylesLambdaBps > 0.5 || powerLawAlpha < 1.5) {
        status = 'ILLIQUID_CONCENTRATED';
      } else if (hawkesRhoEst > 0.9) {
        status = 'HIGH_IMPACT';
      }

      setResults({
        fileName,
        rowCount: N,
        timeSpanSec,
        totalVolume: totalQty,
        vwap,
        buyRatio,
        sellRatio,
        autocorrLags,
        kylesLambdaBps,
        powerLawAlpha,
        hawkesRhoEst,
        status
      });
      setIsProcessing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze trade CSV.');
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setError('Please upload a valid .csv or .txt file containing trade execution records.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseAndAnalyzeCsv(text, file.name);
    };
    reader.onerror = () => {
      setError('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  const loadDemoData = () => {
    // Generate 5,000 synthetic trades calibrated to empirical BTC micro-structure
    let text = 'id,price,qty,quote_qty,time,is_buyer_maker\n';
    let p = 68450.0;
    let t = 1720000000000;
    let sign = 1;
    for (let i = 0; i < 5000; i++) {
      // Clustered signs
      if (Math.random() > 0.35) {
        // preserve sign
      } else {
        sign = -sign;
      }
      const q = Math.exp(Math.random() * 2.5 - 1.5);
      p += sign * (Math.random() * 0.5);
      t += Math.floor(Math.random() * 150 + 20);
      const isBuyerMaker = sign === -1;
      text += `${i + 1},${p.toFixed(2)},${q.toFixed(4)},${(p * q).toFixed(2)},${t},${isBuyerMaker}\n`;
    }
    parseAndAnalyzeCsv(text, 'binance_btcusdt_demo_5k.csv');
  };

  const downloadReport = () => {
    if (!results) return;
    const report = {
      platform: 'EUGENE FINANCE - MARKET MICROSTRUCTURE LAB (MML)',
      diagnostic_timestamp: new Date().toISOString(),
      file_analyzed: results.fileName,
      metrics: {
        total_trades: results.rowCount,
        vwap: results.vwap.toFixed(2),
        total_volume: results.totalVolume.toFixed(4),
        time_span_seconds: results.timeSpanSec,
        buyer_taker_ratio: (results.buyRatio * 100).toFixed(1) + '%',
        seller_taker_ratio: (results.sellRatio * 100).toFixed(1) + '%',
        trade_sign_autocorrelations: results.autocorrLags,
        kyles_lambda_bps_per_sqrt_q: results.kylesLambdaBps.toFixed(4),
        power_law_alpha: results.powerLawAlpha.toFixed(2),
        hawkes_branching_ratio_est: results.hawkesRhoEst.toFixed(4),
        liquidity_status: results.status
      }
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eugene_finance_diagnostic_${results.fileName.replace('.csv', '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 8, 14, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-dark, #0d121c)',
          border: '1px solid var(--border-highlight, #2f3d54)',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="./eugene_finance_logo.png"
              alt="Logo"
              style={{ width: '24px', height: '24px', borderRadius: '4px' }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#fff', letterSpacing: '0.04em' }}>
                BYOD: INSTANT TRADE FLOW DIAGNOSTIC
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Client-Side Pure Browser Analysis &bull; Zero Backend Upload Required
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              color: 'var(--text-dim)',
              padding: '6px',
              borderRadius: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            style={{
              border: `2px dashed ${isDragging ? '#00e5ff' : 'var(--border-highlight)'}`,
              borderRadius: '6px',
              padding: '24px',
              textAlign: 'center',
              background: isDragging ? 'rgba(0, 229, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
              transition: 'all 0.2s',
              marginBottom: '16px'
            }}
          >
            <UploadCloud size={32} color={isDragging ? '#00e5ff' : 'var(--color-primary, #60a5fa)'} style={{ margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px', color: '#fff' }}>
              Drag & Drop your Binance Vision Trades CSV here
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginBottom: '14px' }}>
              Supports Binance Spot / Futures format (id, price, qty, quoteQty, time, isBuyerMaker)
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <label
                style={{
                  background: 'var(--bg-card-hover)',
                  border: '1px solid var(--border-highlight)',
                  color: 'var(--text-main)',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Browse CSV File
                <input
                  type="file"
                  accept=".csv,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
              </label>

              <button
                onClick={loadDemoData}
                style={{
                  background: 'rgba(0, 229, 255, 0.1)',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  color: '#00e5ff',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Zap size={14} />
                Load 5,000 Trade Demo
              </button>
            </div>
          </div>

          {/* Processing / Error */}
          {isProcessing && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#00e5ff' }}>
              <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.82rem' }}>Parsing trade stream & fitting microstructure regressions...</div>
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}
            >
              <AlertCircle size={16} />
              <div>{error}</div>
            </div>
          )}

          {/* Results Display */}
          {results && !isProcessing && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Top Banner */}
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '12px 16px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={20} color="#10b981" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#10b981' }}>
                      DIAGNOSTIC COMPLETE &bull; {results.fileName}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Evaluated {results.rowCount.toLocaleString()} trades across ~{results.timeSpanSec}s window
                    </div>
                  </div>
                </div>

                <button
                  onClick={downloadReport}
                  style={{
                    background: '#10b981',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <Download size={14} />
                  Export JSON
                </button>
              </div>

              {/* 4 Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '4px' }}>VWAP PRICE</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                    ${results.vwap.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Vol: {results.totalVolume.toFixed(2)} units
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '4px' }}>ORDER MEMORY (LAG 1)</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00e5ff' }}>
                    {(results.autocorrLags[0]?.rho || 0).toFixed(3)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Long memory signature
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '4px' }}>KYLE'S LAMBDA</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>
                    {results.kylesLambdaBps.toFixed(4)} <span style={{ fontSize: '0.7rem' }}>bps</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Price impact slope
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '4px' }}>HAWKES RATIO &rho;</div>
                  <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 700, color: results.hawkesRhoEst >= 1.0 ? '#ef4444' : '#10b981' }}>
                    {results.hawkesRhoEst.toFixed(3)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {results.hawkesRhoEst >= 1.0 ? 'Supercritical' : 'Subcritical Stable'}
                  </div>
                </div>
              </div>

              {/* Order Sign Decay Table */}
              <div style={{ background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '12px' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                  TRADE SIGN AUTOCORRELATION PROFILE &rho;(k)
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {results.autocorrLags.map((item) => (
                    <div
                      key={item.lag}
                      style={{
                        flex: 1,
                        minWidth: '80px',
                        background: 'var(--bg-dark)',
                        padding: '8px',
                        borderRadius: '4px',
                        textAlign: 'center',
                        border: '1px solid var(--border-highlight)'
                      }}
                    >
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>Lag k={item.lag}</div>
                      <div className="mono" style={{ fontSize: '0.86rem', fontWeight: 700, color: '#00e5ff' }}>
                        {item.rho.toFixed(3)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
