import React from 'react';
import { X, CheckCircle2, ShieldCheck, Share2, Trophy } from 'lucide-react';
import { useExploration } from '../context/ExplorationContext';
import { QUIZ_QUESTIONS } from './CheckpointQuiz';

export const HonorWallModal: React.FC = () => {
  const { unlockedBadges, isHonorWallOpen, setIsHonorWallOpen } = useExploration();

  if (!isHonorWallOpen) return null;

  const passedCount = Object.keys(unlockedBadges).filter((k) => unlockedBadges[Number(k)]).length;
  const isAllPassed = passedCount === 5;

  const handleShareCertificate = () => {
    const text = `🏆 我已在 Eugene Finance 市场微观结构实验室 (Market Microstructure Lab) 解锁 ${passedCount}/5 幕实证学术勋章！\n包含：逐笔穿透、Hawkes 自激、单笔冲击衰减、VPIN 毒性雷达与高频做市仿真。\n在线终端：https://hantrleko.github.io/MarketMicrostructureLab/`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      alert('已复制研究员荣誉认证文本至剪贴板！');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={() => setIsHonorWallOpen(false)}
    >
      <div
        className="mml-card"
        style={{
          width: '680px',
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
          border: isAllPassed ? '2px solid #fbbf24' : '1px solid rgba(56, 189, 248, 0.5)',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.6)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trophy size={24} style={{ color: isAllPassed ? '#fbbf24' : '#38bdf8' }} />
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                微观结构实证研究员 · 学术勋章荣誉墙
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                Eugene Finance 1062 万笔逐笔成交深度探索勋章认证体系
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsHonorWallOpen(false)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Certificate Banner if completed */}
        {isAllPassed ? (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.05))',
              border: '1px solid rgba(251, 191, 36, 0.5)',
              borderRadius: '8px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldCheck size={32} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fbbf24' }}>
                  👑 恭喜达成全通关：Eugene Finance 特许微观结构研究员
                </div>
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '2px' }}>
                  你已完整掌握微观逐笔、自激长记忆、瞬态冲击回补、等体积毒性测算与微观价格预测理论！
                </div>
              </div>
            </div>
            <button
              onClick={handleShareCertificate}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                color: '#000',
                fontWeight: 800,
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0
              }}
            >
              <Share2 size={13} />
              <span>分享证书</span>
            </button>
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '0.76rem',
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>当前通关进度：<strong style={{ color: '#fff' }}>{passedCount} / 5</strong> 幕。完成各幕底部的微观自检题，即可解锁全套学术勋章。</span>
            <span className="mono" style={{ color: '#38bdf8', fontWeight: 800 }}>{((passedCount / 5) * 100).toFixed(0)}%</span>
          </div>
        )}

        {/* Badges List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3, 4, 5].map((act) => {
            const q = QUIZ_QUESTIONS[act];
            const isUnlocked = Boolean(unlockedBadges[act]);

            return (
              <div
                key={act}
                style={{
                  background: isUnlocked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(30, 41, 59, 0.4)',
                  border: isUnlocked ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(71, 85, 105, 0.3)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      fontSize: '1.6rem',
                      width: '42px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isUnlocked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      borderRadius: '8px',
                      border: isUnlocked ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #334155',
                      filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.4)'
                    }}
                  >
                    {q.badgeIcon}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: isUnlocked ? '#34d399' : '#94a3b8' }}>
                        第 {act} 幕 · 【{q.badgeName}】
                      </span>
                      {isUnlocked && (
                        <span style={{ fontSize: '0.62rem', background: '#10b981', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                          已解锁
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '2px', lineHeight: 1.4 }}>
                      考核要点：{q.question.slice(0, 60)}...
                    </div>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {isUnlocked ? (
                    <CheckCircle2 size={18} style={{ color: '#10b981' }} />
                  ) : (
                    <span style={{ fontSize: '0.70rem', color: '#64748b' }}>待完成本幕自检</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
