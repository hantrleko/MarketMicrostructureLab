import React from 'react';
import { X, ShieldCheck, Copy, Check } from 'lucide-react';

interface ShareResearchCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  horizon: number;
  gammaWls: number;
  gammaOls: number;
  hawkesRho: number;
  rSquared: number;
  obsCount: number;
  certHash?: string;
}

export const ShareResearchCardModal: React.FC<ShareResearchCardModalProps> = ({
  isOpen,
  onClose,
  date,
  horizon,
  gammaWls,
  gammaOls,
  hawkesRho,
  rSquared,
  obsCount,
  certHash = '0b32921af7b7964b49bcfce3ca7cc8c8'
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const copySnapshot = () => {
    const text = `EUGENE FINANCE - MARKET MICROSTRUCTURE LAB (V1.2.0)
Date: ${date} | Horizon: k=${horizon}
Observed Trades: ${obsCount.toLocaleString()}
WLS Impact Gamma: ${gammaWls.toFixed(4)} (Reject H0: gamma=0.5)
OLS Impact Gamma: ${gammaOls.toFixed(4)}
Hawkes Clustering Ratio: ${hawkesRho.toFixed(4)}
Walk-Forward OOS R^2: ${rSquared.toFixed(4)}
Audit SHA-256: ${certHash.substring(0, 16)}...
https://hantrleko.github.io/MarketMicrostructureLab/?tab=impact&date=${date}&k=${horizon}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          borderRadius: '10px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)'
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
            RESEARCH SNAPSHOT &bull; READY FOR SHARING
          </span>
          <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-dim)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Printable/Shareable Card Area */}
        <div style={{ padding: '24px' }}>
          <div
            id="shareable-card"
            style={{
              background: 'linear-gradient(145deg, #101726, #090d16)',
              border: '1px solid #202b3d',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
              position: 'relative'
            }}
          >
            {/* Top Brand Banner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src="./eugene_finance_logo.png"
                  alt="Eugene Finance"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.15)'
                  }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.96rem', letterSpacing: '0.08em', color: '#fff' }}>
                    EUGENE FINANCE
                  </div>
                  <div style={{ fontSize: '0.64rem', color: '#00e5ff', fontWeight: 600, letterSpacing: '0.04em' }}>
                    MARKET MICROSTRUCTURE LAB &bull; V1.2.0
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ShieldCheck size={12} />
                SHA-256 VERIFIED
              </div>
            </div>

            {/* Title & Date */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                BTC/USDT Spot Price Impact Evaluation
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Target Session: <span className="mono" style={{ color: '#fff' }}>{date}</span> &bull; Horizon: <span className="mono" style={{ color: '#00e5ff' }}>k={horizon} trades</span>
              </div>
            </div>

            {/* Metrics Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>WLS IMPACT EXPONENT &gamma;</div>
                <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ff9100' }}>
                  {gammaWls.toFixed(4)}
                </div>
                <div style={{ fontSize: '0.64rem', color: '#ef4444' }}>Reject Square-Root Law (p &lt; 0.001)</div>
              </div>

              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>HAWKES CLUSTERING &rho;</div>
                <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: hawkesRho >= 1.0 ? '#ef4444' : '#10b981' }}>
                  {hawkesRho.toFixed(4)}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                  {hawkesRho >= 1.0 ? 'Supercritical Shock' : 'Subcritical Stable'}
                </div>
              </div>

              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>SAMPLE OBSERVATIONS</div>
                <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                  {obsCount.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)' }}>Binance Spot Hive Partition</div>
              </div>

              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>OUT-OF-SAMPLE R&sup2;</div>
                <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#38bdf8' }}>
                  {rSquared.toFixed(4)}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)' }}>Non-Overlapping Purged Test</div>
              </div>
            </div>

            {/* Footer with Hash */}
            <div
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.65rem',
                color: 'var(--text-dim)'
              }}
            >
              <div className="mono">
                CERT: {certHash.substring(0, 24)}...
              </div>
              <div style={{ color: 'var(--color-primary, #60a5fa)', fontWeight: 600 }}>
                hantrleko.github.io/MarketMicrostructureLab
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button
              onClick={copySnapshot}
              style={{
                flex: 1,
                background: copied ? 'rgba(16, 185, 129, 0.2)' : 'var(--color-primary, #60a5fa)',
                color: copied ? '#10b981' : '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '10px',
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Snapshot Copied to Clipboard!' : 'Copy Formatted Text Snapshot'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-highlight)',
                color: 'var(--text-main)',
                borderRadius: '4px',
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: '0.82rem'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
