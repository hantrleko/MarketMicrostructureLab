import { useState } from 'react';
import { Header } from './components/Header';
import { MarketReplay } from './pages/MarketReplay';
import { OrderFlowObservatory } from './pages/OrderFlowObservatory';
import { MarketImpactResearch } from './pages/MarketImpactResearch';
import { DataIntegrityConsole } from './pages/DataIntegrityConsole';
import { OrderBookLab } from './pages/OrderBookLab';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('replay');
  const [selectedDate, setSelectedDate] = useState<string>('2026-07-01');
  const availableDates = ['2026-07-01', '2026-07-02', '2026-07-03'];

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
        {activeTab === 'replay' && <MarketReplay date={selectedDate} />}
        {activeTab === 'observatory' && <OrderFlowObservatory date={selectedDate} />}
        {activeTab === 'impact' && <MarketImpactResearch date={selectedDate} />}
        {activeTab === 'integrity' && <DataIntegrityConsole currentDate={selectedDate} />}
        {activeTab === 'orderbook' && <OrderBookLab />}
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: '14px 28px',
        background: 'var(--bg-dark)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'var(--text-dim)'
      }}>
        <div>
          MARKET MICROSTRUCTURE LAB (MML) v1.0.0 &bull; DUCKDB + POLARS + FASTAPI + REACT
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <span>OFFICIAL DATA: BINANCE VISION SPOT</span>
          <span>NON-COMMERCIAL RESEARCH LICENSE</span>
          <span className="mono" style={{ color: 'var(--color-buy)' }}>BTCUSDT PARQUET LAYER ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
