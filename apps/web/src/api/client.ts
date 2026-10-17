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

export async function fetchDatasets(): Promise<DatasetItem[]> {
  const res = await fetch(`${API_BASE}/metadata/datasets`);
  if (!res.ok) throw new Error('Failed to fetch datasets');
  const data = await res.json();
  return data.datasets;
}

export async function fetchAuditReport(symbol: string, date: string): Promise<QualityAuditReport> {
  const res = await fetch(`${API_BASE}/integrity/audit?symbol=${symbol}&date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch audit report');
  return res.json();
}

export async function fetchFlowBuckets(symbol: string, date: string, interval: string = '1m'): Promise<FlowBucket[]> {
  const res = await fetch(`${API_BASE}/flow/buckets?symbol=${symbol}&date=${date}&interval=${interval}`);
  if (!res.ok) throw new Error('Failed to fetch flow buckets');
  const data = await res.json();
  return data.buckets;
}

export async function fetchAutocorrelation(symbol: string, date: string, maxLag: number = 50): Promise<AutocorrResult> {
  const res = await fetch(`${API_BASE}/flow/autocorrelation?symbol=${symbol}&date=${date}&max_lag=${maxLag}`);
  if (!res.ok) throw new Error('Failed to fetch autocorrelation');
  return res.json();
}

export async function fetchDistributions(symbol: string, date: string): Promise<{
  trade_size_distribution: TradeSizeDistribution;
  duration_distribution: DurationDistribution;
}> {
  const res = await fetch(`${API_BASE}/flow/distributions?symbol=${symbol}&date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch distributions');
  return res.json();
}

export async function fetchPriceResponse(symbol: string, date: string): Promise<PriceResponseData> {
  const res = await fetch(`${API_BASE}/impact/response?symbol=${symbol}&date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch price response');
  return res.json();
}

export async function fetchImpactModels(symbol: string, date: string, horizon: number = 20): Promise<ImpactModelsData> {
  const res = await fetch(`${API_BASE}/impact/models?symbol=${symbol}&date=${date}&horizon=${horizon}`);
  if (!res.ok) throw new Error('Failed to fetch impact models');
  return res.json();
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
  const res = await fetch(
    `${API_BASE}/replay/window?symbol=${symbol}&date=${date}&start_second=${startSecond}&duration_seconds=${durationSeconds}&limit=${limit}`
  );
  if (!res.ok) throw new Error('Failed to fetch replay window');
  return res.json();
}

export async function fetchOrderBookStatus(): Promise<any> {
  const res = await fetch(`${API_BASE}/orderbook/status`);
  if (!res.ok) throw new Error('Failed to fetch orderbook status');
  return res.json();
}

export async function controlOrderBook(action: 'start' | 'stop'): Promise<any> {
  const res = await fetch(`${API_BASE}/orderbook/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  if (!res.ok) throw new Error('Failed to control orderbook');
  return res.json();
}

export async function fetchLiveOrderBook(depth: number = 15): Promise<any> {
  const res = await fetch(`${API_BASE}/orderbook/live?depth=${depth}`);
  if (!res.ok) throw new Error('Failed to fetch live orderbook');
  return res.json();
}

export async function fetchHawkes(symbol: string, date: string, sampleSize: number = 4000, beta: number = 10.0): Promise<any> {
  const res = await fetch(`${API_BASE}/analytics/hawkes?symbol=${symbol}&date=${date}&sample_size=${sampleSize}&beta=${beta}`);
  if (!res.ok) throw new Error('Failed to fetch Hawkes estimation');
  return res.json();
}

