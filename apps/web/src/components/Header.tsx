import { Activity, LineChart, PlayCircle, Layers, ShieldCheck } from 'lucide-react';

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
    { id: 'observatory', label: 'Order Flow Observatory', icon: Activity },
    { id: 'impact', label: 'Market Impact Research', icon: LineChart },
    { id: 'integrity', label: 'Data Integrity Console', icon: ShieldCheck },
    { id: 'orderbook', label: 'Order Book Lab (Phase 2)', icon: Layers },
  ];

  return (
    <header style={{
      background: 'var(--bg-dark)',
      borderBottom: '1px solid var(--border-color)',
      padding: '12px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      {/* Brand & Symbol Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '2px',
            background: 'var(--color-gold)',
            boxShadow: '0 0 10px var(--color-gold)'
          }} />
          <div>
            <div style={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: '1.05rem', color: '#fff' }}>
              MML <span style={{ color: 'var(--color-buy)', fontWeight: 500 }}>// MICROSTRUCTURE LAB</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
              BINANCE SPOT BTC/USDT RESEARCH PLATFORM
            </div>
          </div>
        </div>

        {/* Date Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '16px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DATE:</span>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-highlight)',
              padding: '6px 12px',
              borderRadius: '4px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {d} (Verified)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '4px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '0.86rem',
                fontWeight: isActive ? 600 : 500,
                background: isActive ? 'var(--bg-card-hover)' : 'transparent',
                color: isActive ? 'var(--color-buy)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--color-buy)' : '2px solid transparent',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Real-time Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(0, 229, 255, 0.08)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          color: 'var(--color-buy)'
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--color-buy)',
            boxShadow: '0 0 6px var(--color-buy)'
          }} />
          <span className="mono">VERIFIED DATASET</span>
        </div>
      </div>
    </header>
  );
};
