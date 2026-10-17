import {
  DatasetItem,
  ReplayTrade,
  FlowBucket,
  AutocorrResult,
  TradeSizeDistribution,
  DurationDistribution,
  PriceResponseData,
  ImpactModelsData,
  QualityAuditReport
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
  return safeFetch<ImpactModelsData>(`impact/models?symbol=${symbol}&date=${date}&horizon=${horizon}`, `models_${date}.json`);
}

export async function fetchReplayWindow(
  symbol: string,
  date: string,
  startSecond: number,
  durationSeconds: number = 60,
  limit: number = 2000
): Promise<{
  total_in_window: number;
  trades: ReplayTrade[];
}> {
  return safeFetch<{
    total_in_window: number;
    trades: ReplayTrade[];
  }>(
    `replay/window?symbol=${symbol}&date=${date}&start_second=${startSecond}&duration_seconds=${durationSeconds}&limit=${limit}`,
    `replay_window_${date}.json`
  );
}

export async function fetchHawkes(symbol: string, date: string, sampleSize: number = 4000, beta: number = 10.0): Promise<any> {
  return safeFetch<any>(
    `analytics/hawkes?symbol=${symbol}&date=${date}&sample_size=${sampleSize}&beta=${beta}`,
    `hawkes_${date}.json`
  );
}

export async function fetchOrderBookStatus(): Promise<any> {
  return safeFetch<any>('orderbook/status', 'orderbook_status.json');
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
    status: 'SUCCESS',
    action,
    message: action === 'start' ? 'Client live demonstration mode active' : 'Live demonstration mode stopped'
  };
}

let simulatedOfi = 12.45;
let tickCount = 0;

export async function fetchLiveOrderBook(depth: number = 15): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}/orderbook/live?depth=${depth}`);
    if (res.ok) return await res.json();
  } catch (e) {
    // Static demo fallback
  }

  // Generate realistic L2 orderbook ladder around 62,750 BTCUSDT
  tickCount++;
  const baseMid = 62754.20 + Math.sin(tickCount * 0.1) * 2.5;
  const spread = 0.05 + (Math.sin(tickCount * 0.2) + 1) * 0.03;
  const bestBid = Number((baseMid - spread / 2).toFixed(2));
  const bestAsk = Number((baseMid + spread / 2).toFixed(2));
  const spreadBps = (spread / baseMid) * 10000;
  simulatedOfi += (Math.random() - 0.48) * 0.8;

  const bids = [];
  const asks = [];
  for (let i = 0; i < depth; i++) {
    bids.push({
      price: Number((bestBid - i * 0.1).toFixed(2)),
      qty: Number((0.2 + Math.random() * 1.8 + i * 0.15).toFixed(4))
    });
    asks.push({
      price: Number((bestAsk + i * 0.1).toFixed(2)),
      qty: Number((0.2 + Math.random() * 1.8 + i * 0.15).toFixed(4))
    });
  }

  const totalBidTop5 = bids.slice(0, 5).reduce((acc, b) => acc + b.qty, 0);
  const totalAskTop5 = asks.slice(0, 5).reduce((acc, a) => acc + a.qty, 0);
  const bookImbalance = (totalBidTop5 - totalAskTop5) / (totalBidTop5 + totalAskTop5);
  const microprice = (bids[0].qty * asks[0].price + asks[0].qty * bids[0].price) / (bids[0].qty + asks[0].qty);

  return {
    symbol: 'BTCUSDT',
    status: 'SYNCHRONIZED',
    is_valid: true,
    last_update_id: 489201100 + tickCount * 4,
    sync_errors: 0,
    metrics: {
      is_valid: true,
      best_bid: bestBid,
      best_ask: bestAsk,
      spread: Number(spread.toFixed(2)),
      spread_bps: Number(spreadBps.toFixed(3)),
      mid_price: Number(baseMid.toFixed(2)),
      microprice: Number(microprice.toFixed(2)),
      book_imbalance: Number(bookImbalance.toFixed(4)),
      last_update_id: 489201100 + tickCount * 4
    },
    bids,
    asks,
    history: Array.from({ length: 25 }, (_, i) => ({
      time_str: new Date(Date.now() - (25 - i) * 1000).toLocaleTimeString(),
      spread_bps: Number((0.15 + Math.sin(i * 0.3) * 0.05).toFixed(3)),
      cumulative_ofi: Number((simulatedOfi - (25 - i) * 0.2).toFixed(2))
    }))
  };
}
