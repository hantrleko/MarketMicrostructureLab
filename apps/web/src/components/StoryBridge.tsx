import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface StoryBridgeProps {
  currentAct: number;
  currentActTitle: string;
  takeaway: string;
  nextAct: string;
  nextActNumber: number;
  nextActTitle: string;
  nextQuestion: string;
  onNavigate: (tab: string) => void;
}

export const StoryBridge: React.FC<StoryBridgeProps> = ({
  currentAct,
  currentActTitle,
  takeaway,
  nextAct,
  nextActNumber,
  nextActTitle,
  nextQuestion,
  onNavigate
}) => {
  return (
    <div
      className="mml-card"
      style={{
        marginTop: '16px',
        padding: '16px 20px',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
        border: '1px solid rgba(56, 189, 248, 0.35)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
      }}
    >
      {/* Left: What we learned here & the next mystery */}
      <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
          >
            第 {currentAct} 幕已完结 · {currentActTitle}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>核心实证收获：</span>
        </div>

        <div style={{ fontSize: '0.80rem', color: '#f1f5f9', fontWeight: 600 }}>
          {takeaway}
        </div>

        <div style={{ fontSize: '0.74rem', color: '#38bdf8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Sparkles size={13} />
          <span><strong>接下来的因果悬念：</strong> {nextQuestion}</span>
        </div>
      </div>

      {/* Right: Action Button to Next Act */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <button
          onClick={() => onNavigate(nextAct)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            border: '1px solid rgba(56, 189, 248, 0.6)',
            color: '#fff',
            padding: '8px 18px',
            borderRadius: '6px',
            fontSize: '0.80rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 15px rgba(56, 189, 248, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 10px rgba(2, 132, 199, 0.4)';
          }}
        >
          <span>进入第 {nextActNumber} 幕：{nextActTitle}</span>
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
};
