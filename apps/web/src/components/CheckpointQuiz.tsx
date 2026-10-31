import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

export interface QuizQuestion {
  act: number;
  badgeName: string;
  badgeIcon: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const QUIZ_QUESTIONS: Record<number, QuizQuestion> = {
  1: {
    act: 1,
    badgeName: '逐笔穿透者',
    badgeIcon: '🔍',
    question: '在逐笔回放中，若价格维持上升但累积成交量差 (CVD) 却持续深幅创下新低，微观结构学上通常揭示了什么？',
    options: [
      '主动买盘极其强劲，是坚决突破形态，建议无脑跟多',
      '高位存在大量挂单买单被隐蔽的大额主动市价空单持续砸盘消耗（被动吸收/顶背离），潜藏反转风险',
      '交易所撮合引擎因高频流量拥堵发生了时间戳乱序'
    ],
    correctIndex: 1,
    explanation: 'CVD 持续下行说明主动发起的市价单主要为卖单。价格未跌是因为买方被动限价单在挂单支撑被动吸收。这种“挂单托市+暗中出货”是知情大单出货的经典背离特征。'
  },
  2: {
    act: 2,
    badgeName: '自激破译官',
    badgeIcon: '⚡',
    question: 'Hawkes 自激过程的分支比 (Branching Ratio) ρ ≥ 1.0 时，订单流处于何种数学动力学状态？',
    options: [
      '市场处于标准的高斯平稳微幅波动区间，流动性最为安全',
      '单笔外生交易平均诱发 ≥ 1 笔内生后继交易，系统进入不可自发衰减的临界/超临界自激雪崩状态',
      '被动做市商正在提供无限充裕的双边深厚流动性缓冲'
    ],
    correctIndex: 1,
    explanation: '数学上，当 Hawkes 谱半径/分支比 ρ = ∫ γ(t)dt ≥ 1.0 时，过程失去弱平稳性。一个事件内生引发一个甚至多个后续事件，引发订单流正反馈连锁反应（闪崩或级联挤压）。'
  },
  3: {
    act: 3,
    badgeName: '幂律测算师',
    badgeIcon: '📐',
    question: '实证研究证实单笔成交的价格冲击并不直接遵循大机构数日长母单的“平方根定律”，其核心物理机制是什么？',
    options: [
      '平方根法则仅在纯股票市场成立，在加密货币高频市场毫无物理意义',
      '单笔冲击为微观瞬态冲击，成交击穿空洞后做市商与限价单会迅速重新挂单回补，产生均值弹性回弹；而平方根法则描述的是长期连续母单的均衡成本',
      '交易所的撮合费用会对高频市价单施加二次方非线性惩罚'
    ],
    correctIndex: 1,
    explanation: '单笔订单瞬间消耗档位造成瞬态冲击，随后流动性恢复使价格在滞后数十笔内均值回归。平方根法则是多笔母单持续消耗深层流动性沉淀后的宏观累积冲击。'
  },
  4: {
    act: 4,
    badgeName: '毒性鉴别专家',
    badgeIcon: '🧪',
    question: '当等体积量桶测算的知情交易毒性概率 (VPIN) 突破 0.35 极端警戒线时，理性的高频做市商应当如何做市防守？',
    options: [
      '主动将挂单点差压缩至 0 甚至倒挂，争取更多撮合成交量',
      '迅速扩大双边挂单点差甚至后撤撤单，防御知情优势大单的逆向选择掠夺',
      '立即向现货与合约撮合系统同时以市价全额平仓所有现货库存'
    ],
    correctIndex: 1,
    explanation: 'VPIN 突破 0.35 意味着主动买卖流量由具有先验信息的知情交易者驱动。此时成交的对家几乎必亏，做市商唯有扩大点差索取更高的逆向选择补偿，或后撤报价以保全资本。'
  },
  5: {
    act: 5,
    badgeName: '深度解构宗师',
    badgeIcon: '👑',
    question: '微观价格 (Microprice) 相比传统的买卖一档中间价 (Mid-Price)，核心精髓在于解决了什么痛点？',
    options: [
      '它结合了最优买一与卖一档位的挂单数量不平衡度 (OFI/Imbalance)，更敏锐提前预判下一笔价格跳价方向',
      '它完全摒弃了订单簿深度数据，仅用最后一笔成交价计算，省去了前端算力',
      '它的计算结果必定恒等于 1 分钟后的 TWAP 均价'
    ],
    correctIndex: 0,
    explanation: '传统中间价 (Ask+Bid)/2 忽略了挂单厚薄。若买一挂单 100 BTC，卖一仅 0.1 BTC，买方扫穿卖一概率极高。微观价格加权买卖量，精准指引短期价格瞬时漂移倾向。'
  }
};

const STORAGE_KEY = 'mml_quiz_unlocked_badges';

export function getUnlockedBadges(): Record<number, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveUnlockedBadge(act: number): void {
  try {
    const current = getUnlockedBadges();
    current[act] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

interface CheckpointQuizProps {
  act: number;
  onPassed?: () => void;
}

export const CheckpointQuiz: React.FC<CheckpointQuizProps> = ({ act, onPassed }) => {
  const q = QUIZ_QUESTIONS[act];
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isPassed, setIsPassed] = useState(false);

  useEffect(() => {
    const unlocked = getUnlockedBadges();
    if (unlocked[act]) {
      setIsPassed(true);
    }
  }, [act]);

  if (!q) return null;

  const handleSubmit = (idx: number) => {
    if (isAnswered) return;
    setSelectedIndex(idx);
    setIsAnswered(true);
    if (idx === q.correctIndex) {
      setIsPassed(true);
      saveUnlockedBadge(act);
      if (onPassed) onPassed();
    }
  };

  const handleReset = () => {
    setSelectedIndex(null);
    setIsAnswered(false);
  };

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '10px 14px',
        background: 'rgba(15, 23, 42, 0.75)',
        border: isPassed ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(100, 116, 139, 0.3)',
        borderRadius: '6px',
        width: '100%'
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.05rem' }}>{q.badgeIcon}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isPassed ? '#34d399' : '#38bdf8' }}>
            {isPassed ? `已解锁本幕徽章：【${q.badgeName}】` : `幕间微观自检：解锁【${q.badgeName}】徽章`}
          </span>
          {isPassed && (
            <span
              style={{
                fontSize: '0.65rem',
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.15)',
                padding: '1px 6px',
                borderRadius: '3px',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              已通关
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.72rem' }}>
          <span>{isOpen ? '收起测验' : '展开测验'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded Quiz Content */}
      {isOpen && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(51, 65, 85, 0.5)', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.76rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '10px', lineHeight: 1.5 }}>
            <span style={{ color: '#38bdf8', marginRight: '6px' }}>Q{act}:</span>
            {q.question}
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {q.options.map((opt, idx) => {
              const isSelected = selectedIndex === idx;
              const isCorrect = idx === q.correctIndex;
              let bg = 'rgba(30, 41, 59, 0.5)';
              let border = '1px solid rgba(71, 85, 105, 0.4)';
              let textColor = '#cbd5e1';

              if (isAnswered) {
                if (isCorrect) {
                  bg = 'rgba(16, 185, 129, 0.15)';
                  border = '1px solid #10b981';
                  textColor = '#34d399';
                } else if (isSelected) {
                  bg = 'rgba(239, 68, 68, 0.15)';
                  border = '1px solid #ef4444';
                  textColor = '#f87171';
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSubmit(idx)}
                  disabled={isAnswered}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    background: bg,
                    border,
                    color: textColor,
                    fontSize: '0.73rem',
                    cursor: isAnswered ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    lineHeight: 1.45,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontWeight: 700, minWidth: '18px' }}>
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span style={{ flex: 1 }}>{opt}</span>
                  {isAnswered && isCorrect && <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />}
                  {isAnswered && isSelected && !isCorrect && <XCircle size={15} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />}
                </button>
              );
            })}
          </div>

          {/* Feedback & explanation */}
          {isAnswered && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 10px',
                borderRadius: '4px',
                background: selectedIndex === q.correctIndex ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                border: selectedIndex === q.correctIndex ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: '0.72rem',
                color: '#cbd5e1',
                lineHeight: 1.5
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, color: selectedIndex === q.correctIndex ? '#34d399' : '#f87171' }}>
                  {selectedIndex === q.correctIndex ? '🎉 回答正确！已获得实证徽章' : '❌ 回答有偏差'}
                </span>
                {selectedIndex !== q.correctIndex && (
                  <button
                    onClick={handleReset}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'transparent',
                      border: 'none',
                      color: '#38bdf8',
                      fontSize: '0.70rem',
                      cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>重新作答</span>
                  </button>
                )}
              </div>
              <div>{q.explanation}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
