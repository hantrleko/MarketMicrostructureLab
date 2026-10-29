import React, { useState } from 'react';
import { Compass, Sparkles, Zap, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useExploration } from '../context/ExplorationContext';

interface WelcomeMissionBannerProps {
  onNavigateTab: (tab: string) => void;
}

export const WelcomeMissionBanner: React.FC<WelcomeMissionBannerProps> = ({ onNavigateTab }) => {
  const { userMode, setUserMode, startTour } = useExploration();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mml_banner_collapsed') === 'true';
    }
    return false;
  });

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mml_banner_collapsed', String(next));
    }
  };

  const handleStartStory = () => {
    startTour();
    onNavigateTab('replay');
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(24, 33, 47, 0.95))',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '8px',
        marginBottom: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.3s ease'
      }}
    >
      {/* Top Header Strip */}
      <div
        style={{
          padding: '10px 16px',
          background: 'rgba(56, 189, 248, 0.08)',
          borderBottom: isCollapsed ? 'none' : '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer'
        }}
        onClick={toggleCollapse}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Compass size={18} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '0.86rem', fontWeight: 800, letterSpacing: '0.04em', color: '#fff' }}>
            MML 指挥舱新手导引 · 30 秒看懂盘口微观真相
          </span>
          <span
            style={{
              fontSize: '0.64rem',
              fontWeight: 700,
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.15)',
              padding: '2px 6px',
              borderRadius: '3px',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}
          >
            {userMode === 'guided' ? '💡 当前：通俗导读模式' : '🔬 当前：专业量化模式'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            {isCollapsed ? '展开新手指南' : '收起面板'}
          </span>
          {isCollapsed ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronUp size={16} color="#94a3b8" />}
        </div>
      </div>

      {/* Expanded Body */}
      {!isCollapsed && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Main Elevator Pitch */}
          <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: '1.6' }}>
            <strong>这里不是普通的 K 线炒币网站，而是顶级高频做市商拆解“黑盒订单流”的微观显微镜：</strong>
            <span style={{ color: '#94a3b8', display: 'block', marginTop: '2px' }}>
              通过币安官方 1062 万笔真实逐笔撮合日志，带你还原每一笔买卖吃单如何引发羊群雪崩、如何推升价格冲击、做市商如何被巨鲸知情单打断双腿，以及永续合约如何提前 180ms 剧透现货。
            </span>
          </div>

          {/* 5-Act Visual Pathway */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '8px',
              background: 'rgba(0, 0, 0, 0.3)',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(51, 65, 85, 0.5)'
            }}
          >
            <div
              onClick={() => onNavigateTab('replay')}
              style={{ cursor: 'pointer', padding: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 800 }}>① 看现场 · 逐笔回放</div>
              <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '2px' }}>巨鲸砸盘击穿挂单</div>
            </div>

            <div
              onClick={() => onNavigateTab('observatory')}
              style={{ cursor: 'pointer', padding: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 800 }}>② 探传染 · 订单流</div>
              <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '2px' }}>羊群跟风 Hawkes 自激</div>
            </div>

            <div
              onClick={() => onNavigateTab('impact')}
              style={{ cursor: 'pointer', padding: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ fontSize: '0.68rem', color: '#a855f7', fontWeight: 800 }}>③ 算冲击 · 价格响应</div>
              <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '2px' }}>单笔消耗与价差回补</div>
            </div>

            <div
              onClick={() => onNavigateTab('toxicity')}
              style={{ cursor: 'pointer', padding: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ fontSize: '0.68rem', color: '#f43f5e', fontWeight: 800 }}>④ 识庄家 · 毒性做市</div>
              <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '2px' }}>VPIN 雷达与做市盈亏</div>
            </div>

            <div
              onClick={() => onNavigateTab('orderbook')}
              style={{ cursor: 'pointer', padding: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 800 }}>⑤ 战实盘 · 实时盘口</div>
              <div style={{ fontSize: '0.72rem', color: '#e2e8f0', marginTop: '2px' }}>币安直连超临界警报</div>
            </div>
          </div>

          {/* 3 Fast-track Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleStartStory}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                border: '1px solid #38bdf8',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '4px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Sparkles size={13} />
              <span>🌱 3分钟微观破案故事 (新手推荐)</span>
            </button>

            <button
              onClick={() => onNavigateTab('orderbook')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#6ee7b7',
                padding: '6px 14px',
                borderRadius: '4px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Zap size={13} />
              <span>⚡ 免后端直连币安实时盘口</span>
            </button>

            <button
              onClick={() => {
                setUserMode('expert');
                onNavigateTab('impact');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                color: '#d8b4fe',
                padding: '6px 14px',
                borderRadius: '4px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <ShieldCheck size={13} />
              <span>🔬 量化计量模型与防伪审计</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
