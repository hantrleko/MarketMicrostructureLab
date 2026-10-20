import {
  DatasetItem,
  ReplayWindowResponse,
  FlowBucket,
  AutocorrResult,
  TradeSizeDistribution,
  DurationDistribution,
  PriceResponseData,
  ImpactModelsData,
  QualityAuditReport,
  OrderBookStatusResponse,
  OrderBookLadderResponse
} from '../types';

const API_BASE = '/api/v1';

function getStaticDataUrl(filename: string): string {
  const base = import.meta.env.BASE_URL || './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}data/${filename}`;
}

async function safeFetch<T>(apiEndpoint: string, fallbackFilename: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}/${apiEndpoint}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // API not reachable, falling back to static fixtures
  }

  const staticUrl = getStaticDataUrl(fallbackFilename);
  const staticRes = await fetch(staticUrl);
  if (!staticRes.ok) {
    throw new Error(`Failed to load static fixture from ${staticUrl}`);
  }
  return await staticRes.json();
}

export async function fetchDatasets(): Promise<DatasetItem[]> {
  const data = await safeFetch<{ datasets: DatasetItem[] }>('metadata/datasets', 'datasets.json');
  return data.datasets;
}

export async function fetchAuditReport(symbol: string, date: string): Promise<QualityAuditReport> {
  return safeFetch<QualityAuditReport>(`integrity/audit?symbol=${symbol}&date=${date}`, `audit_${date}.json`);
}

export async function fetchFlowBuckets(symbol: string, date: string, interval: string = '1m'): Promise<FlowBucket[]> {
  const allowedStaticIntervals = ['1m', '5m', '15m', '1h'];
  if (!allowedStaticIntervals.includes(interval)) {
    try {
      const res = await fetch(`${API_BASE}/flow/buckets?symbol=${symbol}&date=${date}&interval=${interval}`);
      if (res.ok) {
        const data = await res.json();
        return data.buckets;
      }
    } catch (e) {
      // Offline fallback warning
    }
    throw new Error(`High-frequency resolution '${interval}' requires local Python/DuckDB backend. Available static resolutions: 1m, 5m, 15m, 1h.`);
  }

  const data = await safeFetch<{ buckets: FlowBucket[] }>(
    `flow/buckets?symbol=${symbol}&date=${date}&interval=${interval}`,
    `buckets_${interval}_${date}.json`
  );
  return data.buckets;
}

export async function fetchAutocorrelation(symbol: string, date: string, maxLag: number = 50): Promise<AutocorrResult> {
  return safeFetch<AutocorrResult>(`flow/autocorrelation?symbol=${symbol}&date=${date}&max_lag=${maxLag}`, `autocorr_${date}.json`);
}

export async function fetchDistributions(symbol: string, date: string): Promise<{
  trade_size_distribution: TradeSizeDistribution;
  duration_distribution: DurationDistribution;
}> {
  return safeFetch<{
    trade_size_distribution: TradeSizeDistribution;
    duration_distribution: DurationDistribution;
  }>(`flow/distributions?symbol=${symbol}&date=${date}`, `distributions_${date}.json`);
}

export async function fetchPriceResponse(symbol: string, date: string): Promise<PriceResponseData> {
  return safeFetch<PriceResponseData>(`impact/response?symbol=${symbol}&date=${date}`, `response_${date}.json`);
}

export async function fetchImpactModels(symbol: string, date: string, horizon: number = 20): Promise<ImpactModelsData> {
  // Available pre-indexed horizons: 5, 10, 20, 50, 100
  const validHorizons = [5, 10, 20, 50, 100];
  const matchedHorizon = validHorizons.reduce((prev, curr) =>
    Math.abs(curr - horizon) < Math.abs(prev - horizon) ? curr : prev
  );

  return safeFetch<ImpactModelsData>(
    `impact/models?symbol=${symbol}&date=${date}&horizon=${horizon}`,
    `models_${date}_k${matchedHorizon}.json`
  );
}

export async function fetchReplayWindow(
  symbol: string,
  date: string,
  startSecond: number,
  durationSeconds: number = 60,
  limit: number = 2000
): Promise<ReplayWindowResponse> {
  // Try live API first
  try {
    const res = await fetch(
      `${API_BASE}/replay/window?symbol=${symbol}&date=${date}&start_second=${startSecond}&duration_seconds=${durationSeconds}&limit=${limit}`
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // Fall back to pre-indexed static session
  }

  // Pre-indexed intraday offsets: 0 (00:00), 28800 (08:00), 50400 (14:00), 72000 (20:00)
  const availableOffsets = [0, 28800, 50400, 72000];
  const matchedOffset = availableOffsets.reduce((prev, curr) =>
    Math.abs(curr - startSecond) < Math.abs(prev - startSecond) ? curr : prev
  );

  return safeFetch<ReplayWindowResponse>(
    `replay/window?symbol=${symbol}&date=${date}&start_second=${startSecond}&duration_seconds=${durationSeconds}&limit=${limit}`,
    `replay_window_${date}_${matchedOffset}.json`
  );
}

export async function fetchHawkes(symbol: string, date: string, sampleSize: number = 4000, beta: number = 10.0): Promise<any> {
  return safeFetch<any>(
    `analytics/hawkes?symbol=${symbol}&date=${date}&sample_size=${sampleSize}&beta=${beta}`,
    `hawkes_${date}.json`
  );
}

export async function fetchOrderBookStatus(): Promise<OrderBookStatusResponse> {
  return safeFetch<OrderBookStatusResponse>('orderbook/status', 'orderbook_status.json');
}

export async function controlOrderBook(action: 'start' | 'stop'): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/orderbook/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    if (res.ok) return await res.json();
  } catch (e) {
    // Static mode
  }
  return {
    status: 'SIMULATED_DEMO',
    action,
    message: action === 'start'
      ? 'Static Demonstration Mode Active (Synthetic Order Book - Not Real Market Data)'
      : 'Demonstration Mode Stopped'
  };
}

