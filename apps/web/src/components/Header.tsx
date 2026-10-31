import React from 'react';
import { Activity, LineChart, PlayCircle, Layers, ShieldCheck, ChevronRight, Zap, History, ShieldAlert, Sparkles, Compass } from 'lucide-react';
import { useExploration } from '../context/ExplorationContext';
import { getUnlockedBadges } from './CheckpointQuiz';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  availableDates: string[];
  onOpenByod?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedDate,
  setSelectedDate,
  availableDates,
  onOpenByod
}) => {
  const { userMode, setUserMode, startTour } = useExploration();
  const unlockedBadgesCount = Object.keys(getUnlockedBadges()).length;

  const tabs = [
    { id: 'replay', label: '① 逐笔回放 · 看现场', icon: PlayCircle },
    { id: 'observatory', label: '② 订单流 · 探规律', icon: Activity },
    { id: 'impact', label: '③ 价格冲击 · 算击穿', icon: LineChart },
    { id: 'toxicity', label: '④ 毒性做市 · 识庄家', icon: ShieldAlert },
    { id: 'orderbook', label: '⚡ 实时盘口 · 战实盘', icon: Layers },
    { id: 'integrity', label: '🛡️ 附录 · 数据防伪', icon: ShieldCheck },
    { id: 'changelog', label: '📜 版本日志', icon: History },
  ];

  return (
    <header className="app-header">
      {/* Row 1: Brand, Symbol/Date, Historical Status (Target: ~38px) */}
      <div className="header-top-bar">
        {/* Brand & Market Identification with Eugene Finance Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <img
            src="./eugene_finance_logo.png"
            alt="Eugene Finance"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              objectFit: 'contain',
              background: '#0d121c',
              flexShrink: 0
            }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.98rem', color: '#fff' }}>
              EUGENE FINANCE
            </span>
            <span style={{ color: 'var(--color-buy)', fontSize: '0.78rem', fontWeight: 600 }}>
              BTC/USDT Spot
            </span>
            <span
              style={{
                fontSize: '0.64rem',
                fontWeight: 700,
                color: 'var(--color-primary, #60a5fa)',
                background: 'rgba(96, 165, 250, 0.1)',
                padding: '1px 5px',
                borderRadius: '3px',
                letterSpacing: '0.04em'
              }}
            >
              MML v3.0.0
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
          ) : activeTab === 'changelog' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              <span
                className="mono"
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--color-gold)',
                  background: 'rgba(255, 145, 0, 0.1)',
                  border: '1px solid rgba(255, 145, 0, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  letterSpacing: '0.02em'
                }}
              >
                PLATFORM EVOLUTION & AUDIT LEDGER
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

        {/* Action & Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* User Mode Lens Switcher */}
          <button
            onClick={() => setUserMode(userMode === 'guided' ? 'expert' : 'guided')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: userMode === 'guided' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              border: `1px solid ${userMode === 'guided' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
              color: userMode === 'guided' ? '#38bdf8' : '#d8b4fe',
              padding: '3px 10px',
              borderRadius: '12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title={userMode === 'guided' ? '当前为新手导读模式：自动展示白话解读与生活比喻。点击切换为专业量化极客模式。' : '当前为专业量化模式：紧凑高密度终端视图。点击切换为新手导读模式。'}
          >
            <Sparkles size={12} />
            <span>{userMode === 'guided' ? '💡 新手白话' : '🔬 专业量化'}</span>
          </button>

          {/* Guided Spotlight Tour Launcher */}
          <button
            onClick={startTour}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              padding: '3px 9px',
              borderRadius: '12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title="启动五幕沉浸式聚光灯导引"
          >
            <Compass size={12} />
            <span>🧭 漫游导引</span>
          </button>

          {unlockedBadgesCount > 0 && (
            <span
              style={{
                fontSize: '0.68rem',
                color: '#fbbf24',
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                padding: '2px 8px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontWeight: 700
              }}
              title={`已解锁 ${unlockedBadgesCount}/5 幕实证勋章`}
            >
              🏅 {unlockedBadgesCount}/5 勋章
            </span>
          )}

          {onOpenByod && (
            <button
              onClick={onOpenByod}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(0, 229, 255, 0.1)',
                border: '1px solid rgba(0, 229, 255, 0.35)',
                color: '#00e5ff',
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title="拖拽你的交易所成交 CSV，在纯前端安全诊断"
            >
              <Zap size={12} />
              <span>📂 导入自有成交 CSV</span>
            </button>
          )}

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
