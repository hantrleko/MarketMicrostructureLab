import React, { useState, useEffect, Suspense } from 'react';
import { Header } from './components/Header';
import { BYODModal } from './components/BYODModal';
import { subscribeDataLayerState, DataLayerState } from './api/client';

const MarketReplay = React.lazy(() => import('./pages/MarketReplay').then(m => ({ default: m.MarketReplay })));
const OrderFlowObservatory = React.lazy(() => import('./pages/OrderFlowObservatory').then(m => ({ default: m.OrderFlowObservatory })));
const MarketImpactResearch = React.lazy(() => import('./pages/MarketImpactResearch').then(m => ({ default: m.MarketImpactResearch })));
const DataIntegrityConsole = React.lazy(() => import('./pages/DataIntegrityConsole').then(m => ({ default: m.DataIntegrityConsole })));
const OrderBookLab = React.lazy(() => import('./pages/OrderBookLab').then(m => ({ default: m.OrderBookLab })));
const ToxicityAndMMLab = React.lazy(() => import('./pages/ToxicityAndMMLab').then(m => ({ default: m.ToxicityAndMMLab })));
const VersionChangelog = React.lazy(() => import('./pages/VersionChangelog').then(m => ({ default: m.VersionChangelog })));

interface UrlParams {
  tab: string;
  date: string;
  session?: number;
  k?: number;
}

function getUrlParams(): UrlParams {
  if (typeof window === 'undefined') return { tab: 'replay', date: '2026-07-01' };
  const params = new URLSearchParams(window.location.search);
  const validTabs = ['replay', 'observatory', 'impact', 'toxicity', 'orderbook', 'integrity', 'changelog'];
  const tab = params.get('tab');
  const date = params.get('date');
  const sessionStr = params.get('session');
  const kStr = params.get('k');

  return {
    tab: tab && validTabs.includes(tab) ? tab : 'replay',
    date: date && ['2026-07-01', '2026-07-02', '2026-07-03'].includes(date) ? date : '2026-07-01',
    session: sessionStr ? parseInt(sessionStr, 10) : undefined,
    k: kStr ? parseInt(kStr, 10) : undefined
  };
}

export function App() {
  const initialParams = getUrlParams();
  const [activeTab, setActiveTab] = useState<string>(initialParams.tab);
  const [selectedDate, setSelectedDate] = useState<string>(initialParams.date);
  const [replaySession, setReplaySession] = useState<number | undefined>(initialParams.session);
  const [impactHorizon, setImpactHorizon] = useState<number | undefined>(initialParams.k);
  const [customTrades, setCustomTrades] = useState<any[] | null>(null);
  const [isByodOpen, setIsByodOpen] = useState<boolean>(false);
  const [dataLayer, setDataLayer] = useState<DataLayerState>('STATIC');
  const availableDates = ['2026-07-01', '2026-07-02', '2026-07-03'];

  useEffect(() => {
    return subscribeDataLayerState(setDataLayer);
  }, []);

  // Synchronize state with URL search parameters (deep linking & bookmarking)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('tab', activeTab);
    params.set('date', selectedDate);
    if (activeTab === 'replay' && replaySession !== undefined) {
      params.set('session', replaySession.toString());
    } else if (activeTab !== 'replay') {
      params.delete('session');
    }
    if (activeTab === 'impact' && impactHorizon !== undefined) {
      params.set('k', impactHorizon.toString());
    } else if (activeTab !== 'impact') {
      params.delete('k');
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [activeTab, selectedDate, replaySession, impactHorizon]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const p = getUrlParams();
      setActiveTab(p.tab);
      setSelectedDate(p.date);
      setReplaySession(p.session);
      setImpactHorizon(p.k);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
        onOpenByod={() => setIsByodOpen(true)}
      />

      <main className="main-content">
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
            Loading research terminal module...
          </div>
        }>
          {activeTab === 'replay' && (
            <MarketReplay
              date={selectedDate}
              initialSession={replaySession}
              customTrades={customTrades}
              onClearCustomTrades={() => setCustomTrades(null)}
            />
          )}
          {activeTab === 'observatory' && <OrderFlowObservatory date={selectedDate} />}
          {activeTab === 'impact' && <MarketImpactResearch date={selectedDate} initialHorizon={impactHorizon} onHorizonChange={setImpactHorizon} />}
          {activeTab === 'toxicity' && <ToxicityAndMMLab date={selectedDate} />}
          {activeTab === 'integrity' && <DataIntegrityConsole currentDate={selectedDate} />}
          {activeTab === 'orderbook' && <OrderBookLab />}
          {activeTab === 'changelog' && <VersionChangelog />}
        </Suspense>
      </main>

      <BYODModal
        isOpen={isByodOpen}
        onClose={() => setIsByodOpen(false)}
        onInjectTrades={(trades) => {
          setCustomTrades(trades);
          setActiveTab('replay');
          setIsByodOpen(false);
        }}
      />

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="./eugene_finance_logo.png" alt="Logo" style={{ width: '16px', height: '16px', borderRadius: '2px' }} />
          <span>EUGENE FINANCE &bull; MARKET MICROSTRUCTURE LAB (MML) v2.0.0 &bull; INSTITUTIONAL RESEARCH WORKBENCH</span>
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
