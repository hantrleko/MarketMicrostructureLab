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
  sample_provenance?: any;
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
  sample_provenance?: SampleProvenance;
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

export interface InferenceSensitivityItem {
  estimator: string;
  parameter: string;
  inference_method: string;
  block_size_events: number;
  unit_description: string;
  point_estimate: number | null;
  standard_error: number | null;
  ci_95: [number, number] | null;
  ci_contains_zero: boolean | null;
  ci_contains_half: boolean | null;
  replications: number;
  verdict: string;
}

export interface ModelFitStats {
  name: string;
  status?: string;
  is_estimable?: boolean;
  unestimable_reason?: string;
  fit?: Record<string, any> | null;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  metrics_diagnostics?: Record<string, any>;
  input_diagnostics?: Record<string, any>;
  inference_sensitivity_table?: InferenceSensitivityItem[];
  sensitivity_verdict?: string;
  sensitivity_summary?: string;
  moving_block_bootstrap?: any;
  alpha?: number | null;
  alpha_se?: number | null;
  beta?: number | null;
  beta_se?: number | null;
  beta_t_stat?: number | null;
  beta_p_value?: number | null;
  gamma?: number | null;
  gamma_se?: number | null;
  ci_95_lower?: number | null;
  ci_95_upper?: number | null;
  r_squared?: number | null;
  r_squared_binned?: number | null;
  aic?: number | null;
  bic?: number | null;
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
    t_statistic_trade?: number | null;
    p_value_trade?: number | null;
    df_resid?: number | null;
    confidence_interval_95?: [number, number] | null;
    is_significant_5pct?: boolean;
    regression_observations?: number;
    sampling_stride?: number;
    positive_trades_count?: number;
    zero_trades_count?: number;
    negative_trades_count?: number;
    total_trades_count?: number;
    positive_trades_pct?: number;
  };
  out_of_sample_validation?: {
    description?: string;
    model_specification?: string;
    evaluation_scope?: string;
    purging_applied?: boolean;
    purged_boundary_trades?: number;
    purging_rationale?: string;
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
    power_law_oos_r2?: number | null;
    is_power_law_oos?: boolean;
    note?: string;
  };
  walk_forward_validation?: WalkForwardValidation;
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

export interface WalkForwardFold {
  fold: number;
  train_indices?: [number, number];
  test_indices?: [number, number];
  train_observations: number;
  test_observations: number;
  purged_observations: number;
  train_start_utc?: string;
  train_end_utc?: string;
  test_start_utc?: string;
  test_end_utc?: string;
  log_model?: {
    alpha: number;
    beta: number;
    train_r2: number;
  };
  power_law_model?: {
    status: string;
    alpha?: number | null;
    gamma?: number | null;
    alpha_wls?: number | null;
    gamma_wls?: number | null;
    train_r2_binned?: number | null;
    train_r2_wls?: number | null;
  };
  log_oos_r2: number;
  power_oos_r2?: number | null;
}

export interface PooledOOSMetrics {
  aggregation_method: string;
  total_unique_predictions: number;
  total_purged_boundary_trades: number;
  log_oos_r2: number;
  power_oos_r2?: number | null;
  denominator_ss_tot: number;
}

export interface FoldMacroMetrics {
  mean_log_oos_r2: number;
  std_log_oos_r2: number;
  mean_power_oos_r2?: number | null;
  std_power_oos_r2?: number | null;
}

export interface WalkForwardValidation {
  protocol?: string;
  folds_count: number;
  valid_folds_count?: number;
  failed_folds_count?: number;
  purged_trades_per_boundary: number;
  total_purged_boundary_trades?: number;
  pooled_oos?: PooledOOSMetrics;
  fold_macro_metrics?: FoldMacroMetrics;
  mean_log_oos_r2: number;
  mean_power_oos_r2?: number | null;
  folds: WalkForwardFold[];
}

export interface ArtifactMetadata {
  schema_version: string;
  build_commit: string;
  generation_timestamp_utc: string;
  dataset_source: string;
  dataset_file: string;
  dataset_sha256: string;
  dataset_row_count: number;
  evaluation_protocol: string;
  purged_boundary_trades: number;
  models_compared: string[];
}

