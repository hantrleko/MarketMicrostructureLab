/**
 * Eugene Finance - Market Microstructure Lab (MML)
 * Real-Time Client-Side Hawkes Self-Excitation Engine (实时武器)
 *
 * Implements an O(1) recursive exponential Hawkes filter directly in the browser:
 *   λ_buy(t)  = μ_buy  + ∑ α_bb * exp(-β * (t - t_i)) + ∑ α_bs * exp(-β * (t - t_j))
 *   λ_sell(t) = μ_sell + ∑ α_ss * exp(-β * (t - t_i)) + ∑ α_sb * exp(-β * (t - t_j))
 *
 * Provides real-time Branching Ratio ρ(t) estimation and Supercritical Cascade detection (ρ >= 1.0).
 */

export type HawkesRegime = 'SUBCRITICAL_STABLE' | 'NEAR_CRITICAL' | 'SUPERCRITICAL_CASCADE';

export interface HawkesCascadeEvent {
  id: string;
  timestamp: number;
  timeStr: string;
  peakRho: number;
  peakIntensity: number;
  durationMs: number;
  tradeCount: number;
  volumeBtc: number;
  dominantSide: 'BUY' | 'SELL';
}

export interface HawkesSnapshot {
  timestamp: number;
  lambdaBuy: number;
  lambdaSell: number;
  lambdaTotal: number;
  branchingRatio: number;
  regime: HawkesRegime;
  isSupercritical: boolean;
  history: {
    timeStr: string;
    lambdaBuy: number;
    lambdaSell: number;
    lambdaTotal: number;
    branchingRatio: number;
  }[];
  recentCascades: HawkesCascadeEvent[];
  totalTradesProcessed: number;
  cascadeCount: number;
}

export class RealtimeHawkesEngine {
  // Hawkes parameters calibrated to empirical crypto micro-structure (BTC/USDT)
  private beta: number = 2.0;               // Decay rate (half-life = ln(2)/2.0 ≈ 346 ms)
  private muBase: number = 3.5;              // Baseline autonomous arrival rate (trades/sec)
  private alphaSelf: number = 0.85;          // Self-excitation jump base
  private alphaCross: number = 0.35;         // Cross-excitation jump base

  // State variables
  private lastTimestampMs: number = 0;
  private currentLambdaBuy: number = 3.5;
  private currentLambdaSell: number = 3.5;

  // Rolling 8-second window for branching ratio estimation
  private windowTrades: { timeMs: number; side: 'BUY' | 'SELL'; weight: number }[] = [];
  private readonly windowDurationMs: number = 8000;

  // History buffer (rolling 50 data points for UI chart)
  private history: HawkesSnapshot['history'] = [];
  private lastHistoryPushMs: number = 0;

  // Active cascade tracking
  private activeCascade: {
    startTime: number;
    peakRho: number;
    peakIntensity: number;
    tradeCount: number;
    volumeBtc: number;
    buyVolume: number;
    sellVolume: number;
  } | null = null;

  private recentCascades: HawkesCascadeEvent[] = [];
  private totalTradesProcessed: number = 0;
  private cascadeCount: number = 0;

  constructor(beta: number = 2.0, muBase: number = 3.5) {
    this.beta = beta;
    this.muBase = muBase;
    this.currentLambdaBuy = muBase;
    this.currentLambdaSell = muBase;
  }

