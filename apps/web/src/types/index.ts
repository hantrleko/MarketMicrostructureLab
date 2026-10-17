export type AggressorSide = 'BUY' | 'SELL';

export interface DatasetItem {
  symbol: string;
  date: string;
  status: 'NORMALIZED' | 'UNAVAILABLE';
  records: number;
  official_sha256: string;
  timestamp_unit: string;
  min_price?: number;
  max_price?: number;
  total_base_volume?: number;
  total_quote_volume?: number;
  buy_ratio?: number;
  sell_ratio?: number;
  audit_passed: boolean;
  max_gap_seconds?: number;
}

export interface ReplayTrade {
  trade_id: string;
  event_time_utc: string;
  event_timestamp_ns: string;
  price: number;
  base_quantity: number;
  quote_quantity: number;
  is_buyer_maker: boolean;
  aggressor_side: AggressorSide;
  direction: number;
}

export interface FlowBucket {
  datetime: string;
  trade_count: number;
  open: number;
  high: number;
  low: number;
  close: number;
  total_volume: number;
  quote_volume: number;
  buy_volume: number;
  sell_volume: number;
  net_volume: number;
  buy_ratio: number;
  cvd: number;
  vwap: number;
}

export interface AutocorrResult {
  max_lag: number;
  sample_size: number;
  mean_direction: number;
  lags: number[];
  autocorrelations: number[];
}

export interface DistributionBin {
  bin_idx?: number;
  log_min?: number;
  log_max?: number;
  qty_min?: number;
  qty_max?: number;
  ms_min?: number;
  ms_max?: number;
  count: number;
  pct: number;
}

export interface TradeSizeDistribution {
  total_trades: number;
  mean_qty: number;
  std_qty: number;
  median_qty: number;
  p25_qty: number;
  p75_qty: number;
  p90_qty: number;
  p99_qty: number;
  max_qty: number;
  min_qty: number;
  bins: DistributionBin[];
}

export interface DurationDistribution {
  total_durations: number;
  zero_duration_trades: number;
  zero_duration_pct: number;
  mean_ms: number;
  median_ms: number;
  p90_ms: number;
  p99_ms: number;
  max_ms: number;
  bins: DistributionBin[];
}

export interface ResponseCurvePoint {
  lag_events: number;
  response_bps: number;
  hac_std_err: number;
  ci_lower_95: number;
  ci_upper_95: number;
  t_stat: number;
  observations: number;
  buy_response_bps: number;
  sell_response_bps: number;
  asymmetry_bps: number;
  quintile_q1_bps: number;
  quintile_q2_bps: number;
  quintile_q3_bps: number;
  quintile_q4_bps: number;
  quintile_q5_bps: number;
}

export interface PriceResponseData {
  symbol: string;
  sample_size: number;
  quintile_thresholds_qty: number[];
  curves: ResponseCurvePoint[];
}

export interface EmpiricalBinPoint {
  bin: number;
  mean_volume: number;
  mean_response_bps: number;
  se_bps: number;
  count: number;
}

export interface ModelFitStats {
  name: string;
  alpha: number;
  alpha_se?: number;
  beta?: number;
  beta_se?: number;
  beta_t_stat?: number;
  beta_p_value?: number;
  gamma?: number;
  gamma_se?: number;
  r_squared?: number;
  r_squared_binned?: number;
  aic?: number;
  bic?: number;
  hypothesis_test_sqrt_law?: {
    null_hypothesis: string;
    estimated_gamma: number;
    t_statistic: number;
    p_value: number;
    reject_null_at_5pct: boolean;
  };
}

export interface ImpactModelsData {
  horizon_events: number;
  observations: number;
  binned_empirical: EmpiricalBinPoint[];
  linear_model: ModelFitStats;
  logarithmic_model: ModelFitStats;
  power_law_model: ModelFitStats;
}

export interface QualityAuditReport {
  symbol: string;
  date: string;
  audit_timestamp_utc: string;
  status: 'PASSED' | 'FAILED';
  checks: {
    total_records: number;
    duplicate_trade_ids: number;
    invalid_price_count: number;
    invalid_base_qty_count: number;
    invalid_quote_qty_count: number;
    arithmetic_mismatches: number;
    chronological_reversals: number;
    invalid_aggressor_side: number;
    negative_trade_id_steps: number;
    large_trade_id_jumps: number;
  };
  chronology_and_gaps: {
    first_event_utc: string;
    last_event_utc: string;
    duration_min_ms: number;
    duration_mean_ms: number;
    duration_median_ms: number;
    duration_p95_ms: number;
    duration_p99_ms: number;
    duration_max_ms: number;
    max_gap_seconds: number;
    simultaneous_trades_count: number;
    simultaneous_pct: number;
  };
  volume_and_sides: {
    buy_trades: number;
    sell_trades: number;
    buy_ratio: number;
    sell_ratio: number;
    min_price: number;
    max_price: number;
    mean_price: number;
    total_base_volume: number;
    total_quote_volume: number;
  };
}
