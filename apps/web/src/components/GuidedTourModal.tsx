import React from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X, CheckCircle2 } from 'lucide-react';
import { useExploration } from '../context/ExplorationContext';

interface GuidedTourModalProps {
  onNavigateTab: (tab: string) => void;
}

interface TourStepConfig {
  step: number;
  tab: string;
  actTitle: string;
  title: string;
  description: string;
  hint: string;
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    step: 1,
    tab: 'replay',
    actTitle: '第 1 幕 · 看现场',
    title: '逐笔现场回放与大单击穿',
    description: '微观高频世界里没有光滑平滑的 K 线。请点击上方的【播放】键，观察大单如何瞬间吃空买一挂单档位，并在毫秒级拉开右侧的 CVD 累积量差。',
    hint: '💡 观察看点：点击上方【🐋 巨鲸砸盘】精选剧本，体验巨额卖单击穿现场。'
  },
  {
    step: 2,
    tab: 'observatory',
    actTitle: '第 2 幕 · 探规律',
    title: '订单流长记忆与 Hawkes 连锁传染',
    description: '一笔大单进场不是孤立事件，而是像地震引发余震一样激发羊群跟风。Hawkes 分支比 ρ 衡量 1 笔大单能激发多少后继追单；ρ ≥ 1.0 时将引发不可控雪崩！',
    hint: '💡 观察看点：自相关图证实了交易方向具有极强持续性（连续数十笔同向买卖）。'
  },
  {
    step: 3,
    tab: 'impact',
    actTitle: '第 3 幕 · 算冲击',
    title: '单笔价格响应与流动性回补半衰期',
    description: '大单吃单对价格究竟造成了多大永久冲击？严谨的 WLS 加权回归证实：单笔成交并不满足数天母单的平方根法则，而是在短暂冲高后迅速产生报价回补。',
    hint: '💡 观察看点：在上方点击切换 k=5 到 k=100，观察价格冲击先冲高后回补的倒勾形态。'
  },
  {
    step: 4,
    tab: 'toxicity',
    actTitle: '第 4 幕 · 识庄家',
    title: 'VPIN 毒性雷达与期现 180ms 剧透',
    description: '利用等体积量桶测算主动买卖失衡，识别庄家坚决扫货；测算做市商是否被逆向选择割肉；并实证了币安永续合约提前 180ms 剧透现货价格！',
    hint: '💡 观察看点：向下滚动查看【注水桶】与【期现双轨赛道】物理直觉图。'
  },
  {
    step: 5,
    tab: 'orderbook',
    actTitle: '第 5 幕 · 战实盘',
    title: '币安直连实时盘口与自激雪崩预警',
    description: '全部历史微观理论在此化为实战武器。浏览器直连币安真实 WebSocket，无需本地后端，实时运行递推核 Hawkes 模型，毫秒级预警超临界雪崩！',
    hint: '💡 观察看点：切换至 BTC/USDT 或 SOL/USDT，实时查看买卖盘深度与实时 Hawkes 峰值。'
  }
];

export const GuidedTourModal: React.FC<GuidedTourModalProps> = ({ onNavigateTab }) => {
  const { isTourActive, tourStep, setTourStep, endTour } = useExploration();

  if (!isTourActive) return null;

  const currentConfig = TOUR_STEPS.find((s) => s.step === tourStep) || TOUR_STEPS[0];
  const isFirst = tourStep <= 1;
  const isLast = tourStep >= TOUR_STEPS.length;

  const handleNext = () => {
    if (isLast) {
      endTour();
    } else {
      const nextStep = tourStep + 1;
      setTourStep(nextStep);
      const nextConfig = TOUR_STEPS.find((s) => s.step === nextStep);
      if (nextConfig) {
        onNavigateTab(nextConfig.tab);
      }
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      const prevStep = tourStep - 1;
      setTourStep(prevStep);
      const prevConfig = TOUR_STEPS.find((s) => s.step === prevStep);
      if (prevConfig) {
        onNavigateTab(prevConfig.tab);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid rgba(56, 189, 248, 0.5)',
        borderRadius: '10px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.75), 0 0 20px rgba(56, 189, 248, 0.25)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: '#f8fafc',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.6)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#38bdf8' }}>
            {currentConfig.actTitle}
          </span>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', background: 'rgba(51, 65, 85, 0.5)', padding: '1px 6px', borderRadius: '3px' }}>
            {tourStep} / {TOUR_STEPS.length}
          </span>
        </div>
        <button
          onClick={endTour}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
          title="退出破案之旅"
        >
          <X size={16} />
        </button>
      </div>

      {/* Step Title & Description */}
      <div>
        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
          {currentConfig.title}
        </div>
        <div style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.55 }}>
          {currentConfig.description}
        </div>
      </div>

      {/* Observation Hint */}
      <div
        style={{
          background: 'rgba(56, 189, 248, 0.08)',
          borderLeft: '2px solid #38bdf8',
          padding: '6px 10px',
          borderRadius: '0 4px 4px 0',
          fontSize: '0.70rem',
          color: '#93c5fd'
        }}
      >
        {currentConfig.hint}
      </div>

      {/* Controls Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <button
          onClick={endTour}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            fontSize: '0.70rem',
            cursor: 'pointer',
            padding: '4px 6px'
          }}
        >
          跳过导引
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isFirst && (
            <button
              onClick={handlePrev}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid #475569',
                color: '#cbd5e1',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={13} />
              <span>上一步</span>
            </button>
          )}

          <button
            onClick={handleNext}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              border: '1px solid rgba(56, 189, 248, 0.6)',
              color: '#fff',
              padding: '5px 12px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)'
            }}
          >
            {isLast ? (
              <>
                <CheckCircle2 size={13} />
                <span>完成破冰之旅</span>
              </>
            ) : (
              <>
                <span>下一步</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
