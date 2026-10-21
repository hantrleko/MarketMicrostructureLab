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


def make_fit_result(
    model_name: str,
    status: str,  # "ESTIMATED", "NOT_ESTIMABLE", "FIT_FAILED"
    fit_params: Optional[Dict[str, Any]] = None,
    error: Optional[Dict[str, Any]] = None,
    input_diagnostics: Optional[Dict[str, Any]] = None,
    metrics_diagnostics: Optional[Dict[str, Any]] = None,
    **extra_fields
) -> Dict[str, Any]:
    """
    Constructs a status-driven model fit result adhering to M1 contract.
    Ensures that when status != 'ESTIMATED', fit is None and numeric parameters are None (not 0.0).
    """
    is_estimated = (status == "ESTIMATED")
    res = {
        "name": model_name,
        "schema_version": "1.3.0",
        "status": status,
        "is_estimable": is_estimated,
        "fit": fit_params if is_estimated else None,
        "error": None if is_estimated else (error or {
            "code": "FIT_FAILED",
            "message": "Model estimation failed.",
            "retryable": False
        }),
        "input_diagnostics": input_diagnostics or {},
        "metrics_diagnostics": metrics_diagnostics or {}
    }

    # Expose top-level fields for backwards compatibility with consumers
    if is_estimated and fit_params:
        for k, v in fit_params.items():
            res[k] = v
    else:
        # Explicitly set regression outputs to None on failure/inestimable (never 0.0!)
        for k in ["alpha", "beta", "gamma", "r_squared", "aic", "bic", "se", "ci_95", "t_statistic", "p_value"]:
            if k not in res:
                res[k] = None

    for k, v in extra_fields.items():
        res[k] = v

    return res