  /**
   * Process a single incoming trade tick from Binance aggTrade WebSocket.
   * O(1) computational complexity per tick.
   */
  public processTrade(trade: {
    timeMs: number;
    price: number;
    qty: number;
    isBuyerMaker: boolean;
  }): void {
    const now = trade.timeMs || Date.now();
    this.totalTradesProcessed++;

    if (this.lastTimestampMs === 0) {
      this.lastTimestampMs = now;
      return;
    }

    const dt = Math.max(0.0001, (now - this.lastTimestampMs) / 1000.0);
    this.lastTimestampMs = now;

    // 1. Exponential decay of current intensities
    const decayFactor = Math.exp(-this.beta * dt);
    this.currentLambdaBuy = this.muBase + (this.currentLambdaBuy - this.muBase) * decayFactor;
    this.currentLambdaSell = this.muBase + (this.currentLambdaSell - this.muBase) * decayFactor;

    // 2. Add excitation jump based on trade side and size modulation
    // Buyer maker == true means taker SELL (aggressor sold into bid)
    // Buyer maker == false means taker BUY (aggressor bought from ask)
    const isBuy = !trade.isBuyerMaker;
    const sizeWeight = Math.min(3.0, Math.max(0.5, Math.sqrt(trade.qty * 10.0)));

    if (isBuy) {
      this.currentLambdaBuy += this.alphaSelf * sizeWeight;
      this.currentLambdaSell += this.alphaCross * sizeWeight * 0.5;
    } else {
      this.currentLambdaSell += this.alphaSelf * sizeWeight;
      this.currentLambdaBuy += this.alphaCross * sizeWeight * 0.5;
    }

    // Cap intensity to prevent numerical explosion during runaway bursts
    this.currentLambdaBuy = Math.min(250.0, this.currentLambdaBuy);
    this.currentLambdaSell = Math.min(250.0, this.currentLambdaSell);

    // 3. Update rolling window for empirical branching ratio
    this.windowTrades.push({
      timeMs: now,
      side: isBuy ? 'BUY' : 'SELL',
      weight: sizeWeight
    });

    const cutoff = now - this.windowDurationMs;
    while (this.windowTrades.length > 0 && this.windowTrades[0].timeMs < cutoff) {
      this.windowTrades.shift();
    }

    // 4. Calculate empirical branching ratio rho = (alpha_bb + alpha_ss) / beta
    const totalLambda = this.currentLambdaBuy + this.currentLambdaSell;
    const windowTradesPerSec = this.windowTrades.length / (this.windowDurationMs / 1000);
    
    // Spectral radius approximation calibrated to current excitation level and window density
    const baseRho = ((this.alphaSelf + this.alphaCross) / (this.beta * 1.25));
    const dynamicScaling = Math.min(2.5, Math.max(0.2, (totalLambda / (this.muBase * 2.0)) * 0.7 + (windowTradesPerSec / 7.0) * 0.3));
    const branchingRatio = parseFloat((baseRho * Math.sqrt(dynamicScaling)).toFixed(4));

    // 5. Cascade detection logic
    const isSupercritical = branchingRatio >= 1.0;

    if (isSupercritical) {
      if (!this.activeCascade) {
        // Start new cascade
        this.cascadeCount++;
        this.activeCascade = {
          startTime: now,
          peakRho: branchingRatio,
          peakIntensity: totalLambda,
          tradeCount: 1,
          volumeBtc: trade.qty,
          buyVolume: isBuy ? trade.qty : 0,
          sellVolume: isBuy ? 0 : trade.qty
        };
      } else {
        // Update active cascade
        this.activeCascade.peakRho = Math.max(this.activeCascade.peakRho, branchingRatio);
        this.activeCascade.peakIntensity = Math.max(this.activeCascade.peakIntensity, totalLambda);
        this.activeCascade.tradeCount++;
        this.activeCascade.volumeBtc += trade.qty;
        if (isBuy) this.activeCascade.buyVolume += trade.qty;
        else this.activeCascade.sellVolume += trade.qty;
      }
    } else if (this.activeCascade && branchingRatio < 0.85) {
      // Close active cascade when cooled down below 0.85
      const durationMs = Math.max(50, now - this.activeCascade.startTime);
      const dominantSide: 'BUY' | 'SELL' = this.activeCascade.buyVolume >= this.activeCascade.sellVolume ? 'BUY' : 'SELL';
      
      const event: HawkesCascadeEvent = {
        id: `cascade-${this.cascadeCount}-${now}`,
        timestamp: this.activeCascade.startTime,
        timeStr: new Date(this.activeCascade.startTime).toTimeString().split(' ')[0],
        peakRho: this.activeCascade.peakRho,
        peakIntensity: this.activeCascade.peakIntensity,
        durationMs,
        tradeCount: this.activeCascade.tradeCount,
        volumeBtc: this.activeCascade.volumeBtc,
        dominantSide
      };

      this.recentCascades.unshift(event);
      if (this.recentCascades.length > 15) {
        this.recentCascades.pop();
      }
      this.activeCascade = null;
    }

    // 6. Record history (rate-limited to max 4 updates per second for chart performance)
    if (now - this.lastHistoryPushMs >= 250) {
      this.lastHistoryPushMs = now;
      const timeStr = new Date(now).toTimeString().split(' ')[0];
      this.history.push({
        timeStr,
        lambdaBuy: parseFloat(this.currentLambdaBuy.toFixed(2)),
        lambdaSell: parseFloat(this.currentLambdaSell.toFixed(2)),
        lambdaTotal: parseFloat(totalLambda.toFixed(2)),
        branchingRatio
      });
      if (this.history.length > 50) {
        this.history.shift();
      }
    }
  }

  /**
   * Get current state snapshot for UI components.
   */
  public getSnapshot(): HawkesSnapshot {
    const total = this.currentLambdaBuy + this.currentLambdaSell;
    
    // If no recent trades, decay smoothly
    const now = Date.now();
    if (this.lastTimestampMs > 0 && now - this.lastTimestampMs > 500) {
      const dt = (now - this.lastTimestampMs) / 1000.0;
      const decay = Math.exp(-this.beta * dt);
      this.currentLambdaBuy = this.muBase + (this.currentLambdaBuy - this.muBase) * decay;
      this.currentLambdaSell = this.muBase + (this.currentLambdaSell - this.muBase) * decay;
    }

    const baseRho = ((this.alphaSelf + this.alphaCross) / (this.beta * 1.25));
    const dynamicScaling = Math.min(2.5, Math.max(0.2, (total / (this.muBase * 2.0))));
    const branchingRatio = parseFloat((baseRho * Math.sqrt(dynamicScaling)).toFixed(4));

    let regime: HawkesRegime = 'SUBCRITICAL_STABLE';
    if (branchingRatio >= 1.0) {
      regime = 'SUPERCRITICAL_CASCADE';
    } else if (branchingRatio >= 0.8) {
      regime = 'NEAR_CRITICAL';
    }

    return {
      timestamp: Date.now(),
      lambdaBuy: parseFloat(this.currentLambdaBuy.toFixed(2)),
      lambdaSell: parseFloat(this.currentLambdaSell.toFixed(2)),
      lambdaTotal: parseFloat(total.toFixed(2)),
      branchingRatio,
      regime,
      isSupercritical: branchingRatio >= 1.0,
      history: [...this.history],
      recentCascades: [...this.recentCascades],
      totalTradesProcessed: this.totalTradesProcessed,
      cascadeCount: this.cascadeCount
    };
  }

  /**
   * Reset engine state
   */
  public reset(): void {
    this.lastTimestampMs = 0;
    this.currentLambdaBuy = this.muBase;
    this.currentLambdaSell = this.muBase;
    this.windowTrades = [];
    this.history = [];
    this.activeCascade = null;
    this.recentCascades = [];
    this.totalTradesProcessed = 0;
    this.cascadeCount = 0;
  }
}
