import React, { useState, useEffect, Suspense } from 'react';
import { Header } from './components/Header';
import { subscribeDataLayerState, DataLayerState } from './api/client';

const MarketReplay = React.lazy(() => import('./pages/MarketReplay').then(m => ({ default: m.MarketReplay })));
const OrderFlowObservatory = React.lazy(() => import('./pages/OrderFlowObservatory').then(m => ({ default: m.OrderFlowObservatory })));
const MarketImpactResearch = React.lazy(() => import('./pages/MarketImpactResearch').then(m => ({ default: m.MarketImpactResearch })));
const DataIntegrityConsole = React.lazy(() => import('./pages/DataIntegrityConsole').then(m => ({ default: m.DataIntegrityConsole })));
const OrderBookLab = React.lazy(() => import('./pages/OrderBookLab').then(m => ({ default: m.OrderBookLab })));

export function App() {
  const [activeTab, setActiveTab] = useState<string>('replay');
  const [selectedDate, setSelectedDate] = useState<string>('2026-07-01');
  const [dataLayer, setDataLayer] = useState<DataLayerState>('STATIC');
  const availableDates = ['2026-07-01', '2026-07-02', '2026-07-03'];

  useEffect(() => {
    return subscribeDataLayerState(setDataLayer);
  }, []);

  const getDataLayerBadge = () => {
    switch (dataLayer) {
      case 'STATIC':
        return {
          text: 'STATIC ARCHIVE (PRE-COMPUTED JSON)',
          color: 'var(--color-primary, #60a5fa)',
          bg: 'rgba(96, 165, 250, 0.1)'
        };
      case 'LOCAL':
        return {
          text: 'LOCAL ENGINE: DUCKDB + PARQUET ACTIVE',
          color: 'var(--color-buy, #10b981)',
          bg: 'rgba(16, 185, 129, 0.1)'
        };
      case 'LIVE':
        return {
          text: 'LIVE SYNC: WEBSOCKET DIFF DEPTH STREAMING',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.1)'
        };
      case 'SIMULATED':
        return {
          text: 'SIMULATED DEMO: QUARANTINED IN-MEMORY LADDER',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.1)'
        };
    }
  };

  const badge = getDataLayerBadge();

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        availableDates={availableDates}
      />

      <main className="main-content">
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
            Loading research terminal module...
          </div>
        }>
          {activeTab === 'replay' && <MarketReplay date={selectedDate} />}
          {activeTab === 'observatory' && <OrderFlowObservatory date={selectedDate} />}
          {activeTab === 'impact' && <MarketImpactResearch date={selectedDate} />}
          {activeTab === 'integrity' && <DataIntegrityConsole currentDate={selectedDate} />}
          {activeTab === 'orderbook' && <OrderBookLab />}
        </Suspense>
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: '14px 28px',
        background: 'var(--bg-dark)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'var(--text-dim)'
      }}>
        <div>
          MARKET MICROSTRUCTURE LAB (MML) v1.1.2 &bull; QUANTITATIVE RESEARCH PLATFORM
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <span>OFFICIAL SOURCE: BINANCE VISION SPOT (NON-COMMERCIAL RESEARCH LICENSE)</span>
          <span>DERIVED METRICS: CC BY-NC-SA 4.0</span>
          <span className="mono" style={{
            color: badge.color,
            background: badge.bg,
            padding: '2px 8px',
            borderRadius: '4px',
            border: `1px solid ${badge.color}40`,
            fontWeight: 600
          }}>
            {badge.text}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