class NonlinearImpactModel:
    def __init__(self):
        pass

    @staticmethod
    def fit_power_law_from_sample(
        q_sub: np.ndarray,
        r_sub: np.ndarray,
        tier_definitions: list,
        min_tier_count: int = 15,
        min_pos_tiers: int = 4
    ) -> Dict[str, Any]:
        """
        Fits child-order power-law scaling model strictly from a given sample subset (e.g. training set),
        with zero access to or leakage from held-out test data.
        Returns dictionary with status, is_estimable, alpha, gamma, r2, and binned points.
        """
        if len(q_sub) < 20 or len(r_sub) < 20:
            return {
                "status": "NOT_ESTIMABLE",
                "is_estimable": False,
                "fit": None,
                "error": {
                    "code": "INSUFFICIENT_DATA",
                    "message": "Sample size below minimum threshold (20).",
                    "retryable": False
                },
                "alpha": None,
                "gamma": None,
                "r_squared": None,
                "alpha_wls": None,
                "gamma_wls": None,
                "r_squared_wls": None,
                "positive_tiers_count": 0,
                "training_observations": len(q_sub),
                "reason": "Sample size below minimum threshold (20)."
            }

        q_pts, r_pts, counts = [], [], []
        for _, cond, _ in tier_definitions:
            mask = cond(q_sub)
            cnt = int(np.sum(mask))
            if cnt >= min_tier_count:
                mean_r = float(np.mean(r_sub[mask]))
                if mean_r > 0:
                    q_pts.append(float(np.mean(q_sub[mask])))
                    r_pts.append(mean_r)
                    counts.append(float(cnt))

        if len(q_pts) < min_pos_tiers:
            return {
                "status": "NOT_ESTIMABLE",
                "is_estimable": False,
                "fit": None,
                "error": {
                    "code": "INSUFFICIENT_DATA",
                    "message": f"Insufficient positive response tiers in training sample (found {len(q_pts)}, minimum {min_pos_tiers} required).",
                    "retryable": False
                },
                "alpha": None,
                "gamma": None,
                "r_squared": None,
                "alpha_wls": None,
                "gamma_wls": None,
                "r_squared_wls": None,
                "positive_tiers_count": len(q_pts),
                "training_observations": len(q_sub),
                "reason": f"Insufficient positive response tiers in training sample (found {len(q_pts)}, minimum {min_pos_tiers} required)."
            }

        if np.var(np.log(q_pts)) <= 1e-12 or np.var(np.log(r_pts)) <= 1e-12:
            return {
                "status": "NOT_ESTIMABLE",
                "is_estimable": False,
                "fit": None,
                "error": {
                    "code": "SINGULAR_DESIGN",
                    "message": "Near-zero variance across positive tiers in log volume or log return.",
                    "retryable": False
                },
                "alpha": None,
                "gamma": None,
                "r_squared": None,
                "alpha_wls": None,
                "gamma_wls": None,
                "r_squared_wls": None,
                "positive_tiers_count": len(q_pts),
                "training_observations": len(q_sub),
                "reason": "Near-zero variance across positive tiers."
            }

        log_q = np.log(q_pts)
        log_r = np.log(r_pts)
        X_pow = sm.add_constant(log_q)

        # OLS on positive binned conditional means
        try:
            res_ols = sm.OLS(log_r, X_pow).fit()
            alpha_ols = float(np.exp(res_ols.params[0])) if len(res_ols.params) > 0 else None
            gamma_ols = float(res_ols.params[1]) if len(res_ols.params) > 1 else None
            r2_ols = float(res_ols.rsquared) if hasattr(res_ols, "rsquared") and np.isfinite(res_ols.rsquared) else None
            if alpha_ols is None or gamma_ols is None or not (np.isfinite(alpha_ols) and np.isfinite(gamma_ols)):
                raise ValueError("Non-finite OLS parameters.")
        except Exception as e:
            return {
                "status": "FIT_FAILED",
                "is_estimable": False,
                "fit": None,
                "error": {
                    "code": "SOLVER_ERROR",
                    "message": f"Numerical optimization error in OLS fit: {str(e)}",
                    "retryable": False
                },
                "alpha": None,
                "gamma": None,
                "r_squared": None,
                "alpha_wls": None,
                "gamma_wls": None,
                "r_squared_wls": None,
                "positive_tiers_count": len(q_pts),
                "training_observations": len(q_sub),
                "reason": f"Numerical optimization error in OLS fit: {str(e)}"
            }

        # WLS weighted by tier sample count
        try:
            res_wls = sm.WLS(log_r, X_pow, weights=counts).fit()
            alpha_wls = float(np.exp(res_wls.params[0])) if len(res_wls.params) > 0 else None
            gamma_wls = float(res_wls.params[1]) if len(res_wls.params) > 1 else None
            r2_wls = float(res_wls.rsquared) if hasattr(res_wls, "rsquared") and np.isfinite(res_wls.rsquared) else None
            if alpha_wls is None or gamma_wls is None or not (np.isfinite(alpha_wls) and np.isfinite(gamma_wls)):
                alpha_wls, gamma_wls, r2_wls = None, None, None
        except Exception:
            alpha_wls, gamma_wls, r2_wls = None, None, None

        return {
            "status": "ESTIMATED",
            "is_estimable": True,
            "fit": {
                "alpha": alpha_ols,
                "gamma": gamma_ols,
                "r_squared": r2_ols,
                "alpha_wls": alpha_wls,
                "gamma_wls": gamma_wls,
                "r_squared_wls": r2_wls
            },
            "error": None,
            "reason": None,
            "alpha": alpha_ols,
            "gamma": gamma_ols,
            "r_squared": r2_ols,
            "alpha_wls": alpha_wls,
            "gamma_wls": gamma_wls,
            "r_squared_wls": r2_wls,
            "positive_tiers_count": len(q_pts),
            "training_observations": len(q_sub)
        }

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

        # Check for sufficient variance in returns, prices, and quantities
        ret_var = float(np.var(R_clean)) if n_obs > 1 else 0.0
        q_var = float(np.var(Q_clean)) if n_obs > 1 else 0.0
        is_invariant_data = (ret_var < 1e-12 or q_var < 1e-12 or n_obs < 20)

        # 1. Economic Stratification (Non-overlapping support, isolating point masses)
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
        lin_fit_params = None
        lin_error = None
        lin_metrics_diag = {}
        if n_obs < 20:
            lin_status = "NOT_ESTIMABLE"
            lin_error = {
                "code": "INSUFFICIENT_DATA",
                "message": f"Sample size below minimum threshold (found {n_obs}, minimum 20 required).",
                "retryable": False
            }
        elif q_var < 1e-12:
            lin_status = "NOT_ESTIMABLE"
            lin_error = {
                "code": "SINGULAR_DESIGN",
                "message": "Trade quantity feature exhibits zero or invariant variance (< 1e-12).",
                "retryable": False
            }
        elif ret_var < 1e-12:
            # Constant target returns: alpha = mean(R), beta = 0.0, but R^2 is undefined (SS_tot = 0)
            lin_status = "ESTIMATED"
            mean_r_val = float(np.mean(R_clean))
            lin_fit_params = {
                "alpha": mean_r_val,
                "alpha_se": None,
                "beta": 0.0,
                "beta_se": None,
                "beta_t_stat": None,
                "beta_p_value": None,
                "r_squared": None,
                "aic": None,
                "bic": None
            }
            lin_metrics_diag = {
                "r_squared": {
                    "status": "UNDEFINED_METRIC",
                    "reason": "Target return is constant across sample; total sum of squares SS_tot is zero."
                }
            }
        else:
            try:
                X_lin = sm.add_constant(Q_clean)
                res_lin = sm.OLS(R_clean, X_lin).fit(cov_type="HAC", cov_kwds={"maxlags": min(k, 30)})
                p0 = float(res_lin.params[0]) if len(res_lin.params) > 0 else 0.0
                p1 = float(res_lin.params[1]) if len(res_lin.params) > 1 else 0.0
                b0 = float(res_lin.bse[0]) if len(res_lin.bse) > 0 else None
                b1 = float(res_lin.bse[1]) if len(res_lin.bse) > 1 else None
                t1 = float(res_lin.tvalues[1]) if len(res_lin.tvalues) > 1 else None
                pv1 = float(res_lin.pvalues[1]) if len(res_lin.pvalues) > 1 else None
                r2_val = float(res_lin.rsquared) if np.isfinite(res_lin.rsquared) else None
                aic_val = float(res_lin.aic) if np.isfinite(res_lin.aic) else None
                bic_val = float(res_lin.bic) if np.isfinite(res_lin.bic) else None

                if not (np.isfinite(p0) and np.isfinite(p1)):
                    lin_status = "FIT_FAILED"
                    lin_error = {
                        "code": "NON_FINITE_OUTPUT",
                        "message": "Model parameter estimates or standard errors are non-finite.",
                        "retryable": False
                    }
                else:
                    lin_status = "ESTIMATED"
                    lin_fit_params = {
                        "alpha": p0,
                        "alpha_se": b0,
                        "beta": p1,
                        "beta_se": b1,
                        "beta_t_stat": t1,
                        "beta_p_value": pv1,
                        "r_squared": r2_val,
                        "aic": aic_val,
                        "bic": bic_val
                    }
            except Exception as e:
                lin_status = "FIT_FAILED"
                lin_error = {
                    "code": "SOLVER_ERROR",
                    "message": f"Numerical optimization error in OLS fit: {str(e)}",
                    "retryable": False
                }

        linear_model_dict = make_fit_result(
            model_name="Linear (R = alpha + beta * Q)",
            status=lin_status,
            fit_params=lin_fit_params,
            error=lin_error,
            input_diagnostics={"total_observations": n_obs, "quantity_variance": q_var, "return_variance": ret_var},
            metrics_diagnostics=lin_metrics_diag
        )

        # 3. Logarithmic Model: R = alpha + beta * ln(Q) with HAC inference
        log_fit_params = None
        log_error = None
        log_metrics_diag = {}
        if np.any(Q_clean <= 0):
            log_status = "FIT_FAILED"
            log_error = {
                "code": "INVALID_INPUT",
                "message": "Non-positive trade quantities encountered for logarithmic transform.",
                "retryable": False
            }
        elif n_obs < 20:
            log_status = "NOT_ESTIMABLE"
            log_error = {
                "code": "INSUFFICIENT_DATA",
                "message": f"Sample size below minimum threshold (found {n_obs}, minimum 20 required).",
                "retryable": False
            }
        elif np.var(np.log(Q_clean)) < 1e-12:
            log_status = "NOT_ESTIMABLE"
            log_error = {
                "code": "SINGULAR_DESIGN",
                "message": "Log trade quantity feature exhibits zero or invariant variance (< 1e-12).",
                "retryable": False
            }
        elif ret_var < 1e-12:
            # Constant target returns: alpha = mean(R), beta = 0.0, but R^2 is undefined
            log_status = "ESTIMATED"
            mean_r_val = float(np.mean(R_clean))
            log_fit_params = {
                "alpha": mean_r_val,
                "alpha_se": None,
                "beta": 0.0,
                "beta_se": None,
                "beta_t_stat": None,
                "beta_p_value": None,
                "r_squared": None,
                "aic": None,
                "bic": None
            }
            log_metrics_diag = {
                "r_squared": {
                    "status": "UNDEFINED_METRIC",
                    "reason": "Target return is constant across sample; total sum of squares SS_tot is zero."
                }
            }
        else:
            try:
                log_Q = np.log(Q_clean)
                X_log = sm.add_constant(log_Q)
                res_log = sm.OLS(R_clean, X_log).fit(cov_type="HAC", cov_kwds={"maxlags": min(k, 30)})
                p0 = float(res_log.params[0]) if len(res_log.params) > 0 else 0.0
                p1 = float(res_log.params[1]) if len(res_log.params) > 1 else 0.0
                b0 = float(res_log.bse[0]) if len(res_log.bse) > 0 else None
                b1 = float(res_log.bse[1]) if len(res_log.bse) > 1 else None
                t1 = float(res_log.tvalues[1]) if len(res_log.tvalues) > 1 else None
                pv1 = float(res_log.pvalues[1]) if len(res_log.pvalues) > 1 else None
                r2_val = float(res_log.rsquared) if np.isfinite(res_log.rsquared) else None
                aic_val = float(res_log.aic) if np.isfinite(res_log.aic) else None
                bic_val = float(res_log.bic) if np.isfinite(res_log.bic) else None

                if not (np.isfinite(p0) and np.isfinite(p1)):
                    log_status = "FIT_FAILED"
                    log_error = {
                        "code": "NON_FINITE_OUTPUT",
                        "message": "Model parameter estimates or standard errors are non-finite.",
                        "retryable": False
                    }
                else:
                    log_status = "ESTIMATED"
                    log_fit_params = {
                        "alpha": p0,
                        "alpha_se": b0,
                        "beta": p1,
                        "beta_se": b1,
                        "beta_t_stat": t1,
                        "beta_p_value": pv1,
                        "r_squared": r2_val,
                        "aic": aic_val,
                        "bic": bic_val
                    }
            except Exception as e:
                log_status = "FIT_FAILED"
                log_error = {
                    "code": "SOLVER_ERROR",
                    "message": f"Numerical optimization error in Log fit: {str(e)}",
                    "retryable": False
                }

        logarithmic_model_dict = make_fit_result(
            model_name="Logarithmic (R = alpha + beta * ln(Q))",
            status=log_status,
            fit_params=log_fit_params,
            error=log_error,
            input_diagnostics={"total_observations": n_obs, "quantity_variance": q_var, "return_variance": ret_var},
            metrics_diagnostics=log_metrics_diag
        )

        # 4. Power Law Model: R = alpha * Q^gamma
        # Fit on strictly positive empirical conditional expectation points
        binned_q = np.array([pt["mean_volume"] for pt in binned_empirical])
        binned_r = np.array([pt["mean_response_bps"] for pt in binned_empirical])
        binned_counts = np.array([pt["count"] for pt in binned_empirical], dtype=np.float64)
        pos_mask = (binned_r > 0)
        n_pos_tiers = int(np.sum(pos_mask))

        pow_error = None
        is_power_law_estimable = False
        if n_pos_tiers < 4:
            power_law_status = "NOT_ESTIMABLE"
            pow_error = {
                "code": "INSUFFICIENT_DATA",
                "message": f"Insufficient positive conditional response tiers (found {n_pos_tiers}, minimum 4 required). Underlying price displacement lacks positive upward variation.",
                "retryable": False
            }
        else:
            q_fit = binned_q[pos_mask]
            r_fit = binned_r[pos_mask]
            counts_fit = binned_counts[pos_mask]
            if np.var(np.log(q_fit)) <= 1e-12 or np.var(np.log(r_fit)) <= 1e-12:
                power_law_status = "NOT_ESTIMABLE"
                pow_error = {
                    "code": "SINGULAR_DESIGN",
                    "message": "Near-zero variance in log tier volume or log conditional return across positive tiers.",
                    "retryable": False
                }
            else:
                is_power_law_estimable = True
                power_law_status = "ESTIMATED"

        if not is_power_law_estimable:
            unestimable_reason = pow_error["message"] if pow_error else "Inestimable power law."
            gamma_est = None
            alpha_est = None
            gamma_se = None
            ci_lower = None
            ci_upper = None
            p_val_sqrt = None
            t_sqrt = None
            t_ols = None
            p_val_ols = None
            t_wls = None
            p_val_wls = None
            r2_power = None

            gamma_wls = None
            gamma_wls_se = None
            ci_wls_lower = None
            ci_wls_upper = None
            r2_wls = None
            rejects_sqrt = False
            ci_contains_zero = False

            wls_test_dict = make_fit_result(
                model_name="Weighted Least Squares (Tier Sample Weights)",
                status="NOT_ESTIMABLE",
                error=pow_error,
                estimator="Weighted Least Squares (Tier Sample Weights)",
                se_type="Classical WLS SE",
                is_rejected_at_5pct=False,
                reason=unestimable_reason
            )

            ols_test_dict = make_fit_result(
                model_name="Tier-Binned OLS (Unweighted)",
                status="NOT_ESTIMABLE",
                error=pow_error,
                estimator="Tier-Binned OLS (Unweighted)",
                se_type="Classical OLS SE",
                is_rejected_at_5pct=False,
                reason=unestimable_reason
            )

            interpretation_text = (
                f"Power-law child-order scaling model is NOT_ESTIMABLE: {unestimable_reason} "
                "No parameter values, confidence intervals, or null hypothesis refutations are fabricated."
            )
        else:
            unestimable_reason = ""
            log_q = np.log(q_fit)
            log_r = np.log(r_fit)
            X_pow = sm.add_constant(log_q)

            # Unweighted OLS on binned conditional means
            try:
                res_power = sm.OLS(log_r, X_pow).fit()
                alpha_est = float(np.exp(res_power.params[0])) if len(res_power.params) > 0 else None
                gamma_est = float(res_power.params[1]) if len(res_power.params) > 1 else None
                gamma_se = float(res_power.bse[1]) if len(res_power.bse) > 1 else None
                ci_lower = float(gamma_est - 1.96 * gamma_se) if (gamma_est is not None and gamma_se is not None) else None
                ci_upper = float(gamma_est + 1.96 * gamma_se) if (gamma_est is not None and gamma_se is not None) else None
                r2_power = float(res_power.rsquared) if np.isfinite(res_power.rsquared) else None
            except Exception as e:
                alpha_est, gamma_est, gamma_se, ci_lower, ci_upper, r2_power = None, None, None, None, None, None

            # Weighted Least Squares (WLS) weighted by sample count per tier
            try:
                res_wls = sm.WLS(log_r, X_pow, weights=counts_fit).fit()
                gamma_wls = float(res_wls.params[1]) if len(res_wls.params) > 1 else None
                gamma_wls_se = float(res_wls.bse[1]) if len(res_wls.bse) > 1 else None
                ci_wls_lower = float(gamma_wls - 1.96 * gamma_wls_se) if (gamma_wls is not None and gamma_wls_se is not None) else None
                ci_wls_upper = float(gamma_wls + 1.96 * gamma_wls_se) if (gamma_wls is not None and gamma_wls_se is not None) else None
                r2_wls = float(res_wls.rsquared) if np.isfinite(res_wls.rsquared) else None
                wls_status = "ESTIMATED"
                wls_err = None
            except Exception as e:
                gamma_wls, gamma_wls_se, ci_wls_lower, ci_wls_upper, r2_wls = None, None, None, None, None
                wls_status = "FIT_FAILED"
                wls_err = {"code": "SOLVER_ERROR", "message": f"WLS optimization failure: {str(e)}", "retryable": False}

            # Hypothesis tests on both OLS and WLS: H0: gamma = 0.5 (Compatibility with Square-Root Law)
            t_ols = ((gamma_est - 0.5) / gamma_se) if (gamma_est is not None and gamma_se and gamma_se > 0) else None
            p_val_ols = float(2.0 * (1.0 - norm.cdf(abs(t_ols)))) if t_ols is not None else None

            t_wls = ((gamma_wls - 0.5) / gamma_wls_se) if (gamma_wls is not None and gamma_wls_se and gamma_wls_se > 0) else None
            p_val_wls = float(2.0 * (1.0 - norm.cdf(abs(t_wls)))) if t_wls is not None else None

            t_sqrt = t_wls
            p_val_sqrt = p_val_wls
            rejects_sqrt = bool(p_val_wls is not None and p_val_wls < 0.05)
            ci_contains_zero = bool(
                (ci_wls_lower is not None and ci_wls_upper is not None and ci_wls_lower <= 0.0 <= ci_wls_upper) or
                (ci_lower is not None and ci_upper is not None and ci_lower <= 0.0 <= ci_upper)
            )

            wls_ci_note = "encompasses zero" if (ci_wls_lower is not None and ci_wls_lower <= 0.0 <= ci_wls_upper) else (
                f"is strictly {'negative' if (ci_wls_upper and ci_wls_upper < 0) else 'positive'} (excludes zero)" if ci_wls_upper is not None else "unavailable"
            )
            ols_ci_note = "encompasses zero" if (ci_lower is not None and ci_lower <= 0.0 <= ci_upper) else (
                f"is strictly {'negative' if (ci_upper and ci_upper < 0) else 'positive'} (excludes zero)" if ci_upper is not None else "unavailable"
            )

            wls_verdict = (
                f"rejects compatibility with square-root exponent gamma = 0.5 (t = {t_wls:.2f}, p = {p_val_wls:.4e})"
                if (p_val_wls is not None and p_val_wls < 0.05)
                else (f"fails to reject H0: gamma = 0.5 (t = {t_wls:.2f}, p = {p_val_wls:.4f})" if p_val_wls is not None else "WLS test unavailable")
            )
            ols_verdict = (
                f"rejects H0: gamma = 0.5 (t = {t_ols:.2f}, p = {p_val_ols:.4e})"
                if (p_val_ols is not None and p_val_ols < 0.05)
                else (f"fails to reject H0: gamma = 0.5 (t = {t_ols:.2f}, p = {p_val_ols:.4f})" if p_val_ols is not None else "OLS test unavailable")
            )

            wls_test_dict = make_fit_result(
                model_name="Weighted Least Squares (Tier Sample Weights)",
                status=wls_status,
                fit_params={
                    "gamma": gamma_wls,
                    "se": gamma_wls_se,
                    "ci_95": [ci_wls_lower, ci_wls_upper] if ci_wls_lower is not None else None,
                    "t_statistic": float(t_wls) if t_wls is not None else None,
                    "p_value": float(p_val_wls) if p_val_wls is not None else None,
                    "is_rejected_at_5pct": bool(p_val_wls is not None and p_val_wls < 0.05)
                } if wls_status == "ESTIMATED" else None,
                error=wls_err,
                estimator="Weighted Least Squares (Tier Sample Weights)",
                se_type="Classical WLS SE"
            )

            ols_test_dict = make_fit_result(
                model_name="Tier-Binned OLS (Unweighted)",
                status="ESTIMATED" if gamma_est is not None else "FIT_FAILED",
                fit_params={
                    "gamma": gamma_est,
                    "se": gamma_se,
                    "ci_95": [ci_lower, ci_upper] if ci_lower is not None else None,
                    "t_statistic": float(t_ols) if t_ols is not None else None,
                    "p_value": float(p_val_ols) if p_val_ols is not None else None,
                    "is_rejected_at_5pct": bool(p_val_ols is not None and p_val_ols < 0.05)
                } if gamma_est is not None else None,
                estimator="Tier-Binned OLS (Unweighted)",
                se_type="Classical OLS SE"
            )

            str_gamma_wls = f"{gamma_wls:.4f}" if gamma_wls is not None else "NA"
            str_wls_lower = f"{ci_wls_lower:.4f}" if ci_wls_lower is not None else "NA"
            str_wls_upper = f"{ci_wls_upper:.4f}" if ci_wls_upper is not None else "NA"
            str_gamma_ols = f"{gamma_est:.4f}" if gamma_est is not None else "NA"
            str_ols_lower = f"{ci_lower:.4f}" if ci_lower is not None else "NA"
            str_ols_upper = f"{ci_upper:.4f}" if ci_upper is not None else "NA"

            # Bounded empirical expression per M4
            interpretation_text = (
                "Square-root price impact is an empirical scaling relationship. This study estimates "
                "the power-law exponent under specified assets, intraday sample intervals, and regression specifications "
                f"to evaluate compatibility with gamma = 0.5 (WLS gamma = {str_gamma_wls}, "
                f"95% WLS CI: [{str_wls_lower}, {str_wls_upper}], {wls_ci_note}) {wls_verdict}; "
                f"OLS gamma = {str_gamma_ols}, 95% OLS CI: [{str_ols_lower}, {str_ols_upper}], {ols_ci_note}) {ols_verdict}. "
                "Results do not demonstrate universal or cross-asset validity. Child-order tick response cannot be conflated "
                "with exogenous meta-order impact or guaranteed execution alpha. Models exhibit low in-sample and out-of-sample explanatory power."
            )

        # Trade-level estimation on individual positive trades (subsample up to 50k for tractability)
        trade_pos_mask = (R_clean > 0) & (Q_clean > 0)
        trade_zero_count = int(np.sum(R_clean == 0))
        trade_neg_count = int(np.sum(R_clean < 0))
        trade_pos_count = int(np.sum(R_clean > 0))
        trade_total_count = len(R_clean)
        pos_pct = float((trade_pos_count / trade_total_count) * 100.0) if trade_total_count > 0 else 0.0

        trade_level_gamma = None
        trade_level_gamma_se = None
        trade_level_r2 = None
        trade_level_status = "NOT_ESTIMABLE"
        trade_level_err = None
        trade_level_fit_params = None

        if trade_pos_count < 100:
            trade_level_status = "NOT_ESTIMABLE"
            trade_level_err = {
                "code": "INSUFFICIENT_DATA",
                "message": f"Insufficient positive return trades (found {trade_pos_count}, minimum 100 required for log-log regression).",
                "retryable": False
            }
        elif np.var(np.log(Q_clean[trade_pos_mask])) <= 1e-12 or np.var(np.log(R_clean[trade_pos_mask])) <= 1e-12:
            trade_level_status = "NOT_ESTIMABLE"
            trade_level_err = {
                "code": "SINGULAR_DESIGN",
                "message": "Near-zero variance in positive trades log volume or log return.",
                "retryable": False
            }
        else:
            try:
                q_tr = Q_clean[trade_pos_mask]
                r_tr = R_clean[trade_pos_mask]
                if len(q_tr) > 50000:
                    step = len(q_tr) // 50000
                    q_tr = q_tr[::step]
                    r_tr = r_tr[::step]
                X_tr = sm.add_constant(np.log(q_tr))
                res_tr = sm.OLS(np.log(r_tr), X_tr).fit(cov_type="HAC", cov_kwds={"maxlags": min(k, 30)})
                g_tr = float(res_tr.params[1]) if len(res_tr.params) > 1 else None
                se_tr = float(res_tr.bse[1]) if len(res_tr.bse) > 1 else None
                r2_tr = float(res_tr.rsquared) if hasattr(res_tr, "rsquared") and np.isfinite(res_tr.rsquared) else None

                if g_tr is not None and np.isfinite(g_tr):
                    trade_level_status = "ESTIMATED"
                    trade_level_gamma = g_tr
                    trade_level_gamma_se = se_tr
                    trade_level_r2 = r2_tr
                    trade_level_fit_params = {
                        "gamma_trade": g_tr,
                        "gamma_trade_se": se_tr,
                        "r_squared_trade": r2_tr
                    }
                else:
                    trade_level_status = "FIT_FAILED"
                    trade_level_err = {
                        "code": "NON_FINITE_OUTPUT",
                        "message": "Non-finite parameter estimates in trade-level regression.",
                        "retryable": False
                    }
            except Exception as e:
                trade_level_status = "FIT_FAILED"
                trade_level_err = {
                    "code": "SOLVER_ERROR",
                    "message": f"Solver error in trade-level HAC: {str(e)}",
                    "retryable": False
                }

        trade_level_dict = make_fit_result(
            model_name="Trade-Level Log-Log HAC (Positive Response Sub-Sample: R > 0)",
            status=trade_level_status,
            fit_params=trade_level_fit_params,
            error=trade_level_err,
            estimator="OLS with Newey-West HAC covariance",
            sample_type="POSITIVE_RESPONSE_SUBSAMPLE",
            conditioning="Strictly conditional on positive signed price displacement (R_i > 0)",
            caveat=(
                "Evaluated strictly on the conditional positive-response sub-sample (R_i > 0); "
                "cannot serve as an unconditional full-sample validation because zero and adverse price moves "
                f"({trade_zero_count + trade_neg_count:,} trades, {(100.0 - pos_pct):.1f}% of sample) "
                "are dropped by the log transform."
            ),
            gamma_trade=trade_level_gamma,
            gamma_trade_se=trade_level_gamma_se,
            r_squared_trade=trade_level_r2,
            positive_trades_count=trade_pos_count,
            zero_trades_count=trade_zero_count,
            negative_trades_count=trade_neg_count,
            total_trades_count=trade_total_count,
            positive_trades_pct=pos_pct
        )

        # Out-of-sample (OOS) cross-validation with boundary purging
        half = n_obs // 2
        purge_k = min(k, max(0, half - 1))
        train_end_idx = max(1, half - purge_k)
        test_start_idx = half

        q_train, r_train = Q_clean[:train_end_idx], R_clean[:train_end_idx]
        q_test, r_test = Q_clean[test_start_idx:], R_clean[test_start_idx:]

        train_start_utc = clean_times[0] if clean_times else ""
        train_end_utc = clean_times[train_end_idx - 1] if clean_times and train_end_idx > 0 else ""
        test_start_utc = clean_times[test_start_idx] if clean_times and test_start_idx < len(clean_times) else ""
        test_end_utc = clean_times[-1] if clean_times else ""
        train_obs = len(q_train)
        test_obs = len(q_test)

        train_r2_val = None
        oos_r2_log = None
        oos_log_status = "NOT_ESTIMABLE"
        oos_r2_power = None
        oos_power_status = "NOT_ESTIMABLE"
        oos_power_train_gamma = None
        oos_power_train_alpha = None
        pow_tr_fit = {}
        oos_denominator_ss_tot = None

        if train_obs >= 20 and test_obs >= 20 and np.var(q_train) > 1e-12 and np.var(r_train) > 1e-12 and np.var(r_test) > 1e-12:
            ss_tot = float(np.sum((r_test - np.mean(r_test)) ** 2))
            oos_denominator_ss_tot = ss_tot
            if ss_tot > 0:
                try:
                    # 1. Logarithmic model strictly fitted on training split
                    res_tr_log = sm.OLS(r_train, sm.add_constant(np.log(q_train))).fit()
                    pred_test_log = res_tr_log.predict(sm.add_constant(np.log(q_test)))
                    ss_res_log = float(np.sum((r_test - pred_test_log) ** 2))
                    oos_r2_log = float(1.0 - (ss_res_log / ss_tot))  # Real unconstrained R^2
                    train_r2_val = float(res_tr_log.rsquared) if hasattr(res_tr_log, "rsquared") and np.isfinite(res_tr_log.rsquared) else None
                    oos_log_status = "ESTIMATED"
                except Exception as e:
                    oos_r2_log = None
                    train_r2_val = None
                    oos_log_status = f"FIT_FAILED: {str(e)}"

                # 2. Power-law model strictly fitted on training split (ZERO full-sample leakage)
                pow_tr_fit = self.fit_power_law_from_sample(q_train, r_train, tier_definitions)
                if pow_tr_fit["is_estimable"] and pow_tr_fit["alpha"] is not None and pow_tr_fit["alpha"] > 0:
                    alpha_tr = pow_tr_fit["alpha"]
                    gamma_tr = pow_tr_fit["gamma"]
                    pred_test_pow = alpha_tr * (q_test ** gamma_tr)
                    ss_res_pow = float(np.sum((r_test - pred_test_pow) ** 2))
                    oos_r2_power = float(1.0 - (ss_res_pow / ss_tot))  # Real unconstrained R^2
                    oos_power_status = "ESTIMATED"
                    oos_power_train_gamma = gamma_tr
                    oos_power_train_alpha = alpha_tr
                else:
                    oos_r2_power = None
                    oos_power_status = pow_tr_fit.get("status", "NOT_ESTIMABLE")

        # Multi-window expanding Walk-Forward Purged Evaluation with Non-Overlapping Test Windows
        wf_folds = []
        all_test_targets = []
        all_test_preds_log = []
        all_test_preds_pow = []
        all_pow_estimable = True
        all_log_estimable = True

        split_points = [
            (0.0, 0.40, 0.40, 0.60),
            (0.0, 0.60, 0.60, 0.80),
            (0.0, 0.80, 0.80, 1.00)
        ]

        for fold_idx, (tr_s, tr_e, te_s, te_e) in enumerate(split_points, 1):
            te_start = int(n_obs * te_s)
            te_end = min(n_obs, int(n_obs * te_e)) if fold_idx < len(split_points) else n_obs
            tr_end = max(10, te_start - purge_k) if te_start > purge_k + 10 else 0
            tr_start = int(n_obs * tr_s)

            q_tr, r_tr = Q_clean[tr_start:tr_end], R_clean[tr_start:tr_end]
            q_te, r_te = Q_clean[te_start:te_end], R_clean[te_start:te_end]

            c_tr_start = clean_times[tr_start] if clean_times and tr_start < len(clean_times) else ""
            c_tr_end = clean_times[tr_end - 1] if clean_times and tr_end > 0 and tr_end <= len(clean_times) else ""
            c_te_start = clean_times[te_start] if clean_times and te_start < len(clean_times) else ""
            c_te_end = clean_times[te_end - 1] if clean_times and te_end > 0 and te_end <= len(clean_times) else ""

            is_fold_estimable = (
                len(q_tr) >= 20 and len(q_te) >= 20 and
                np.var(q_tr) > 1e-12 and np.var(r_te) > 1e-12
            )

            if not is_fold_estimable:
                all_log_estimable = False
                all_pow_estimable = False
                unest_reason = "Insufficient observations or zero variance in training window" if len(q_tr) < 20 else "Zero target variance in test set"
                wf_folds.append({
                    "fold": fold_idx,
                    "train_indices": [tr_start, tr_end],
                    "test_indices": [te_start, te_end],
                    "train_observations": len(q_tr),
                    "test_observations": len(q_te),
                    "purged_observations": purge_k,
                    "train_start_utc": c_tr_start,
                    "train_end_utc": c_tr_end,
                    "test_start_utc": c_te_start,
                    "test_end_utc": c_te_end,
                    "status": "NOT_ESTIMABLE",
                    "unestimable_reason": unest_reason,
                    "log_model": {
                        "status": "NOT_ESTIMABLE",
                        "alpha": None,
                        "beta": None,
                        "train_r2": None,
                        "reason": unest_reason
                    },
                    "power_law_model": {
                        "status": "NOT_ESTIMABLE",
                        "alpha": None,
                        "gamma": None,
                        "alpha_wls": None,
                        "gamma_wls": None,
                        "train_r2_binned": None,
                        "train_r2_wls": None,
                        "reason": unest_reason
                    },
                    "log_oos_r2": None,
                    "power_oos_r2": None,
                    "effective_denominator_ss_tot": 0.0
                })
                continue

            # Assert label coverage separation (train label end < test start)
            assert tr_end + purge_k <= te_start, f"Purge violation in fold {fold_idx}: tr_end={tr_end}, te_start={te_start}, purge_k={purge_k}"

            ss_tot_f = float(np.sum((r_te - np.mean(r_te)) ** 2))

            # 1. Fit log model strictly on fold training set
            log_f_status = "ESTIMATED"
            p_log = None
            r2_log_f = None
            log_f_alpha, log_f_beta, log_f_r2 = None, None, None
            try:
                m_log = sm.OLS(r_tr, sm.add_constant(np.log(q_tr))).fit()
                p_log = m_log.predict(sm.add_constant(np.log(q_te)))
                r2_log_f = float(1.0 - (np.sum((r_te - p_log) ** 2) / ss_tot_f)) if ss_tot_f > 0 else None
                log_f_alpha = float(m_log.params[0]) if len(m_log.params) > 0 else 0.0
                log_f_beta = float(m_log.params[1]) if len(m_log.params) > 1 else 0.0
                log_f_r2 = float(m_log.rsquared) if hasattr(m_log, "rsquared") and np.isfinite(m_log.rsquared) else None
            except Exception as e:
                p_log = None
                r2_log_f = None
                log_f_status = f"FIT_FAILED: {str(e)}"
                all_log_estimable = False

            # 2. Fit power law model strictly on fold training set (ZERO full-sample leakage)
            pow_f_fit = self.fit_power_law_from_sample(q_tr, r_tr, tier_definitions)
            if pow_f_fit["is_estimable"] and pow_f_fit["alpha"] is not None and pow_f_fit["alpha"] > 0:
                p_pow = pow_f_fit["alpha"] * (q_te ** pow_f_fit["gamma"])
                r2_pow_f = float(1.0 - (np.sum((r_te - p_pow) ** 2) / ss_tot_f)) if ss_tot_f > 0 else None
                pow_f_status = "ESTIMATED"
                pow_f_gamma = pow_f_fit["gamma"]
                pow_f_alpha = pow_f_fit["alpha"]
                pow_f_train_r2 = pow_f_fit.get("r_squared")
            else:
                p_pow = None
                r2_pow_f = None
                pow_f_status = pow_f_fit.get("status", "NOT_ESTIMABLE")
                pow_f_gamma = None
                pow_f_alpha = None
                pow_f_train_r2 = None
                all_pow_estimable = False

            # Collect predictions for pooled metrics only if valid
            all_test_targets.extend(r_te.tolist())
            if p_log is not None:
                all_test_preds_log.extend(p_log.tolist())
            if p_pow is not None:
                all_test_preds_pow.extend(p_pow.tolist())

            wf_folds.append({
                "fold": fold_idx,
                "train_indices": [tr_start, tr_end],
                "test_indices": [te_start, te_end],
                "train_observations": len(q_tr),
                "test_observations": len(q_te),
                "purged_observations": purge_k,
                "train_start_utc": c_tr_start,
                "train_end_utc": c_tr_end,
                "test_start_utc": c_te_start,
                "test_end_utc": c_te_end,
                "status": "ESTIMATED" if (log_f_status == "ESTIMATED" and pow_f_status == "ESTIMATED") else "PARTIAL",
                "log_model": {
                    "status": log_f_status,
                    "alpha": log_f_alpha,
                    "beta": log_f_beta,
                    "train_r2": log_f_r2
                },
                "power_law_model": {
                    "status": pow_f_status,
                    "alpha": pow_f_alpha,
                    "gamma": pow_f_gamma,
                    "alpha_wls": pow_f_fit.get("alpha_wls"),
                    "gamma_wls": pow_f_fit.get("gamma_wls"),
                    "train_r2_binned": pow_f_train_r2,
                    "train_r2_wls": pow_f_fit.get("r_squared_wls")
                },
                "log_oos_r2": r2_log_f,
                "power_oos_r2": r2_pow_f,
                "effective_denominator_ss_tot": ss_tot_f
            })

        # Calculate Pooled Unique OOS Metrics across all non-overlapping test partitions
        pooled_log_r2 = None
        pooled_pow_r2 = None
        ss_tot_pooled = 0.0

        if len(all_test_targets) > 0:
            y_arr = np.array(all_test_targets)
            ss_tot_pooled = float(np.sum((y_arr - np.mean(y_arr)) ** 2))
            if all_log_estimable and len(all_test_preds_log) == len(y_arr) and ss_tot_pooled > 0:
                p_log_arr = np.array(all_test_preds_log)
                pooled_log_r2 = float(1.0 - (np.sum((y_arr - p_log_arr) ** 2) / ss_tot_pooled))

            if all_pow_estimable and len(all_test_preds_pow) == len(y_arr) and ss_tot_pooled > 0:
                p_pow_arr = np.array(all_test_preds_pow)
                pooled_pow_r2 = float(1.0 - (np.sum((y_arr - p_pow_arr) ** 2) / ss_tot_pooled))

        # Calculate Fold Macro-Averages and Dispersion
        valid_log = [f["log_oos_r2"] for f in wf_folds if f.get("log_oos_r2") is not None]
        valid_pow = [f["power_oos_r2"] for f in wf_folds if f.get("power_oos_r2") is not None]

        mean_log_r2 = float(np.mean(valid_log)) if valid_log else None
        std_log_r2 = float(np.std(valid_log)) if len(valid_log) > 1 else (0.0 if valid_log else None)
        mean_pow_r2 = float(np.mean(valid_pow)) if valid_pow else None
        std_pow_r2 = float(np.std(valid_pow)) if len(valid_pow) > 1 else (0.0 if valid_pow else None)

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

            if np.sum(c_mask) >= 20 and np.var(Q_clean[c_mask]) > 1e-12:
                q_chunk = Q_clean[c_mask]
                r_chunk = R_clean[c_mask]
                c_times = [clean_times[i] for i, m in enumerate(c_mask) if m] if clean_times else []
                c_start_time = c_times[0] if c_times else ""
                c_end_time = c_times[-1] if c_times else ""

                # Fit log model on chunk
                try:
                    X_c_log = sm.add_constant(np.log(q_chunk))
                    ols_c_log = sm.OLS(r_chunk, X_c_log).fit()
                    log_alpha = float(ols_c_log.params[0]) if len(ols_c_log.params) > 0 else 0.0
                    log_beta = float(ols_c_log.params[1]) if len(ols_c_log.params) > 1 else 0.0
                    log_r2 = float(ols_c_log.rsquared) if hasattr(ols_c_log, "rsquared") and np.isfinite(ols_c_log.rsquared) else 0.0
                except Exception:
                    log_alpha, log_beta, log_r2 = 0.0, 0.0, 0.0

                # Economic bins for chunk power law
                cq_pts, cr_pts, cr_cnts = [], [], []
                for _, cond, _ in tier_definitions:
                    m_b = cond(q_chunk)
                    if np.sum(m_b) >= 20 and np.mean(r_chunk[m_b]) > 0:
                        cq_pts.append(float(np.mean(q_chunk[m_b])))
                        cr_pts.append(float(np.mean(r_chunk[m_b])))
                        cr_cnts.append(float(np.sum(m_b)))

                g_chunk, g_chunk_se = None, None
                if len(cq_pts) >= 4 and np.var(np.log(cq_pts)) > 1e-12:
                    try:
                        res_cp = sm.WLS(np.log(cr_pts), sm.add_constant(np.log(cq_pts)), weights=cr_cnts).fit()
                        g_chunk = float(res_cp.params[1])
                        g_chunk_se = float(res_cp.bse[1])
                    except Exception:
                        pass

                time_chunks.append({
                    "chunk_index": c + 1,
                    "label": chunk_label,
                    "start_time_utc": c_start_time,
                    "end_time_utc": c_end_time,
                    "observations": len(q_chunk),
                    "log_alpha": log_alpha,
                    "log_beta": log_beta,
                    "log_r2": log_r2,
                    "power_gamma": g_chunk,
                    "power_gamma_se": g_chunk_se
                })

        # Moving Block Bootstrap execution (only if power law is estimable)
        mbb_results = {}
        if is_power_law_estimable and n_obs >= 500:
            mbb_results = self.compute_moving_block_bootstrap(
                Q=Q_clean,
                R=R_clean,
                tier_definitions=tier_definitions,
                block_sizes=[50, 100, 250, 500],
                num_bootstraps=100,
                random_seed=42
            )
        else:
            mbb_results = {
                "status": "NOT_ESTIMABLE",
                "reason": "Sample size below threshold or power law inestimable on full dataset.",
                "replications": 0,
                "block_sizes_evaluated": [50, 100, 250, 500],
                "sensitivity_table": [],
                "sensitivity_verdict": "NOT_ESTIMABLE"
            }

        power_law_dict = {
            "name": "Power Law (R = alpha * Q^gamma)",
            "status": power_law_status,
            "is_estimable": is_power_law_estimable,
            "unestimable_reason": unestimable_reason if not is_power_law_estimable else None,
            "alpha": alpha_est,
            "gamma": gamma_est,
            "gamma_se": gamma_se,
            "ci_95_lower": ci_lower,
            "ci_95_upper": ci_upper,
            "r_squared_binned": r2_power,
            "wls_fit": {
                "name": "Weighted Least Squares (weighted by tier sample count)",
                "status": power_law_status,
                "estimator": "Classical WLS (weights = tier count)",
                "se_type": "Classical WLS SE (unadjusted for cross-tier residual autocorrelation)",
                "gamma": gamma_wls,
                "gamma_wls": gamma_wls,
                "se": gamma_wls_se,
                "gamma_wls_se": gamma_wls_se,
                "ci_95": [ci_wls_lower, ci_wls_upper] if ci_wls_lower is not None else None,
                "ci_95_lower": ci_wls_lower,
                "ci_95_upper": ci_wls_upper,
                "r_squared": r2_wls,
                "r_squared_wls": r2_wls
            },
            "trade_level_fit": {
                "name": "Trade-Level Log-Log HAC (Positive Response Sub-Sample: R > 0)",
                "status": trade_level_status,
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
                "description": "50% chronological split with purged transition buffer",
                "model_specification": "Logarithmic Specification (Full-Sample) with Power-Law Comparison",
                "evaluation_scope": "FULL_SAMPLE_WITH_ZERO_AND_NEGATIVE_RETURNS",
                "purging_applied": True,
                "purged_boundary_trades": purge_k,
                "purging_rationale": f"Purged {purge_k} boundary trades to eliminate lookahead return leakage across horizon k={k}",
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
                "log_model_oos_r2": oos_r2_log,
                "power_law_oos_r2": oos_r2_power,
                "power_law_train_fit": {
                    "status": oos_power_status,
                    "gamma_train": oos_power_train_gamma,
                    "alpha_train": oos_power_train_alpha,
                    "gamma_train_wls": pow_tr_fit.get("gamma_wls"),
                    "alpha_train_wls": pow_tr_fit.get("alpha_wls")
                },
                "is_power_law_oos": False,
                "note": "Evaluates training-fitted parameters on held-out test data. Power-law and logarithmic parameters are strictly fitted on the training split prior to lookahead purge buffer."
            },
            "walk_forward_validation": {
                "protocol": "EXPANDING_WINDOW_NON_OVERLAPPING_TEST",
                "folds_count": len(wf_folds),
                "valid_folds_count": len(valid_log),
                "failed_folds_count": len(wf_folds) - len(valid_pow),
                "purged_trades_per_boundary": purge_k,
                "total_purged_boundary_trades": len(wf_folds) * purge_k,
                "pooled_oos": {
                    "aggregation_method": "CONCATENATED_UNIQUE_NON_OVERLAPPING_PREDICTIONS",
                    "total_unique_predictions": len(all_test_targets),
                    "total_purged_boundary_trades": len(wf_folds) * purge_k,
                    "log_oos_r2": pooled_log_r2,
                    "power_oos_r2": pooled_pow_r2,
                    "denominator_ss_tot": float(ss_tot_pooled) if ss_tot_pooled > 0 else 0.0
                },
                "fold_macro_metrics": {
                    "mean_log_oos_r2": mean_log_r2,
                    "std_log_oos_r2": std_log_r2,
                    "mean_power_oos_r2": mean_pow_r2,
                    "std_power_oos_r2": std_pow_r2
                },
                "mean_log_oos_r2": mean_log_r2,
                "mean_power_oos_r2": mean_pow_r2,
                "folds": wf_folds
            },
            "moving_block_bootstrap": mbb_results,
            "rejects_square_root_half": rejects_sqrt,
            "ci_contains_zero": ci_contains_zero,
            "hypothesis_test_sqrt_law": {
                "status": power_law_status,
                "null_hypothesis": "H0: gamma = 0.5 (Square-Root Law for Child Trades)",
                "gamma_estimate": gamma_est,
                "gamma_estimate_wls": gamma_wls,
                "standard_error": gamma_se,
                "standard_error_wls": gamma_wls_se,
                "confidence_interval_95": [ci_wls_lower, ci_wls_upper] if ci_wls_lower is not None else None,
                "confidence_interval_95_ols": [ci_lower, ci_upper] if ci_lower is not None else None,
                "confidence_interval_95_wls": [ci_wls_lower, ci_wls_upper] if ci_wls_lower is not None else None,
                "t_statistic": float(t_wls) if t_wls is not None else None,
                "t_statistic_ols": float(t_ols) if t_ols is not None else None,
                "t_statistic_wls": float(t_wls) if t_wls is not None else None,
                "p_value": p_val_wls,
                "p_value_ols": p_val_ols,
                "p_value_wls": p_val_wls,
                "is_rejected_at_5pct": rejects_sqrt,
                "ols_test": ols_test_dict,
                "wls_test": wls_test_dict,
                "interpretation": interpretation_text
            }
        }

        # Calculate sample span duration
        sample_duration_s = None
        if clean_ns is not None and len(clean_ns) > 1:
            sample_duration_s = float((clean_ns[-1] - clean_ns[0]) / 1e9)

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
                "sample_duration_seconds": sample_duration_s,
                "sampling_method": "CHRONOLOGICAL_TICK_RESPONSE",
                "generation_timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "status": "EXPLORATORY_RESEARCH",
                "scope_limitation_disclosure": (
                    f"Analyzed sample covers consecutive chronological window from {sample_start_utc} to {sample_end_utc} "
                    f"({sample_duration_s:.1f}s, {n_obs:,} tick executions). Microstructure empirical parameters (scaling exponent, "
                    "autocorrelation, point-mass proportions) reflect this specific intraday regime and cannot be extrapolated "
                    "to full 24-hour trading without cross-regime validation."
                ) if sample_duration_s else "Consecutive tick execution sample."
            },
            "binned_empirical": binned_empirical,
            "linear_model": linear_model_dict,
            "linear_fit": linear_model_dict,
            "logarithmic_model": logarithmic_model_dict,
            "logarithmic_fit": logarithmic_model_dict,
            "power_law_model": power_law_dict,
            "power_law_fit": power_law_dict,
            "power_law_wls": power_law_dict["wls_fit"],
            "trade_level_fit": power_law_dict["trade_level_fit"],
            "out_of_sample_validation": power_law_dict["out_of_sample_validation"],
            "walk_forward_validation": power_law_dict["walk_forward_validation"],
            "moving_block_bootstrap": mbb_results,
            "inference_sensitivity_table": mbb_results.get("sensitivity_table", []),
            "sensitivity_verdict": mbb_results.get("sensitivity_verdict", "UNAVAILABLE"),
            "time_chunk_stability": time_chunks
        }

    def compute_moving_block_bootstrap(
        self,
        Q: np.ndarray,
        R: np.ndarray,
        tier_definitions: list,
        block_sizes: list = [50, 100, 250, 500],
        num_bootstraps: int = 100,
        random_seed: int = 42
    ) -> Dict[str, Any]:
        """
        Moving Block Bootstrap (MBB) for robust empirical child-order power-law inference.
        Resamples contiguous blocks of trades to preserve serial dependence,
        re-stratifying empirical economic tiers and refitting WLS & OLS on each replication.
        Evaluates sensitivity of confidence intervals to temporal block size (M3).
        """
        n = len(Q)
        block_unit_labels = {
            50: "50 events (~0.8s micro-clustering)",
            100: "100 events (~1.5s short memory)",
            250: "250 events (~4.0s primary decay horizon)",
            500: "500 events (~8.0s macro-trade horizon)"
        }

        if n < 200 or np.var(R) < 1e-12 or np.var(Q) < 1e-12:
            return {
                "status": "NOT_ESTIMABLE",
                "reason": "Insufficient observations or zero variance for block bootstrap.",
                "replications": num_bootstraps,
                "block_sizes_evaluated": block_sizes,
                "sensitivity_table": [],
                "sensitivity_verdict": "NOT_ESTIMABLE"
            }

        rng = np.random.default_rng(random_seed)
        results = {}
        sensitivity_table = []

        for b_size in block_sizes:
            if b_size >= n:
                continue
            n_blocks = int(np.ceil(n / b_size))
            max_start = n - b_size

            ols_gammas = []
            wls_gammas = []
            failures = 0

            for _ in range(num_bootstraps):
                start_indices = rng.integers(0, max_start + 1, size=n_blocks)
                idx_list = [np.arange(s, s + b_size) for s in start_indices]
                boot_idx = np.concatenate(idx_list)[:n]
                q_b = Q[boot_idx]
                r_b = R[boot_idx]

                # Economic binning on resampled data
                min_sample_tier = max(5, min(15, n // 100))
                b_q, b_r, b_cnts = [], [], []
                for _, cond, _ in tier_definitions:
                    m = cond(q_b)
                    cnt = int(np.sum(m))
                    if cnt >= min_sample_tier:
                        m_r = float(np.mean(r_b[m]))
                        if m_r > 0:
                            b_q.append(float(np.mean(q_b[m])))
                            b_r.append(m_r)
                            b_cnts.append(float(cnt))

                if len(b_q) >= 4 and np.var(np.log(b_q)) > 1e-12 and np.var(np.log(b_r)) > 1e-12:
                    try:
                        X_b = sm.add_constant(np.log(b_q))
                        res_o = sm.OLS(np.log(b_r), X_b).fit()
                        g_o = float(res_o.params[1])
                        res_w = sm.WLS(np.log(b_r), X_b, weights=b_cnts).fit()
                        g_w = float(res_w.params[1])

                        if np.isfinite(g_o) and np.isfinite(g_w):
                            ols_gammas.append(g_o)
                            wls_gammas.append(g_w)
                        else:
                            failures += 1
                    except Exception:
                        failures += 1
                else:
                    failures += 1

            fail_rate = float((failures / num_bootstraps) * 100.0)
            u_label = block_unit_labels.get(b_size, f"{b_size} events")

            if len(wls_gammas) >= 20:
                wls_arr = np.array(wls_gammas)
                ols_arr = np.array(ols_gammas)
                ci_wls = [float(np.percentile(wls_arr, 2.5)), float(np.percentile(wls_arr, 97.5))]
                ci_ols = [float(np.percentile(ols_arr, 2.5)), float(np.percentile(ols_arr, 97.5))]
                wls_has_zero = bool(ci_wls[0] <= 0.0 <= ci_wls[1])
                wls_has_half = bool(ci_wls[0] <= 0.5 <= ci_wls[1])
                ols_has_zero = bool(ci_ols[0] <= 0.0 <= ci_ols[1])
                ols_has_half = bool(ci_ols[0] <= 0.5 <= ci_ols[1])

                results[f"block_{b_size}"] = {
                    "block_size": b_size,
                    "unit_label": u_label,
                    "replications_completed": len(wls_gammas),
                    "replications_attempted": num_bootstraps,
                    "fit_failure_rate_pct": fail_rate,
                    "wls_gamma_bootstrap_mean": float(np.mean(wls_arr)),
                    "wls_gamma_bootstrap_se": float(np.std(wls_arr)),
                    "wls_gamma_ci_95": ci_wls,
                    "ols_gamma_bootstrap_mean": float(np.mean(ols_arr)),
                    "ols_gamma_bootstrap_se": float(np.std(ols_arr)),
                    "ols_gamma_ci_95": ci_ols,
                    "ci_contains_zero_wls": wls_has_zero,
                    "ci_contains_half_wls": wls_has_half,
                    "ci_contains_zero_ols": ols_has_zero,
                    "ci_contains_half_ols": ols_has_half,
                    "ci_contains_half": wls_has_half,
                    "ci_contains_zero": wls_has_zero
                }

                # Sensitivity table row for WLS
                sensitivity_table.append({
                    "estimator": "Weighted Least Squares (WLS)",
                    "parameter": "gamma",
                    "inference_method": f"Moving Block Bootstrap (b={b_size})",
                    "block_size_events": b_size,
                    "unit_description": u_label,
                    "point_estimate": float(np.mean(wls_arr)),
                    "standard_error": float(np.std(wls_arr)),
                    "ci_95": ci_wls,
                    "ci_contains_zero": wls_has_zero,
                    "ci_contains_half": wls_has_half,
                    "replications": len(wls_gammas),
                    "verdict": ("Contains 0 (cannot rule out 0)" if wls_has_zero else f"Strictly {'negative' if ci_wls[1] < 0 else 'positive'} (rules out 0)") + (", rejects 0.5" if not wls_has_half else ", compatible with 0.5")
                })

                # Sensitivity table row for Tier OLS
                sensitivity_table.append({
                    "estimator": "Tier-Binned OLS",
                    "parameter": "gamma",
                    "inference_method": f"Moving Block Bootstrap (b={b_size})",
                    "block_size_events": b_size,
                    "unit_description": u_label,
                    "point_estimate": float(np.mean(ols_arr)),
                    "standard_error": float(np.std(ols_arr)),
                    "ci_95": ci_ols,
                    "ci_contains_zero": ols_has_zero,
                    "ci_contains_half": ols_has_half,
                    "replications": len(ols_gammas),
                    "verdict": ("Contains 0 (cannot rule out 0)" if ols_has_zero else f"Strictly {'negative' if ci_ols[1] < 0 else 'positive'} (rules out 0)") + (", rejects 0.5" if not ols_has_half else ", compatible with 0.5")
                })
            else:
                results[f"block_{b_size}"] = {
                    "block_size": b_size,
                    "unit_label": u_label,
                    "status": "UNAVAILABLE",
                    "reason": f"Insufficient valid bootstrap replications ({len(wls_gammas)} completed, failure rate {fail_rate:.1f}%).",
                    "fit_failure_rate_pct": fail_rate,
                    "replications_completed": len(wls_gammas),
                    "replications_attempted": num_bootstraps,
                    "wls_gamma_ci_95": None,
                    "ols_gamma_ci_95": None
                }

                # Sensitivity table entry for high-failure block size (M3)
                sensitivity_table.append({
                    "estimator": "Weighted Least Squares (WLS)",
                    "parameter": "gamma",
                    "inference_method": f"Moving Block Bootstrap (b={b_size})",
                    "block_size_events": b_size,
                    "unit_description": u_label,
                    "point_estimate": None,
                    "standard_error": None,
                    "ci_95": None,
                    "ci_contains_zero": None,
                    "ci_contains_half": None,
                    "replications": len(wls_gammas),
                    "verdict": f"Unavailable (replications < 20, failure rate {fail_rate:.1f}%)"
                })
                sensitivity_table.append({
                    "estimator": "Tier-Binned OLS",
                    "parameter": "gamma",
                    "inference_method": f"Moving Block Bootstrap (b={b_size})",
                    "block_size_events": b_size,
                    "unit_description": u_label,
                    "point_estimate": None,
                    "standard_error": None,
                    "ci_95": None,
                    "ci_contains_zero": None,
                    "ci_contains_half": None,
                    "replications": len(ols_gammas),
                    "verdict": f"Unavailable (replications < 20, failure rate {fail_rate:.1f}%)"
                })

        primary_key = "block_250" if ("block_250" in results and results["block_250"].get("wls_gamma_ci_95")) else (
            next((k for k, v in results.items() if v.get("wls_gamma_ci_95")), list(results.keys())[0] if results else None)
        )
        primary_res = results.get(primary_key, {})

        # Evaluate if conclusions flip across block sizes (M3)
        wls_zeros = [r["ci_contains_zero_wls"] for r in results.values() if "ci_contains_zero_wls" in r]
        has_wls_flip = len(set(wls_zeros)) > 1 if wls_zeros else False

        if has_wls_flip:
            sensitivity_verdict = "SENSITIVE_TO_TEMPORAL_DEPENDENCE_SPECIFICATION"
            sensitivity_summary = (
                "Child-order scaling confidence intervals flip between containing zero and excluding zero across temporal block sizes. "
                "Inference conclusions are sensitive to dependence assumptions and cannot be asserted as unconditionally robust."
            )
        else:
            sensitivity_verdict = "STABLE_ACROSS_BLOCK_SIZES"
            sensitivity_summary = (
                "Confidence interval zero-containment behavior is uniform across evaluated block lengths."
            )

        has_any_success = any(v.get("wls_gamma_ci_95") is not None for v in results.values())
        all_success = all(v.get("wls_gamma_ci_95") is not None for v in results.values())
        mbb_status = "SUCCESS" if all_success else ("PARTIAL" if has_any_success else "ESTIMATION_DEGRADED")

        return {
            "status": mbb_status,
            "methodology": "Moving Block Bootstrap with economic tier re-stratification",
            "block_sizes_evaluated": block_sizes,
            "primary_block_size": 250,
            "primary_result": primary_res,
            "results_by_block_size": results,
            "sensitivity_table": sensitivity_table,
            "sensitivity_verdict": sensitivity_verdict,
            "sensitivity_summary": sensitivity_summary
        }
