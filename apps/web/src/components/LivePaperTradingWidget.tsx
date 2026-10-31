import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, ShieldAlert, DollarSign, RotateCcw } from 'lucide-react';

export interface LivePaperTradeRecord {
  id: string;
  timeStr: string;
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  feeRebate: number;
  pnlContribution: number;
}

interface LivePaperTradingWidgetProps {
  symbol: string;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
  hawkesRho: number;
  isHawkesSupercritical: boolean;
  liveVpin: number | null;
  incomingTrade: { price: number; qty: number; isBuyerMaker: boolean; timeMs: number } | null;
  onQuotesChange?: (quote: {
    active: boolean;
    bidPrice: number | null;
    askPrice: number | null;
    bidAhead: number;
    askAhead: number;
  }) => void;
}

export const LivePaperTradingWidget: React.FC<LivePaperTradingWidgetProps> = ({
  symbol,
  bestBid,
  bestAsk,
  midPrice,
  bids,
  asks,
  hawkesRho,
  isHawkesSupercritical,
  liveVpin,
  incomingTrade,
  onQuotesChange
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [orderSize, setOrderSize] = useState<number>(symbol.startsWith('BTC') ? 0.05 : symbol.startsWith('ETH') ? 0.5 : 2.0);
  const [spreadOffsetBps, setSpreadOffsetBps] = useState<number>(1.2);
  const [feeTier, setFeeTier] = useState<'VIP0' | 'VIP9' | 'MM_REBATE'>('MM_REBATE');
  const [enableHawkesDefense, setEnableHawkesDefense] = useState<boolean>(true);
  const [enableVpinDefense, setEnableVpinDefense] = useState<boolean>(true);

  // Live Position & PnL
  const [position, setPosition] = useState<number>(0);
  const [avgEntryPrice, setAvgEntryPrice] = useState<number>(0);
  const [realizedPnl, setRealizedPnl] = useState<number>(0);
  const [rebatesEarned, setRebatesEarned] = useState<number>(0);
  const [tradeHistory, setTradeHistory] = useState<LivePaperTradeRecord[]>([]);
  const [defensivePullsCount, setDefensivePullsCount] = useState<number>(0);

  // Active Quote Prices & Queue Position
  const [myBidPrice, setMyBidPrice] = useState<number | null>(null);
  const [myAskPrice, setMyAskPrice] = useState<number | null>(null);
  const [bidQueueAhead, setBidQueueAhead] = useState<number>(0);
  const [askQueueAhead, setAskQueueAhead] = useState<number>(0);
  const [isDefending, setIsDefending] = useState<boolean>(false);

  const prevTradeRef = useRef<any>(null);

  // Fee rates
  const makerFeeRate = feeTier === 'MM_REBATE' ? -0.00005 : feeTier === 'VIP9' ? 0.0001 : 0.0008;

  // Determine if defense should trigger
  const isHawkesAlarm = enableHawkesDefense && (isHawkesSupercritical || hawkesRho >= 1.0);
  const isVpinAlarm = enableVpinDefense && liveVpin !== null && liveVpin > 0.35;
  const shouldDefend = isHawkesAlarm || isVpinAlarm;

  // Re-quote or withdraw on defense
  useEffect(() => {
    if (!isActive) {
      setMyBidPrice(null);
      setMyAskPrice(null);
      setBidQueueAhead(0);
      setAskQueueAhead(0);
      setIsDefending(false);
      onQuotesChange?.({ active: false, bidPrice: null, askPrice: null, bidAhead: 0, askAhead: 0 });
      return;
    }

    if (shouldDefend) {
      if (!isDefending) {
        setIsDefending(true);
        setDefensivePullsCount((c) => c + 1);
      }
      setMyBidPrice(null);
      setMyAskPrice(null);
      setBidQueueAhead(0);
      setAskQueueAhead(0);
      onQuotesChange?.({ active: true, bidPrice: null, askPrice: null, bidAhead: 0, askAhead: 0 });
      return;
    }

    // Normal active quoting: place quotes at bestBid / bestAsk or offset
    setIsDefending(false);
    const targetBid = bestBid > 0 ? bestBid : midPrice * (1 - spreadOffsetBps / 10000);
    const targetAsk = bestAsk > 0 ? bestAsk : midPrice * (1 + spreadOffsetBps / 10000);

    // Initial queue ahead estimation from current book snapshot
    const bidAhead = bids.length > 0 && Math.abs(bids[0].price - targetBid) < 0.01 ? bids[0].qty : 0.5;
    const askAhead = asks.length > 0 && Math.abs(asks[0].price - targetAsk) < 0.01 ? asks[0].qty : 0.5;

    setMyBidPrice(targetBid);
    setMyAskPrice(targetAsk);
    setBidQueueAhead(bidAhead);
    setAskQueueAhead(askAhead);

    onQuotesChange?.({
      active: true,
      bidPrice: targetBid,
      askPrice: targetAsk,
      bidAhead,
      askAhead
    });
  }, [isActive, shouldDefend, bestBid, bestAsk, midPrice, spreadOffsetBps]);

  // Process incoming trade against virtual orders with queue priority
  useEffect(() => {
    if (!isActive || isDefending || !incomingTrade || incomingTrade === prevTradeRef.current) {
      return;
    }
    prevTradeRef.current = incomingTrade;

    const { price, qty, isBuyerMaker, timeMs } = incomingTrade;
    const timeStr = new Date(timeMs).toTimeString().split(' ')[0];

    // Case 1: Taker Sell hits BID side (isBuyerMaker === true)
    if (isBuyerMaker && myBidPrice !== null && price <= myBidPrice) {
      if (bidQueueAhead > 0) {
        setBidQueueAhead((prev) => Math.max(0, prev - qty));
      } else {
        // Queue consumed: our quote fills!
        const fillQty = Math.min(orderSize, qty);
        const fillPrice = myBidPrice;
        const rebate = fillQty * fillPrice * (-makerFeeRate);

        setPosition((prevPos) => {
          const nextPos = prevPos + fillQty;
          setAvgEntryPrice((prevAvg) => (prevPos * prevAvg + fillQty * fillPrice) / nextPos);
          return nextPos;
        });

        setRebatesEarned((r) => r + rebate);
        setRealizedPnl((p) => p + rebate);

        setTradeHistory((prev) => [
          {
            id: `fill_${Date.now()}_b`,
            timeStr,
            side: 'BUY',
            price: fillPrice,
            qty: fillQty,
            feeRebate: rebate,
            pnlContribution: rebate
          },
          ...prev.slice(0, 19)
        ]);

        // Reset quote to next best bid with fresh queue
        setBidQueueAhead(bids[0]?.qty || 0.8);
      }
    }

    // Case 2: Taker Buy hits ASK side (isBuyerMaker === false)
    if (!isBuyerMaker && myAskPrice !== null && price >= myAskPrice) {
      if (askQueueAhead > 0) {
        setAskQueueAhead((prev) => Math.max(0, prev - qty));
      } else {
        // Queue consumed: our quote fills!
        const fillQty = Math.min(orderSize, qty);
        const fillPrice = myAskPrice;
        const rebate = fillQty * fillPrice * (-makerFeeRate);

        let tradePnl = 0;
        setPosition((prevPos) => {
          if (prevPos > 0) {
            tradePnl = fillQty * (fillPrice - avgEntryPrice);
          }
          return prevPos - fillQty;
        });

        setRebatesEarned((r) => r + rebate);
        setRealizedPnl((p) => p + tradePnl + rebate);

        setTradeHistory((prev) => [
          {
            id: `fill_${Date.now()}_a`,
            timeStr,
            side: 'SELL',
            price: fillPrice,
            qty: fillQty,
            feeRebate: rebate,
            pnlContribution: tradePnl + rebate
          },
          ...prev.slice(0, 19)
        ]);

        // Reset quote to next best ask with fresh queue
        setAskQueueAhead(asks[0]?.qty || 0.8);
      }
    }
  }, [incomingTrade, isActive, isDefending, myBidPrice, myAskPrice, bidQueueAhead, askQueueAhead, orderSize, avgEntryPrice, makerFeeRate]);

  // Mark-to-market unrealized PnL
  const unrealizedPnl = position !== 0 && midPrice > 0 ? position * (midPrice - avgEntryPrice) : 0;
  const totalPnl = realizedPnl + unrealizedPnl;

  const handleReset = () => {
    setPosition(0);
    setAvgEntryPrice(0);
    setRealizedPnl(0);
    setRebatesEarned(0);
    setTradeHistory([]);
    setDefensivePullsCount(0);
  };

  return (
    <div
      className="mml-card"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
        border: `1px solid ${isActive ? (isDefending ? '#ef4444' : '#10b981') : 'rgba(56, 189, 248, 0.35)'}`,
        borderRadius: '8px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxShadow: isActive ? (isDefending ? '0 0 15px rgba(239, 68, 68, 0.25)' : '0 0 15px rgba(16, 185, 129, 0.2)') : 'none'
      }}
    >
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DollarSign size={18} style={{ color: isActive ? '#10b981' : '#38bdf8' }} />
          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff' }}>
            💼 币安 WSS 实盘虚拟做市演兵场 (Live Paper MM & Queue Matcher)
          </span>
          <span
            style={{
              fontSize: '0.66rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '4px',
              background: isActive
                ? isDefending
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(16, 185, 129, 0.2)'
                : 'rgba(148, 163, 184, 0.1)',
              color: isActive ? (isDefending ? '#ef4444' : '#10b981') : '#94a3b8',
              border: `1px solid ${isActive ? (isDefending ? '#ef4444' : '#10b981') : '#475569'}`
            }}
          >
            {isActive ? (isDefending ? '🛡️ 自动防御中 (DEFENDING)' : '🟢 实时挂单中 (ACTIVE)') : '⚪ 挂单就绪 (IDLE)'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsActive(!isActive)}
            style={{
              background: isActive ? '#ef4444' : '#10b981',
              color: '#000',
              fontWeight: 800,
              fontSize: '0.74rem',
              padding: '5px 14px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            {isActive ? <Square size={13} fill="#000" /> : <Play size={13} fill="#000" />}
            {isActive ? '停止虚拟做市' : '启动实盘做市'}
          </button>

          <button
            onClick={handleReset}
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid #475569',
              color: '#94a3b8',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <RotateCcw size={12} />
            重置战绩
          </button>
        </div>
      </div>

      {/* Defense Notification Banner */}
      {isDefending && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '6px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.75rem',
            color: '#fca5a5'
          }}
        >
          <ShieldAlert size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div>
            <strong>自动熔断撤单已生效：</strong>
            {isHawkesAlarm && ` Hawkes 订单流雪崩 (ρ = ${hawkesRho.toFixed(3)} ≥ 1.0);`}
            {isVpinAlarm && ` VPIN 毒性海啸突破阈值 (VPIN = ${((liveVpin || 0) * 100).toFixed(1)}% > 35%);`}
            {' '}挂单已安全撤回，规避知情单逆向选择吞噬！
          </div>
        </div>
      )}

      {/* Control Knobs & Strategy Toggles */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '6px',
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          fontSize: '0.74rem'
        }}
      >
        {/* Order Size */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
            挂单单笔容量: <strong className="mono" style={{ color: '#38bdf8' }}>{orderSize} {symbol.replace('USDT', '')}</strong>
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[0.01, 0.05, 0.1, 0.5].map((sz) => (
              <button
                key={sz}
                onClick={() => setOrderSize(sz)}
                style={{
                  flex: 1,
                  background: orderSize === sz ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.8)',
                  border: `1px solid ${orderSize === sz ? '#38bdf8' : '#475569'}`,
                  color: orderSize === sz ? '#38bdf8' : '#cbd5e1',
                  padding: '3px 0',
                  borderRadius: '3px',
                  fontSize: '0.70rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>

        {/* Spread Bps */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
            点差宽度: <strong className="mono" style={{ color: '#fbbf24' }}>{spreadOffsetBps.toFixed(1)} bps</strong>
          </label>
          <input
            type="range"
            min={0.5}
            max={5.0}
            step={0.1}
            value={spreadOffsetBps}
            onChange={(e) => setSpreadOffsetBps(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
          />
        </div>

        {/* Fee Tier */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
            费率档位: <strong className="mono" style={{ color: feeTier === 'MM_REBATE' ? '#10b981' : '#cbd5e1' }}>{feeTier}</strong>
          </label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['VIP0', 'VIP9', 'MM_REBATE'] as const).map((tier) => (
              <button
                key={tier}
                onClick={() => setFeeTier(tier)}
                style={{
                  flex: 1,
                  background: feeTier === tier ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.8)',
                  border: `1px solid ${feeTier === tier ? '#10b981' : '#475569'}`,
                  color: feeTier === tier ? '#10b981' : '#cbd5e1',
                  padding: '3px 0',
                  borderRadius: '3px',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {tier === 'MM_REBATE' ? '返佣 -0.5bp' : tier}
              </button>
            ))}
          </div>
        </div>

        {/* Automated Defenses */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', marginBottom: '4px' }}>
            高频量化风控开关:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={enableHawkesDefense}
                onChange={(e) => setEnableHawkesDefense(e.target.checked)}
                style={{ accentColor: '#ef4444' }}
              />
              Hawkes 自激熔断 (ρ ≥ 1.0)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={enableVpinDefense}
                onChange={(e) => setEnableVpinDefense(e.target.checked)}
                style={{ accentColor: '#ef4444' }}
              />
              VPIN 毒性避险 (毒性 &gt; 35%)
            </label>
          </div>
        </div>
      </div>

      {/* Real-time Order & Queue Status */}
      {isActive && !isDefending && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '10px',
            fontSize: '0.74rem'
          }}
        >
          <div style={{ background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0, 229, 255, 0.3)', borderRadius: '6px', padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00e5ff', fontWeight: 700 }}>
              <span>🎯 我的挂买单 (MY BID)</span>
              <span className="mono">${myBidPrice?.toFixed(2) ?? '---'}</span>
            </div>
            <div style={{ color: '#94a3b8', marginTop: '4px' }}>
              排队前方厚度: <strong className="mono" style={{ color: '#f8fafc' }}>{bidQueueAhead.toFixed(3)} {symbol.replace('USDT', '')}</strong>
            </div>
          </div>

          <div style={{ background: 'rgba(255, 145, 0, 0.08)', border: '1px solid rgba(255, 145, 0, 0.3)', borderRadius: '6px', padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff9100', fontWeight: 700 }}>
              <span>🎯 我的挂卖单 (MY ASK)</span>
              <span className="mono">${myAskPrice?.toFixed(2) ?? '---'}</span>
            </div>
            <div style={{ color: '#94a3b8', marginTop: '4px' }}>
              排队前方厚度: <strong className="mono" style={{ color: '#f8fafc' }}>{askQueueAhead.toFixed(3)} {symbol.replace('USDT', '')}</strong>
            </div>
          </div>
        </div>
      )}

      {/* PnL and Performance Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '6px', padding: '8px 12px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>净头寸 (INVENTORY)</div>
          <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: position > 0 ? '#10b981' : position < 0 ? '#ef4444' : '#fff', marginTop: '2px' }}>
            {position > 0 ? `+${position.toFixed(3)}` : position.toFixed(3)}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            均价: ${avgEntryPrice > 0 ? avgEntryPrice.toFixed(2) : '---'}
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '6px', padding: '8px 12px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>已实现盈亏 (REALIZED)</div>
          <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: realizedPnl >= 0 ? '#10b981' : '#ef4444', marginTop: '2px' }}>
            {realizedPnl >= 0 ? `+$${realizedPnl.toFixed(2)}` : `-$${Math.abs(realizedPnl).toFixed(2)}`}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#10b981' }}>
            含返佣: +${rebatesEarned.toFixed(2)}
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '6px', padding: '8px 12px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>浮动盈亏 (UNREALIZED)</div>
          <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: unrealizedPnl >= 0 ? '#10b981' : '#ef4444', marginTop: '2px' }}>
            {unrealizedPnl >= 0 ? `+$${unrealizedPnl.toFixed(2)}` : `-$${Math.abs(unrealizedPnl).toFixed(2)}`}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            按当前中间价盯市
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '6px', padding: '8px 12px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>总综合损益 (TOTAL PNL)</div>
          <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: totalPnl >= 0 ? '#10b981' : '#ef4444', marginTop: '2px' }}>
            {totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            成交笔数: {tradeHistory.length} 笔
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '6px', padding: '8px 12px' }}>
          <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>风控避险触发 (DEFENSES)</div>
          <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: defensivePullsCount > 0 ? '#fbbf24' : '#64748b', marginTop: '2px' }}>
            {defensivePullsCount} 次
          </div>
          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
            成功回避逆向踩踏
          </div>
        </div>
      </div>

      {/* Trade Log Stream */}
      {tradeHistory.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
            📋 最近撮合成交日志 (真实 aggTrade 优先权撮合):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
            {tradeHistory.map((tr) => (
              <div
                key={tr.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: 'rgba(15, 23, 42, 0.5)',
                  padding: '4px 8px',
                  borderRadius: '3px',
                  fontSize: '0.70rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="mono" style={{ color: '#64748b' }}>{tr.timeStr}</span>
                  <span
                    style={{
                      fontWeight: 800,
                      color: tr.side === 'BUY' ? 'var(--color-buy)' : 'var(--color-sell)',
                      background: tr.side === 'BUY' ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255, 145, 0, 0.1)',
                      padding: '1px 5px',
                      borderRadius: '3px'
                    }}
                  >
                    {tr.side} (Maker)
                  </span>
                  <span className="mono" style={{ color: '#fff' }}>
                    {tr.qty} {symbol.replace('USDT', '')} @ ${tr.price.toFixed(2)}
                  </span>
                </div>
                <div className="mono" style={{ color: tr.pnlContribution >= 0 ? '#10b981' : '#ef4444' }}>
                  {tr.pnlContribution >= 0 ? `+$${tr.pnlContribution.toFixed(3)}` : `-$${Math.abs(tr.pnlContribution).toFixed(3)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