let simulatedOfi = 0.0;
let simTickCount = 0;

export async function fetchLiveOrderBook(depth: number = 15, allowSimulation: boolean = false): Promise<OrderBookLadderResponse> {
  try {
    const res = await fetch(`${API_BASE}/orderbook/live?depth=${depth}`);
    if (res.ok) {
      const data = await res.json();
      return {
        ...data,
        data_status: data.is_valid ? 'LIVE_VERIFIED' : 'UNAVAILABLE'
      };
    }
  } catch (e) {
    // Offline
  }

  // If simulation is not explicitly requested, return UNAVAILABLE
  if (!allowSimulation) {
    return {
      symbol: 'BTCUSDT',
      data_status: 'UNAVAILABLE',
      status: 'STANDBY',
      is_valid: false,
      last_update_id: 0,
      sync_errors: 0,
      metrics: {
        is_valid: false,
        status: 'STANDBY',
        last_update_id: 0,
        event_time_utc: new Date().toISOString(),
        best_bid: 0,
        best_ask: 0,
        mid_price: 0,
        microprice: 0,
        spread: 0,
        spread_bps: 0,
        bid_depth_top5: 0,
        ask_depth_top5: 0,
        book_imbalance: 0
      },
      bids: [],
      asks: [],
      history: []
    };
  }

  // Clearly marked SIMULATED mode for visual terminal demonstration
  simTickCount++;
  const baseMid = 62750.0 + Math.sin(simTickCount * 0.1) * 3.5;
  const spread = 0.08 + (Math.sin(simTickCount * 0.25) + 1) * 0.04;
  const bestBid = Number((baseMid - spread / 2).toFixed(2));
  const bestAsk = Number((baseMid + spread / 2).toFixed(2));
  const spreadBps = (spread / baseMid) * 10000;
  simulatedOfi += (Math.random() - 0.5) * 0.5;

  const bids = [];
  const asks = [];
  for (let i = 0; i < depth; i++) {
    bids.push({
      price: Number((bestBid - i * 0.1).toFixed(2)),
      qty: Number((0.15 + Math.random() * 1.5 + i * 0.1).toFixed(4)),
      total: Number((bestBid - i * 0.1) * (0.15 + Math.random() * 1.5 + i * 0.1))
    });
    asks.push({
      price: Number((bestAsk + i * 0.1).toFixed(2)),
      qty: Number((0.15 + Math.random() * 1.5 + i * 0.1).toFixed(4)),
      total: Number((bestAsk + i * 0.1) * (0.15 + Math.random() * 1.5 + i * 0.1))
    });
  }

  const top5B = bids.slice(0, 5).reduce((acc, b) => acc + b.qty, 0);
  const top5A = asks.slice(0, 5).reduce((acc, a) => acc + a.qty, 0);
  const imb = (top5B - top5A) / (top5B + top5A);
  const micro = (bids[0].qty * asks[0].price + asks[0].qty * bids[0].price) / (bids[0].qty + asks[0].qty);

  return {
    symbol: 'BTCUSDT',
    data_status: 'SIMULATED',
    status: 'SIMULATED_DEMO',
    is_valid: false,
    last_update_id: 100000 + simTickCount * 5,
    sync_errors: 0,
    metrics: {
      is_valid: false,
      status: 'SIMULATED_DEMO',
      last_update_id: 100000 + simTickCount * 5,
      event_time_utc: new Date().toISOString(),
      best_bid: bestBid,
      best_ask: bestAsk,
      mid_price: Number(baseMid.toFixed(2)),
      microprice: Number(micro.toFixed(2)),
      spread: Number(spread.toFixed(2)),
      spread_bps: Number(spreadBps.toFixed(3)),
      bid_depth_top5: Number(top5B.toFixed(4)),
      ask_depth_top5: Number(top5A.toFixed(4)),
      book_imbalance: Number(imb.toFixed(4))
    },
    bids,
    asks,
    history: Array.from({ length: 25 }, (_, i) => ({
      time_str: new Date(Date.now() - (25 - i) * 1000).toLocaleTimeString(),
      spread_bps: Number((0.18 + Math.sin(i * 0.3) * 0.04).toFixed(3)),
      cumulative_ofi: Number((simulatedOfi - (25 - i) * 0.1).toFixed(2))
    }))
  };
}
