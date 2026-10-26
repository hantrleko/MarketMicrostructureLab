import React from 'react';
import { Activity, LineChart, PlayCircle, Layers, ShieldCheck, ChevronRight } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  availableDates: string[];
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedDate,
  setSelectedDate,
  availableDates
}) => {
  const tabs = [
    { id: 'replay', label: 'Market Replay', icon: PlayCircle },
    { id: 'observatory', label: 'Order Flow', icon: Activity },
    { id: 'impact', label: 'Impact Research', icon: LineChart },
    { id: 'integrity', label: 'Data Integrity', icon: ShieldCheck },
    { id: 'orderbook', label: 'Order Book (L2)', icon: Layers },
  ];

  return (
    <header className="app-header">
      {/* Row 1: Brand, Symbol/Date, Historical Status (Target: ~38px) */}
      <div className="header-top-bar">
        {/* Brand & Market Identification */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '2px',
            background: 'var(--color-gold)',
            boxShadow: '0 0 8px rgba(255, 215, 0, 0.4)',
            flexShrink: 0
          }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ fontWeight: 800, letterSpacing: '0.06em', fontSize: '0.98rem', color: '#fff' }}>
              MML
            </span>
            <span style={{ color: 'var(--color-buy)', fontSize: '0.78rem', fontWeight: 600 }}>
              BTC/USDT Spot
            </span>
          </div>

          {/* Contextual Date Selector or L2 Engine Indicator */}
          {activeTab === 'orderbook' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              <span
                className="mono"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  letterSpacing: '0.02em'
                }}
                title="Order Book module operates in live WebSocket synchronization or simulated local demo, independent of historical archives."
              >
                L2 REAL-TIME / SIMULATED ENGINE
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>DATE:</span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-highlight)',
                  padding: '3px 8px',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.76rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status Badge (Contextual: Archive vs L2 Live) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: activeTab === 'orderbook' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(0, 229, 255, 0.08)',
            border: `1px solid ${activeTab === 'orderbook' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(0, 229, 255, 0.25)'}`,
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.72rem',
            color: activeTab === 'orderbook' ? '#38bdf8' : 'var(--color-buy)'
          }}>
            <span style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: activeTab === 'orderbook' ? '#38bdf8' : 'var(--color-buy)',
              boxShadow: `0 0 5px ${activeTab === 'orderbook' ? '#38bdf8' : 'var(--color-buy)'}`
            }} />
            <span className="mono" style={{ letterSpacing: '0.02em' }}>
              {activeTab === 'orderbook' ? 'L2 LIVE / DEMO ENGINE' : 'HISTORICAL SPOT ARCHIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Short-Label Navigation Bar with Mobile Touch Scroll (Target: ~42px) */}
      <div className="header-nav-wrapper">
        <nav className="header-nav-scroll">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`header-nav-btn ${isActive ? 'active' : ''}`}
                title={tab.label}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mobile horizontal scroll hint indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.68rem',
          marginLeft: 'auto',
          paddingLeft: '6px',
          opacity: 0.7,
          pointerEvents: 'none'
        }}>
          <ChevronRight size={14} />
        </div>
      </div>
    </header>
  );
};
