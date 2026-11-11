import React, { useState } from 'react';
import {
  Activity,
  LineChart,
  PlayCircle,
  Layers,
  ShieldCheck,
  Zap,
  History,
  ShieldAlert,
  Sparkles,
  Compass,
  Command,
  X
} from 'lucide-react';
import { useExploration } from '../context/ExplorationContext';

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
  const { userMode, setUserMode, startTour, unlockedBadges, setIsHonorWallOpen } = useExploration();
  const unlockedBadgesCount = Object.keys(unlockedBadges).filter((k) => unlockedBadges[Number(k)]).length;
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

  // Grouped Navigation Ribbon
  const navGroups = [
    {
      groupName: '观测',
      groupColor: '#00f0ff',
      tabs: [
        { id: 'replay', key: '1', label: '逐笔回放', sub: '看现场', icon: PlayCircle },
        { id: 'observatory', key: '2', label: '订单流与自激', sub: '探规律', icon: Activity }
      ]
    },
    {
      groupName: '机理',
      groupColor: '#fbbf24',
      tabs: [
        { id: 'impact', key: '3', label: '价格冲击与弹性', sub: '算击穿', icon: LineChart },
        { id: 'toxicity', key: '4', label: '毒性与做市解剖', sub: '识庄家', icon: ShieldAlert }
      ]
    },
    {
      groupName: '量化台',
      groupColor: '#10b981',
      tabs: [
        { id: 'orderbook', key: '5', label: '实时盘口与做市', sub: '战实盘', icon: Layers },
        { id: 'execution', key: '6', label: '买方拆单 (AC)', sub: '优执行', icon: Zap },
        { id: 'alpha', key: '7', label: '微观 Alpha 预测', sub: '测方向', icon: Sparkles }
      ]
    },
    {
      groupName: '治理',
      groupColor: '#94a3b8',
      tabs: [
        { id: 'integrity', key: '8', label: '数据防伪对账', sub: '真账本', icon: ShieldCheck },
        { id: 'changelog', key: '9', label: '演进日志', sub: 'v4.0.0', icon: History }
      ]
    }
  ];

  // Dynamic Telemetry Snapshot (Contextual to selected date / live mode)
  const getTelemetryData = () => {
    if (activeTab === 'orderbook') {
      return {
        modeLabel: 'LIVE L2 STREAM',
        price: '实时盘口',
        spread: '动态计算',
        vpin: '在线水桶聚合',
        hawkes: '实时自激',
        isLive: true
      };
    }
    switch (selectedDate) {
      case '2026-07-02':
        return {
          modeLabel: '07-02 波动剧增日',
          price: '$60,894',
          spread: '1.18 bps',
          vpin: '23.8%',
          hawkes: 'ρ = 1.0237 ⚡',
          isLive: false
        };
      case '2026-07-03':
        return {
          modeLabel: '07-03 机构沉淀日',
          price: '$61,450',
          spread: '1.15 bps',
          vpin: '21.9%',
          hawkes: 'ρ = 0.9453',
          isLive: false
        };
      default:
        return {
          modeLabel: '07-01 基准开盘日',
          price: '$60,412',
          spread: '1.12 bps',
          vpin: '22.4%',
          hawkes: 'ρ = 0.8540',
          isLive: false
        };
    }
  };

  const telemetry = getTelemetryData();

  return (
    <header className="app-header">
      {/* Row 1: Brand, Global Telemetry Capsule, Actions (Target: ~40px) */}
      <div className="header-top-bar">
        {/* Brand & Market Identification */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <img
            src="./eugene_finance_logo.png"
            alt="Eugene Finance"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              objectFit: 'contain',
              background: '#0d121c',
              flexShrink: 0
            }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 800, letterSpacing: '0.08em', fontSize: '0.94rem', color: '#fff' }}>
              EUGENE FINANCE
            </span>
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '1px 5px',
                borderRadius: '3px',
                letterSpacing: '0.03em'
              }}
            >
              MML v4.0.0
            </span>
          </div>

          {/* Global Telemetry Capsule */}
          <div className="ticker-capsule" style={{ marginLeft: '6px' }}>
            <div className="pulse-dot" />
            <span className="mono" style={{ fontWeight: 700, color: '#f8fafc' }}>
              BTC/USDT {telemetry.price}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ color: '#94a3b8' }}>点差:</span>
            <span className="mono" style={{ color: '#fbbf24', fontWeight: 600 }}>{telemetry.spread}</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ color: '#94a3b8' }}>VPIN:</span>
            <span className="mono" style={{ color: '#10b981', fontWeight: 600 }}>{telemetry.vpin}</span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
            <span style={{ color: '#94a3b8' }}>Hawkes:</span>
            <span className="mono" style={{ color: '#38bdf8', fontWeight: 600 }}>{telemetry.hawkes}</span>
          </div>

          {/* Contextual Date Selector */}
          {activeTab !== 'orderbook' && activeTab !== 'changelog' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '6px' }}>
              <span style={{ fontSize: '0.70rem', color: '#64748b' }}>DATE:</span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#f8fafc',
                  border: '1px solid rgba(71, 85, 105, 0.6)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.74rem',
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

        {/* Action Controls & Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Keyboard Shortcuts Trigger */}
          <button
            onClick={() => setIsShortcutsOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(71, 85, 105, 0.4)',
              color: '#94a3b8',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '0.70rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="查看全站键盘快捷键 (快捷键: ?)"
          >
            <Command size={11} />
            <span>快捷键</span>
          </button>

          {/* User Mode Lens Switcher */}
          <button
            onClick={() => setUserMode(userMode === 'guided' ? 'expert' : 'guided')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: userMode === 'guided' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
              border: `1px solid ${userMode === 'guided' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(168, 85, 247, 0.4)'}`,
              color: userMode === 'guided' ? '#38bdf8' : '#d8b4fe',
              padding: '3px 9px',
              borderRadius: '6px',
              fontSize: '0.70rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title={userMode === 'guided' ? '当前为新手导读模式。点击切换为专业量化视图。' : '当前为专业量化模式。点击切换为新手白话模式。'}
          >
            <Sparkles size={11} />
            <span>{userMode === 'guided' ? '💡 新手白话' : '🔬 专业极客'}</span>
          </button>

          {/* Guided Tour Launcher */}
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
              borderRadius: '6px',
              fontSize: '0.70rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="启动沉浸式聚光灯导引"
          >
            <Compass size={11} />
            <span>漫游导引</span>
          </button>

          {/* Honor Badges Capsule */}
          <button
            onClick={() => setIsHonorWallOpen(true)}
            style={{
              fontSize: '0.70rem',
              color: unlockedBadgesCount > 0 ? '#fbbf24' : '#94a3b8',
              background: unlockedBadgesCount > 0 ? 'rgba(251, 191, 36, 0.12)' : 'rgba(51, 65, 85, 0.3)',
              border: `1px solid ${unlockedBadgesCount > 0 ? 'rgba(251, 191, 36, 0.35)' : 'rgba(71, 85, 105, 0.3)'}`,
              padding: '3px 8px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title="查看微观结构学术勋章荣誉墙"
          >
            🏆 {unlockedBadgesCount}/5 勋章
          </button>

          {onOpenByod && (
            <button
              onClick={onOpenByod}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid rgba(0, 240, 255, 0.35)',
                color: '#00f0ff',
                padding: '3px 9px',
                borderRadius: '6px',
                fontSize: '0.70rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="拖拽你的交易所成交 CSV，在纯前端安全诊断"
            >
              <Zap size={11} />
              <span>导入自有 CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Grouped Workbench Navigation Ribbon */}
      <div className="header-nav-wrapper">
        <nav className="header-nav-scroll">
          {navGroups.map((group, gIdx) => (
            <React.Fragment key={group.groupName}>
              {gIdx > 0 && <div className="nav-group-divider" />}
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: group.groupColor, opacity: 0.8, marginRight: '2px', letterSpacing: '0.04em' }}>
                  {group.groupName}
                </span>

                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`header-nav-btn ${isActive ? 'active' : ''}`}
                      title={`${tab.label} · ${tab.sub} (快捷键: ${tab.key})`}
                    >
                      <Icon size={13} />
                      <span>{tab.label}</span>
                      <span className="nav-hotkey-badge">{tab.key}</span>
                    </button>
                  );
                })}
              </div>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {isShortcutsOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setIsShortcutsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mml-card"
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#0d131f',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '10px',
              padding: '20px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Command size={18} style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: 800, fontSize: '0.94rem', color: '#fff' }}>
                  全站键盘快捷键指南 (Keyboard Shortcuts)
                </span>
              </div>
              <button
                onClick={() => setIsShortcutsOpen(false)}
                style={{ background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
              {[
                { key: '1 ~ 9', desc: '秒切 9 大微观结构实验室与工具页签' },
                { key: 'Space', desc: '逐笔回放器 播放 / 暂停 切换' },
                { key: 'T', desc: '切换「新手白话」与「专业极客」导读视角' },
                { key: 'H', desc: '呼出学术通关勋章荣誉墙与认证证书' },
                { key: 'B', desc: '打开 BYOD 自有数据拖拽分析沙盒' },
                { key: 'Esc', desc: '关闭当前浮层弹窗' }
              ].map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    borderRadius: '5px',
                    border: '1px solid rgba(51, 65, 85, 0.3)'
                  }}
                >
                  <span style={{ color: '#cbd5e1' }}>{row.desc}</span>
                  <kbd
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'rgba(30, 41, 59, 0.9)',
                      border: '1px solid rgba(71, 85, 105, 0.6)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      color: '#38bdf8',
                      fontWeight: 700,
                      fontSize: '0.72rem'
                    }}
                  >
                    {row.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
