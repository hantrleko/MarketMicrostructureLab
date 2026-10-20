export type AggressorSide = 'BUY' | 'SELL';

export type DataSourceStatus = 'STATIC_VERIFIED' | 'LIVE_VERIFIED' | 'SIMULATED' | 'UNAVAILABLE';

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

export interface ReplayWindowResponse {
  symbol: string;
  date: string;
  start_second: number;
  duration_seconds: number;
  total_in_window: number;
  returned_count: number;
  is_truncated: boolean;
  limit: number;
  trades: ReplayTrade[];
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
  hac_bandwidth_sensitivity?: Record<string, number>;
  ci_lower_95: number;
  ci_upper_95: number;
  t_stat: number;
  observations: number;
  buy_response_bps: number;
  sell_response_bps: number;
  asymmetry_bps: number;
  quintile_q1_bps: number | null;
  quintile_q2_bps: number | null;
  quintile_q3_bps: number | null;
  quintile_q4_bps: number | null;
  quintile_q5_bps: number | null;
}

export interface PriceResponseData {
  symbol: string;
  sample_size: number;
  quintile_bounds?: Array<{
    quintile: number;
    min_qty: number;
    max_qty: number;
    mean_qty: number;
    count: number;
  }>;
  curves: ResponseCurvePoint[];
}

export interface EmpiricalBinPoint {
  bin: number;
  label?: string;
  mean_volume: number;
  min_volume?: number;
  max_volume?: number;
  unique_quantities_count?: number;
  pct_of_sample?: number;
  is_point_mass?: boolean;
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
  ci_95_lower?: number;
  ci_95_upper?: number;
  r_squared?: number;
  r_squared_binned?: number;
  aic?: number;
  bic?: number;
  wls_fit?: {
    name?: string;
    estimator?: string;
    se_type?: string;
    gamma_wls: number;
    gamma_wls_se: number;
    ci_95_lower: number;
    ci_95_upper: number;
    r_squared_wls: number;
  };
  trade_level_fit?: {
    name?: string;
    estimator?: string;
    sample_type?: string;
    conditioning?: string;
    caveat?: string;
    gamma_trade: number;
    gamma_trade_se: number;
    r_squared_trade: number;
    positive_trades_count?: number;
    zero_trades_count?: number;
    negative_trades_count?: number;
    total_trades_count?: number;
    positive_trades_pct?: number;
  };
  out_of_sample_validation?: {
    description?: string;
    train_start_utc?: string;
    train_end_utc?: string;
    test_start_utc?: string;
    test_end_utc?: string;
    train_observations?: number;
    test_observations?: number;
    train_r2?: number;
    test_r2?: number;
    train_window: string;
    test_window: string;
    log_model_oos_r2: number;
  };
  hypothesis_test_sqrt_law?: {
    status?: string;
    null_hypothesis: string;
    gamma_estimate: number;
    gamma_estimate_wls?: number;
    standard_error: number;
    standard_error_wls?: number;
    confidence_interval_95?: [number, number];
    confidence_interval_95_ols?: [number, number];
    confidence_interval_95_wls?: [number, number];
    t_statistic: number;
    t_statistic_ols?: number;
    t_statistic_wls?: number;
    p_value: number;
    p_value_ols?: number;
    p_value_wls?: number;
    is_rejected_at_5pct: boolean;
    ols_test?: {
      estimator: string;
      gamma: number;
      se: number;
      se_type: string;
      ci_95: [number, number];
      t_statistic: number;
      p_value: number;
      is_rejected_at_5pct: boolean;
    };
    wls_test?: {
      estimator: string;
      gamma: number;
      se: number;
      se_type: string;
      ci_95: [number, number];
      t_statistic: number;
      p_value: number;
      is_rejected_at_5pct: boolean;
    };
    interpretation: string;
  };
}

export interface HawkesData {
  sample_events: number;
  observation_window_seconds: number;
  decay_beta: number;
  buy_events_count: number;
  sell_events_count: number;
  stability_status: 'SUBCRITICAL_STABLE' | 'SUPERCRITICAL_UNSTABLE';
  fitting_warnings?: string[];
  optimizer_convergence?: {
    buy_dimension_converged: boolean;
    sell_dimension_converged: boolean;
  };
  parameters: {
    mu_buy: number;
    mu_sell: number;
    alpha_buy_buy_self: number;
    alpha_sell_buy_cross: number;
    alpha_buy_sell_cross: number;
    alpha_sell_sell_self: number;
  };
  branching_ratios: {
    buy_to_buy: number;
    sell_to_buy: number;
    buy_to_sell: number;
    sell_to_sell: number;
    spectral_radius: number;
    is_subcritical_stable: boolean;
  };
  residual_diagnostics: {
    method: string;
    buy_ks_statistic: number;
    buy_ks_p_value: number;
    buy_residual_autocorr_lag1?: number;
    sell_ks_statistic: number;
    sell_ks_p_value: number;
    sell_residual_autocorr_lag1?: number;
    interpretation: string;
  };
  jitter_sensitivity?: Record<string, {
    spectral_radius: number;
    buy_to_buy: number;
    sell_to_sell: number;
  }>;
  control_model_microsecond_aggregated?: {
    raw_events_count: number;
    aggregated_events_count: number;
    compression_ratio_pct: number;
    spectral_radius: number;
    stability_status: string;
    branching_ratios?: {
      buy_to_buy: number;
      sell_to_sell: number;
    };
    interpretation?: string;
  };
  statistical_interpretation: string;
}

export interface ImpactModelsData {
  horizon_events: number;
  observations: number;
  specification_note?: string;
  sample_metadata?: {
    symbol?: string;
    horizon_lag?: number;
    total_observations?: number;
    sample_start_utc?: string;
    sample_end_utc?: string;
    sampling_method?: string;
    generation_timestamp_utc?: string;
    status?: string;
    disclaimer?: string;
  };
  binned_empirical: EmpiricalBinPoint[];
  linear_model: ModelFitStats;
  logarithmic_model: ModelFitStats;
  power_law_model: ModelFitStats;
  time_chunk_stability?: Array<{
    chunk_index: number;
    label?: string;
    start_time_utc?: string;
    end_time_utc?: string;
    observations: number;
    log_alpha?: number;
    log_beta: number;
    log_r2: number;
    power_gamma?: number | null;
    power_gamma_se?: number | null;
  }>;
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

export interface OrderBookStatusResponse {
  phase: string;
  symbol: string;
  data_status: DataSourceStatus;
  status: string;
  is_valid: boolean;
  is_running: boolean;
  last_update_id: number;
  sync_errors: number;
  gap_history?: any[];
  reconnect_history?: any[];
  disclaimer: string;
}

export interface OrderBookLadderResponse {
  symbol: string;
  data_status: DataSourceStatus;
  status: string;
  is_valid: boolean;
  last_update_id: number;
  sync_errors: number;
  gaps_recorded?: any[];
  reconnects_recorded?: any[];
  metrics: {
    is_valid: boolean;
    status: string;
    last_update_id: number;
    event_time_utc: string;
    best_bid: number;
    best_ask: number;
    mid_price: number;
    microprice: number;
    spread: number;
    spread_bps: number;
    bid_depth_top5: number;
    ask_depth_top5: number;
    book_imbalance: number;
  };
  bids: Array<{ price: number; qty: number; total: number }>;
  asks: Array<{ price: number; qty: number; total: number }>;
  history: Array<{
    time_str: string;
    spread_bps: number;
    cumulative_ofi: number;
  }>;
}