export interface SampleProvenance {
  spec_version: string;
  symbol: string;
  date: string;
  selection_method: string;
  total_input_rows: number;
  duplicates_dropped: number;
  invalid_rows_dropped: number;
  total_valid_rows: number;
  window_start_index: number;
  selected_row_count: number;
  start_trade_id: number;
  end_trade_id: number;
  start_time_utc: string;
  end_time_utc: string;
  trade_ids_sha256: string;
  content_sha256: string;
}

export interface SampleAccounting {
  date: string;
  symbol: string;
  raw_input_total_rows: number;
  normalized_catalog_rows: number;
  session_selection_method: string;
  session_offset_ratio: number;
  session_start_index: number;
  response_curve_window_trades: number;
  response_curve_start_time_utc: string;
  response_curve_end_time_utc: string;
  response_curve_start_trade_id?: number;
  response_curve_end_trade_id?: number;
  response_curve_content_sha256?: string;
  response_curve_trade_ids_sha256?: string;
  response_curve_purpose: string;
  impact_model_window_trades: number;
  impact_model_start_time_utc: string;
  impact_model_end_time_utc: string;
  impact_model_start_trade_id: number;
  impact_model_end_trade_id: number;
  impact_model_purpose: string;
  window_difference_explanation: string;
  horizon_lag: number;
  effective_horizon_observations: number;
  horizon_loss_explanation: string;
  positive_displacement_trades: number;
  positive_displacement_pct: number;
  regression_subsample_trades: number;
  regression_sampling_stride: number;
  regression_stride_explanation: string;
  sample_content_sha256: string;
  sample_trade_ids_sha256: string;
}

export interface ProvenanceChain {
  raw_archive: {
    filename: string;
    sha256: string | null;
    available_on_disk: boolean;
    official_source: string;
  };
  normalization: {
    version: string;
    file_path: string;
    dataset_sha256: string;
    total_rows: number;
  };
  sample_selection: SampleProvenance;
  sample_accounting: SampleAccounting;
  execution_environment: {
    build_commit: string;
    generation_timestamp_utc: string;
    environment_type: string;
    production_recomputed: boolean;
  };
}

export interface CrossDayWalkForwardFold {
  fold: number;
  train_dates: string[];
  test_date: string;
  train_observations: number;
  test_observations: number;
  log_model: {
    train_alpha: number;
    train_beta: number;
    train_r2: number;
    oos_r2: number;
  };
  power_law_model: {
    train_alpha_wls: number;
    train_gamma_wls: number;
    train_r2_wls: number;
    test_independent_gamma: number;
    gamma_drift: number | null;
    oos_r2: number | null;
  };
}

export interface ExperimentComparisonSuite {
  schema_version: string;
  generated_timestamp_utc: string;
  target_asset: string;
  data_disclosure: string;
  evaluation_engine: string;
  cross_day_walk_forward_k20: {
    protocol: string;
    symbol: string;
    horizon_lag: number;
    sample_size_per_day: number;
    dates_evaluated: string[];
    folds: CrossDayWalkForwardFold[];
    summary_metrics: {
      mean_cross_day_oos_r2_log: number | null;
      mean_cross_day_oos_r2_power_law: number | null;
      regime_stability_verdict?: string;
      empirical_implication?: string;
      evaluation_verdict?: string;
      empirical_conclusion?: string;
    };
    empirical_conclusion?: string;
  };
  cross_day_walk_forward_k100: {
    protocol: string;
    symbol: string;
    horizon_lag: number;
    sample_size_per_day: number;
    dates_evaluated: string[];
    folds: CrossDayWalkForwardFold[];
    summary_metrics: {
      mean_cross_day_oos_r2_log: number | null;
      mean_cross_day_oos_r2_power_law: number | null;
      regime_stability_verdict?: string;
      empirical_implication?: string;
      evaluation_verdict?: string;
      empirical_conclusion?: string;
    };
    empirical_conclusion?: string;
  };
  regime_characterization: Record<string, {
    regime_name: string;
    realized_volatility_bps: number;
    trade_count: number;
    session_sampled_window: string;
    scaling_exponent_gamma_wls: number;
  }>;
  methodological_caveat?: string;
}

