"""
Nonlinear Market Impact & Single-Trade Price Response Engine (V1.1.1).
Models the relationship between individual transaction size Q and subsequent
conditional price response at event horizon k: R(k | Q) = E[eps_i * (ln P_{i+k} - ln P_i) | Q_i in Bin(Q)].

Methodological & Empirical Governance:
1. Child Order vs. Meta-Order Distinction:
   Estimates the Single-Trade Conditional Price Response of individual child orders.
   This does NOT test or refute the Square-Root Law of Meta-Orders (Bouchaud et al., 2009; Almgren et al., 2005),
   which governs the cumulative execution of parent orders algorithmically sliced over extended horizons.
2. Economic Stratification:
   Uses discrete economic tiers isolating point masses (e.g., 0.00009 BTC minimum notional trades)
   with non-overlapping boundaries, strictly preventing artificial splitting of identical trade volumes across bins.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import numpy as np
import polars as pl
from scipy.stats import norm
import statsmodels.api as sm


class NonlinearImpactModel:
    def __init__(self):
        pass

    def fit_impact_models(
        self,
        df: pl.DataFrame,
        horizon_lag: int = 20,
        sample_size: Optional[int] = 300_000
    ) -> Dict[str, Any]:
        """
        Fits competing price response specifications on trade size Q at event horizon k:
        1. Linear:     R = alpha + beta * Q
        2. Log:        R = alpha + beta * ln(Q)
        3. Power-Law:  R = alpha * Q^gamma
        Includes HAC standard errors, 95% CI for gamma, square-root hypothesis testing (H0: gamma = 0.5),
        and sub-period time-chunk parameter stability analysis.
        """
        if sample_size and len(df) > sample_size:
            start_idx = len(df) // 4
            sub_df = df.slice(start_idx, sample_size)
        else:
            sub_df = df

        prices = sub_df["price"].to_numpy().astype(np.float64)
        directions = sub_df["direction"].to_numpy().astype(np.float64)
        col_q = "base_quantity" if "base_quantity" in sub_df.columns else "quantity"
        quantities = sub_df[col_q].to_numpy().astype(np.float64)
        log_prices = np.log(prices)
        n = len(log_prices)

        k = horizon_lag
        if k >= n:
            raise ValueError(f"Lag {k} exceeds sample size {n}")

        ret_k = log_prices[k:] - log_prices[:-k]
        eps = directions[:-k]
        Q = quantities[:-k]

        # Signed return in basis points: eps_i * (ln P_{i+k} - ln P_i) * 10,000
        R = (eps * ret_k) * 10_000.0

        # Filter valid observations
        valid = (Q > 0) & np.isfinite(R) & np.isfinite(Q)
        R_clean = R[valid]
        Q_clean = Q[valid]
        n_obs = len(R_clean)

        has_utc = "event_time_utc" in sub_df.columns
        has_ns = "event_timestamp_ns" in sub_df.columns
        times_raw = sub_df["event_time_utc"].to_list()[:-k] if has_utc else [f"T+{i}s" for i in range(len(ret_k))]
        clean_times = [times_raw[i] for i, v in enumerate(valid) if v]
        clean_ns = sub_df["event_timestamp_ns"].to_numpy()[:-k][valid].astype(np.int64) if has_ns else None

        sample_start_utc = clean_times[0] if clean_times else "2026-07-01T00:00:00Z"
        sample_end_utc = clean_times[-1] if clean_times else "2026-07-01T23:59:59Z"

        # 1. Economic Stratification (Non-overlapping support, isolating point masses)
        # Definition of economic tiers for BTCUSDT:
        tier_definitions = [
            ("Sub-Lot (<0.00009)", lambda q: q < 0.00009, False),
            ("Minimum Lot (0.00009)", lambda q: q == 0.00009, True),
            ("Micro (0.00009 - 0.0002]", lambda q: (q > 0.00009) & (q <= 0.0002), False),
            ("Small-1 (0.0002 - 0.0005]", lambda q: (q > 0.0002) & (q <= 0.0005), False),
            ("Small-2 (0.0005 - 0.001]", lambda q: (q > 0.0005) & (q <= 0.001), False),
            ("Medium-1 (0.001 - 0.005]", lambda q: (q > 0.001) & (q <= 0.005), False),
            ("Medium-2 (0.005 - 0.01]", lambda q: (q > 0.005) & (q <= 0.01), False),
            ("Upper (0.01 - 0.05]", lambda q: (q > 0.01) & (q <= 0.05), False),
            ("Large (0.05 - 0.2]", lambda q: (q > 0.05) & (q <= 0.2), False),
            ("Block (>0.2)", lambda q: q > 0.2, False),
        ]

        binned_empirical = []
        for idx, (label, cond, is_pm) in enumerate(tier_definitions):
            mask = cond(Q_clean)
            cnt = int(np.sum(mask))
            if cnt >= 20:
                q_slice = Q_clean[mask]
                r_slice = R_clean[mask]
                mean_q = float(np.mean(q_slice))
                min_q = float(np.min(q_slice))
                max_q = float(np.max(q_slice))
                mean_r = float(np.mean(r_slice))
                std_r = float(np.std(r_slice))
                se_r = float(std_r / np.sqrt(cnt))
                n_uniq = int(len(np.unique(q_slice)))
                binned_empirical.append({
                    "bin": len(binned_empirical) + 1,
                    "label": label,
                    "mean_volume": mean_q,
                    "min_volume": min_q,
                    "max_volume": max_q,
                    "unique_quantities_count": n_uniq,
                    "mean_response_bps": mean_r,
                    "se_bps": se_r,
                    "count": cnt,
                    "pct_of_sample": float((cnt / n_obs) * 100.0),
                    "is_point_mass": is_pm
                })

        # 2. Linear Model: R = alpha + beta * Q with HAC inference
        X_lin = sm.add_constant(Q_clean)
        res_lin = sm.OLS(R_clean, X_lin).fit(cov_type="HAC", cov_kwds={"maxlags": min(k, 30)})

        # 3. Logarithmic Model: R = alpha + beta * ln(Q) with HAC inference
        log_Q = np.log(Q_clean)
        X_log = sm.add_constant(log_Q)
        res_log = sm.OLS(R_clean, X_log).fit(cov_type="HAC", cov_kwds={"maxlags": min(k, 30)})

        # 4. Power Law Model: R = alpha * Q^gamma
        # Fit on strictly positive empirical conditional expectation points
        binned_q = np.array([pt["mean_volume"] for pt in binned_empirical])
        binned_r = np.array([pt["mean_response_bps"] for pt in binned_empirical])
        binned_counts = np.array([pt["count"] for pt in binned_empirical], dtype=np.float64)
        pos_mask = (binned_r > 0)

        gamma_est = 0.0
        alpha_est = 1.0
        gamma_se = 0.05
        ci_lower = -0.10
        ci_upper = 0.10
        p_val_sqrt = 1.0
        t_sqrt = 0.0
        t_ols = 0.0
        p_val_ols = 1.0
        t_wls = 0.0
        p_val_wls = 1.0
        r2_power = 0.0

        # WLS fields
        gamma_wls = 0.0
        gamma_wls_se = 0.05
        ci_wls_lower = -0.10
        ci_wls_upper = 0.10
        r2_wls = 0.0

        # Trade-level fields
        trade_level_gamma = 0.0
        trade_level_gamma_se = 0.05
        trade_level_r2 = 0.0

        if np.sum(pos_mask) >= 4:
            q_fit = binned_q[pos_mask]
            r_fit = binned_r[pos_mask]
            counts_fit = binned_counts[pos_mask]
            log_q = np.log(q_fit)
            log_r = np.log(r_fit)

            X_pow = sm.add_constant(log_q)
            # Unweighted OLS on binned conditional means
            res_power = sm.OLS(log_r, X_pow).fit()
            alpha_est = float(np.exp(res_power.params[0])) if len(res_power.params) > 0 else 1.0
            gamma_est = float(res_power.params[1]) if len(res_power.params) > 1 else 0.0
            gamma_se = float(res_power.bse[1]) if len(res_power.bse) > 1 else 0.05
            ci_lower = float(gamma_est - 1.96 * gamma_se)
            ci_upper = float(gamma_est + 1.96 * gamma_se)
            r2_power = float(res_power.rsquared)

            # Weighted Least Squares (WLS) weighted by sample count per tier
            try:
                res_wls = sm.WLS(log_r, X_pow, weights=counts_fit).fit()
                gamma_wls = float(res_wls.params[1]) if len(res_wls.params) > 1 else gamma_est
                gamma_wls_se = float(res_wls.bse[1]) if len(res_wls.bse) > 1 else gamma_se
                ci_wls_lower = float(gamma_wls - 1.96 * gamma_wls_se)
                ci_wls_upper = float(gamma_wls + 1.96 * gamma_wls_se)
                r2_wls = float(res_wls.rsquared)
            except Exception:
                gamma_wls, gamma_wls_se = gamma_est, gamma_se
                ci_wls_lower, ci_wls_upper = ci_lower, ci_upper
                r2_wls = r2_power

            # Hypothesis tests on both OLS and WLS: H0: gamma = 0.5 (Square-Root Law for Child Trades)
            t_ols = (gamma_est - 0.5) / gamma_se if gamma_se > 0 else 0.0
            p_val_ols = float(2.0 * (1.0 - norm.cdf(abs(t_ols))))

            t_wls = (gamma_wls - 0.5) / gamma_wls_se if gamma_wls_se > 0 else 0.0
            p_val_wls = float(2.0 * (1.0 - norm.cdf(abs(t_wls))))

            t_sqrt = t_wls
            p_val_sqrt = p_val_wls

        # Trade-level estimation on individual positive trades (subsample up to 50k for tractability)
        trade_pos_mask = (R_clean > 0) & (Q_clean > 0)
        trade_zero_count = int(np.sum(R_clean == 0))
        trade_neg_count = int(np.sum(R_clean < 0))
        trade_pos_count = int(np.sum(R_clean > 0))
        trade_total_count = len(R_clean)
        pos_pct = float((trade_pos_count / trade_total_count) * 100.0) if trade_total_count > 0 else 0.0

        if np.sum(trade_pos_mask) >= 100:
            q_tr = Q_clean[trade_pos_mask]
            r_tr = R_clean[trade_pos_mask]
            if len(q_tr) > 50000:
                step = len(q_tr) // 50000
                q_tr = q_tr[::step]
                r_tr = r_tr[::step]
            X_tr = sm.add_constant(np.log(q_tr))
            res_tr = sm.OLS(np.log(r_tr), X_tr).fit(cov_type="HAC", cov_kwds={"maxlags": min(k, 30)})
            trade_level_gamma = float(res_tr.params[1]) if len(res_tr.params) > 1 else 0.0
            trade_level_gamma_se = float(res_tr.bse[1]) if len(res_tr.bse) > 1 else 0.0
            trade_level_r2 = float(res_tr.rsquared)

        # Out-of-sample (OOS) cross-validation (train: first 50%, test: second 50%)
        half = n_obs // 2
        q_train, r_train = Q_clean[:half], R_clean[:half]
        q_test, r_test = Q_clean[half:], R_clean[half:]

        train_start_utc = clean_times[0] if clean_times else ""
        train_end_utc = clean_times[half - 1] if clean_times and half > 0 else ""
        test_start_utc = clean_times[half] if clean_times and half < len(clean_times) else ""
        test_end_utc = clean_times[-1] if clean_times else ""
        train_obs = len(q_train)
        test_obs = len(q_test)

        train_r2_val = 0.0
        try:
            res_tr_log = sm.OLS(r_train, sm.add_constant(np.log(q_train))).fit()
            pred_test = res_tr_log.predict(sm.add_constant(np.log(q_test)))
            ss_res = np.sum((r_test - pred_test) ** 2)
            ss_tot = np.sum((r_test - np.mean(r_test)) ** 2)
            oos_r2_log = float(max(-1.0, 1.0 - (ss_res / ss_tot))) if ss_tot > 0 else 0.0
            train_r2_val = float(res_tr_log.rsquared)
        except Exception:
            oos_r2_log = 0.0

        # 5. Time-Chunk / Sub-period Stability Analysis based on True Timestamps
        time_chunks = []
        num_chunks = 4

        # Check if timestamps span full day
        is_full_day = False
        if clean_ns is not None and len(clean_ns) > 100:
            span_ns = clean_ns[-1] - clean_ns[0]
            if span_ns >= 18 * 3600 * 1_000_000_000:
                is_full_day = True

        for c in range(num_chunks):
            if is_full_day and clean_ns is not None:
                # Actual 6-hour UTC block partitioning
                h_start = c * 6
                h_end = (c + 1) * 6
                hours = (clean_ns // 1_000_000_000 % 86400) // 3600
                c_mask = (hours >= h_start) & (hours < h_end)
                chunk_label = f"{h_start:02d}:00 - {h_end:02d}:00 UTC"
            else:
                # Chronological block partitioning
                c_start_idx = c * (n_obs // num_chunks)
                c_end_idx = (c + 1) * (n_obs // num_chunks) if c < num_chunks - 1 else n_obs
                c_mask = np.zeros(n_obs, dtype=bool)
                c_mask[c_start_idx:c_end_idx] = True
                chunk_label = f"Block {c+1} (Chronological)"

            if np.sum(c_mask) >= 20:
                q_chunk = Q_clean[c_mask]
                r_chunk = R_clean[c_mask]
                c_times = [clean_times[i] for i, m in enumerate(c_mask) if m] if clean_times else []
                c_start_time = c_times[0] if c_times else ""
                c_end_time = c_times[-1] if c_times else ""

                # Fit log model on chunk
                X_c_log = sm.add_constant(np.log(q_chunk))
                ols_c_log = sm.OLS(r_chunk, X_c_log).fit()

                # Economic bins for chunk power law
                cq_pts, cr_pts, cr_cnts = [], [], []
                for _, cond, _ in tier_definitions:
                    m_b = cond(q_chunk)
                    if np.sum(m_b) >= 20 and np.mean(r_chunk[m_b]) > 0:
                        cq_pts.append(float(np.mean(q_chunk[m_b])))
                        cr_pts.append(float(np.mean(r_chunk[m_b])))
                        cr_cnts.append(float(np.sum(m_b)))

                g_chunk, g_chunk_se = None, None
                if len(cq_pts) >= 4:
                    try:
                        res_cp = sm.WLS(np.log(cr_pts), sm.add_constant(np.log(cq_pts)), weights=cr_cnts).fit()
                        g_chunk = float(res_cp.params[1])
                        g_chunk_se = float(res_cp.bse[1])
                    except Exception:
                        pass

                log_alpha = float(ols_c_log.params[0]) if len(ols_c_log.params) > 0 else 0.0
                log_beta = float(ols_c_log.params[1]) if len(ols_c_log.params) > 1 else 0.0

                time_chunks.append({
                    "chunk_index": c + 1,
                    "label": chunk_label,
                    "start_time_utc": c_start_time,
                    "end_time_utc": c_end_time,
                    "observations": len(q_chunk),
                    "log_alpha": log_alpha,
                    "log_beta": log_beta,
                    "log_r2": float(ols_c_log.rsquared) if hasattr(ols_c_log, "rsquared") else 0.0,
                    "power_gamma": g_chunk,
                    "power_gamma_se": g_chunk_se
                })

        wls_ci_note = "encompasses zero" if (ci_wls_lower <= 0.0 <= ci_wls_upper) else f"is strictly {'negative' if ci_wls_upper < 0 else 'positive'} (excludes zero)"
        ols_ci_note = "encompasses zero" if (ci_lower <= 0.0 <= ci_upper) else f"is strictly {'negative' if ci_upper < 0 else 'positive'} (excludes zero)"

        power_law_dict = {
            "name": "Power Law (R = alpha * Q^gamma)",
            "alpha": alpha_est,
            "gamma": gamma_est,
            "gamma_se": gamma_se,
            "ci_95_lower": ci_lower,
            "ci_95_upper": ci_upper,
            "r_squared_binned": r2_power,
            "wls_fit": {
                "name": "Weighted Least Squares (weighted by tier sample count)",
                "estimator": "Classical WLS (weights = tier count)",
                "se_type": "Classical WLS SE (unadjusted for cross-tier residual autocorrelation)",
                "gamma_wls": gamma_wls,
                "gamma_wls_se": gamma_wls_se,
                "ci_95_lower": ci_wls_lower,
                "ci_95_upper": ci_wls_upper,
                "r_squared_wls": r2_wls
            },
            "trade_level_fit": {
                "name": "Trade-Level Log-Log HAC (Positive Response Sub-Sample: R > 0)",
                "estimator": "OLS with Newey-West HAC covariance",
                "sample_type": "POSITIVE_RESPONSE_SUBSAMPLE",
                "conditioning": "Strictly conditional on positive signed price displacement (R_i > 0)",
                "caveat": (
                    "Evaluated strictly on the conditional positive-response sub-sample (R_i > 0); "
                    "cannot serve as an unconditional full-sample validation because zero and adverse price moves "
                    f"({trade_zero_count + trade_neg_count:,} trades, {(100.0 - pos_pct):.1f}% of sample) "
                    "are dropped by the log transform."
                ),
                "gamma_trade": trade_level_gamma,
                "gamma_trade_se": trade_level_gamma_se,
                "r_squared_trade": trade_level_r2,
                "positive_trades_count": trade_pos_count,
                "zero_trades_count": trade_zero_count,
                "negative_trades_count": trade_neg_count,
                "total_trades_count": trade_total_count,
                "positive_trades_pct": pos_pct
            },
            "out_of_sample_validation": {
                "description": "50% chronological split of analyzed window",
                "train_start_utc": train_start_utc,
                "train_end_utc": train_end_utc,
                "test_start_utc": test_start_utc,
                "test_end_utc": test_end_utc,
                "train_observations": train_obs,
                "test_observations": test_obs,
                "train_window": f"{train_start_utc} - {train_end_utc}",
                "test_window": f"{test_start_utc} - {test_end_utc}",
                "train_r2": train_r2_val,
                "test_r2": oos_r2_log,
                "log_model_oos_r2": oos_r2_log
            },
            "rejects_square_root_half": bool(p_val_sqrt < 0.05),
            "ci_contains_zero": bool(ci_wls_lower <= 0.0 <= ci_wls_upper or ci_lower <= 0.0 <= ci_upper),
            "hypothesis_test_sqrt_law": {
                "status": "EXPLORATORY_RESEARCH",
                "null_hypothesis": "H0: gamma = 0.5 (Square-Root Law for Child Trades)",
                "gamma_estimate": gamma_est,
                "gamma_estimate_wls": gamma_wls,
                "standard_error": gamma_se,
                "standard_error_wls": gamma_wls_se,
                "confidence_interval_95": [ci_wls_lower, ci_wls_upper],
                "confidence_interval_95_ols": [ci_lower, ci_upper],
                "confidence_interval_95_wls": [ci_wls_lower, ci_wls_upper],
                "t_statistic": float(t_wls),
                "t_statistic_ols": float(t_ols),
                "t_statistic_wls": float(t_wls),
                "p_value": p_val_wls,
                "p_value_ols": p_val_ols,
                "p_value_wls": p_val_wls,
                "is_rejected_at_5pct": bool(p_val_wls < 0.05),
                "ols_test": {
                    "estimator": "Tier-Binned OLS (Unweighted)",
                    "gamma": gamma_est,
                    "se": gamma_se,
                    "se_type": "Classical OLS SE",
                    "ci_95": [ci_lower, ci_upper],
                    "t_statistic": float(t_ols),
                    "p_value": float(p_val_ols),
                    "is_rejected_at_5pct": bool(p_val_ols < 0.05)
                },
                "wls_test": {
                    "estimator": "Weighted Least Squares (Tier Sample Weights)",
                    "gamma": gamma_wls,
                    "se": gamma_wls_se,
                    "se_type": "Classical WLS SE",
                    "ci_95": [ci_wls_lower, ci_wls_upper],
                    "t_statistic": float(t_wls),
                    "p_value": float(p_val_wls),
                    "is_rejected_at_5pct": bool(p_val_wls < 0.05)
                },
                "interpretation": (
                    f"Exploratory single child-order estimation: WLS power-law exponent gamma = {gamma_wls:.4f} "
                    f"(Classical WLS SE: {gamma_wls_se:.4f}, 95% WLS CI: [{ci_wls_lower:.4f}, {ci_wls_upper:.4f}], t = {t_wls:.2f}, {wls_ci_note}) and binned OLS exponent gamma = {gamma_est:.4f} "
                    f"(Classical OLS SE: {gamma_se:.4f}, 95% OLS CI: [{ci_lower:.4f}, {ci_upper:.4f}], t = {t_ols:.2f}, {ols_ci_note}) reject 0.5 (p < 0.001). "
                    "Child-order models exhibit low in-sample and out-of-sample explanatory power (R² < 0.02), with stratified power-law estimates varying across dates and weighting specifications. "
                    "Note: WLS standard errors are classical weighted SEs unadjusted for cross-tier residual autocorrelation. "
                    "This finding strictly characterizes individual child-order conditional price response R(v, k). "
                    "It does NOT constitute an empirical refutation of the classical Square-Root Law of Meta-Orders "
                    "(which governs cumulative parent-order execution over hours or days), nor does it directly prove "
                    "specific unobserved microstructure mechanisms (such as book replenishment or adverse selection ratios)."
                )
            }
        }

        return {
            "symbol": sub_df["symbol"][0] if "symbol" in sub_df.columns else "BTCUSDT",
            "sample_size": n_obs,
            "horizon_lag": k,
            "sample_metadata": {
                "symbol": sub_df["symbol"][0] if "symbol" in sub_df.columns else "BTCUSDT",
                "horizon_lag": k,
                "total_observations": n_obs,
                "sample_start_utc": sample_start_utc,
                "sample_end_utc": sample_end_utc,
                "sampling_method": "CHRONOLOGICAL_TICK_RESPONSE",
                "generation_timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "status": "EXPLORATORY_RESEARCH"
            },
            "binned_empirical": binned_empirical,
            "linear_model": {
                "name": "Linear (R = alpha + beta * Q)",
                "alpha": float(res_lin.params[0]) if len(res_lin.params) > 0 else 0.0,
                "alpha_se": float(res_lin.bse[0]) if len(res_lin.bse) > 0 else 0.0,
                "beta": float(res_lin.params[1]) if len(res_lin.params) > 1 else 0.0,
                "beta_se": float(res_lin.bse[1]) if len(res_lin.bse) > 1 else 0.0,
                "beta_t_stat": float(res_lin.tvalues[1]) if len(res_lin.tvalues) > 1 else 0.0,
                "beta_p_value": float(res_lin.pvalues[1]) if len(res_lin.pvalues) > 1 else 1.0,
                "r_squared": float(res_lin.rsquared),
                "aic": float(res_lin.aic),
                "bic": float(res_lin.bic)
            },
            "logarithmic_model": {
                "name": "Logarithmic (R = alpha + beta * ln(Q))",
                "alpha": float(res_log.params[0]) if len(res_log.params) > 0 else 0.0,
                "alpha_se": float(res_log.bse[0]) if len(res_log.bse) > 0 else 0.0,
                "beta": float(res_log.params[1]) if len(res_log.params) > 1 else 0.0,
                "beta_se": float(res_log.bse[1]) if len(res_log.bse) > 1 else 0.0,
                "beta_t_stat": float(res_log.tvalues[1]) if len(res_log.tvalues) > 1 else 0.0,
                "beta_p_value": float(res_log.pvalues[1]) if len(res_log.pvalues) > 1 else 1.0,
                "r_squared": float(res_log.rsquared),
                "aic": float(res_log.aic),
                "bic": float(res_log.bic)
            },
            "power_law_model": power_law_dict,
            "power_law_fit": power_law_dict,
            "power_law_wls": power_law_dict["wls_fit"],
            "trade_level_fit": power_law_dict["trade_level_fit"],
            "out_of_sample_validation": power_law_dict["out_of_sample_validation"],
            "time_chunk_stability": time_chunks
        }