export interface ImpactModelsData {
  horizon_events: number;
  observations: number;
  sample_size?: number;
  specification_note?: string;
  sample_provenance?: SampleProvenance;
  sample_accounting?: SampleAccounting;
  provenance_chain?: ProvenanceChain;
  sample_metadata?: {
    symbol?: string;
    horizon_lag?: number;
    total_observations?: number;
    sample_start_utc?: string;
    sample_end_utc?: string;
    sample_duration_seconds?: number;
    sampling_method?: string;
    generation_timestamp_utc?: string;
    status?: string;
    disclaimer?: string;
    scope_limitation_disclosure?: string;
  };
  binned_empirical: EmpiricalBinPoint[];
  linear_model: ModelFitStats;
  logarithmic_model: ModelFitStats;
  power_law_model: ModelFitStats;
  out_of_sample_validation?: ModelFitStats['out_of_sample_validation'];
  walk_forward_validation?: WalkForwardValidation;
  inference_sensitivity_table?: InferenceSensitivityItem[];
  sensitivity_verdict?: string;
  sensitivity_summary?: string;
  artifact_metadata?: ArtifactMetadata;
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

// ---------------------------------------------------------------------------
// V2.0 Deep Water Quant Analytics: VPIN, Adverse Selection, Lead-Lag
// ---------------------------------------------------------------------------

export type ToxicityRegime = 'LOW_TOXICITY_HOMOGENEOUS' | 'MODERATE_INFORMED' | 'SEVERE_TOXIC_TSUNAMI';

export interface VPINBucket {
  bucket_idx: number;
  start_time_utc?: string;
  end_time_utc?: string;
  time_utc: string;
  timestamp_ns: number;
  vwap: number;
  volume_btc?: number;
  buy_volume: number;
  sell_volume: number;
  imbalance: number;
  vpin: number | null;
}

export interface VPINSummary {
  mean_vpin: number;
  median_vpin: number;
  p90_vpin: number;
  p95_vpin: number;
  p99_vpin: number;
  max_vpin: number;
  min_vpin: number;
  regime: ToxicityRegime;
  toxic_bucket_count: number;
  total_valid_buckets: number;
  cdf_distribution: Array<{ percentile: number; vpin_threshold: number }>;
}

export interface VPINResponse {
  status: string;
  bucket_size_btc: number;
  window_buckets: number;
  total_buckets: number;
  vpin_series: VPINBucket[];
  summary: VPINSummary;
  date?: string;
  symbol?: string;
}

export interface AdverseSelectionHorizon {
  horizon_sec: number;
  effective_spread_bps: number;
  adverse_selection_bps: number;
  realized_spread_bps: number;
  adverse_selection_ratio: number;
  is_mm_profitable: boolean;
}

export interface TopToxicTrade {
  trade_id: number;
  time_utc: string;
  price: number;
  size_btc: number;
  direction: 'BUY' | 'SELL';
  adverse_selection_bps: number;
  dollar_impact_usd: number;
}

export interface WaterfallAttribution {
  hypothetical_turnover_btc: number;
  gross_spread_captured_usd: number;
  toxic_flow_adverse_selection_loss_usd: number;
  net_market_making_pnl_usd: number;
  net_profit_margin_bps: number;
}

export interface AdverseSelectionResponse {
  status: string;
  effective_half_spread_bps: number;
  horizons: AdverseSelectionHorizon[];
  top_toxic_trades: TopToxicTrade[];
  waterfall_attribution: WaterfallAttribution;
  date?: string;
  symbol?: string;
}

export interface LeadLagPoint {
  lag_ms: number;
  cross_correlation: number;
  is_peak: boolean;
}

export interface HasbrouckBounds {
  futures_lower_bound_pct: number;
  futures_upper_bound_pct: number;
  spot_lower_bound_pct: number;
  spot_upper_bound_pct: number;
  verdict: string;
}

export interface GonzaloGrangerShare {
  futures_component_share_pct: number;
  spot_component_share_pct: number;
  arbitrage_friction_bps: number;
}

export interface LeadLagResponse {
  status: string;
  spot_symbol: string;
  futures_symbol: string;
  peak_lead_ms: number;
  peak_cross_correlation: number;
  leader_market: string;
  cross_correlation_curve: LeadLagPoint[];
  hasbrouck_information_share: HasbrouckBounds;
  gonzalo_granger_component_share: GonzaloGrangerShare;
  empirical_verdict: string;
  date?: string;
  symbol?: string;
}
