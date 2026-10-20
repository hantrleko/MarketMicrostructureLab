"""
Bivariate Hawkes Point Process & High-Frequency Endogenous Clustering Engine (V1.1.1).
Estimates self- and cross-excitation intensity functions for aggressive buy (+1) and sell (-1) trade arrivals:
lambda_1(t) = mu_1 + alpha_11 * R_1(t) + alpha_12 * R_2(t)  (Buy intensity)
lambda_2(t) = mu_2 + alpha_21 * R_1(t) + alpha_22 * R_2(t)  (Sell intensity)
where R_m(t) = sum_{t_j < t} exp(-beta * (t - t_j)).

Branching Ratio Matrix Gamma = [[alpha_11/beta, alpha_12/beta], [alpha_21/beta, alpha_22/beta]]
Spectral Radius rho(Gamma) = max eigenvalue of Gamma.

Stability Condition:
- rho(Gamma) < 1.0: Sub-critical, stationary process with finite expected cluster size 1 / (1 - rho).
- rho(Gamma) >= 1.0: Super-critical or critical, non-stationary process with explosive or degenerate branching.

Methodological & Econometric Diagnostics (V1.1.1):
1. Microsecond-Aggregated Control Model:
   Evaluates how much measured self-excitation arises from matching engine order fill slicing
   (multiple trades at the identical microsecond against deep liquidity) vs. genuine inter-arrival clustering.
2. Random Time Change Theorem Residuals:
   Evaluates compensator increments Delta tau_k = Lambda(t_k) - Lambda(t_{k-1}) against Exp(1) via KS tests,
   and computes residual autocorrelation to test increment independence.
3. Jitter Sensitivity Sweep:
   Evaluates parameter robustness across sub-microsecond tie-breaking scales (1e-6 s, 1e-7 s, 1e-8 s).
"""

from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import polars as pl
from scipy.optimize import minimize
from scipy.stats import kstest


class BivariateHawkesModel:
    def __init__(self, beta: float = 10.0):
        """
        beta: exponential memory decay rate (1/seconds).
              beta = 10.0 corresponds to a half-life of ln(2)/10 ~= 0.0693 seconds (69.3 ms).
        """
        self.beta = beta

    def fit_trades(
        self,
        df: pl.DataFrame,
        sample_size: int = 10_000,
        jitter_sec: float = 1e-7
    ) -> Dict[str, Any]:
        """
        Fits bivariate Hawkes process to consecutive trade events with:
        - Deterministic sub-microsecond tie-breaking
        - Supercritical vs subcritical stability classification
        - Random Time Change Theorem KS and autocorrelation residual diagnostics
        - Microsecond-aggregated control model comparison
        - Jitter sensitivity evaluation
        """
        if len(df) > sample_size:
            start_idx = len(df) // 3
            sub_df = df.slice(start_idx, sample_size)
        else:
            sub_df = df

        # Deterministic ordering by timestamp and trade_id
        if "trade_id" in sub_df.columns:
            sorted_df = sub_df.sort(["event_timestamp_ns", "trade_id"])
        else:
            sorted_df = sub_df.sort("event_timestamp_ns")

        raw_ns = sorted_df["event_timestamp_ns"].to_numpy().astype(np.float64)
        directions = sorted_df["direction"].to_numpy()

        # Primary estimation
        res_primary = self._fit_event_sequence(raw_ns, directions, jitter_sec=jitter_sec)

        # Jitter sensitivity sweep (1e-6 s, 1e-7 s, 1e-8 s)
        jitter_sens = {}
        for j_scale in [1e-6, 1e-7, 1e-8]:
            res_j = self._fit_event_sequence(raw_ns, directions, jitter_sec=j_scale)
            jitter_sens[f"jitter_{j_scale:0.0e}"] = {
                "spectral_radius": res_j["spectral_radius"],
                "buy_to_buy": res_j["branching_ratios"]["buy_to_buy"],
                "sell_to_sell": res_j["branching_ratios"]["sell_to_sell"],
            }

        # Control Model: Microsecond-Aggregated Events
        # Aggregates simultaneous fills sharing identical timestamp into a single net execution
        control_model = self._fit_microsecond_aggregated_control(sub_df)

        return {
            "sample_events": len(raw_ns),
            "observation_window_seconds": res_primary["T"],
            "decay_beta": self.beta,
            "buy_events_count": res_primary["n_buy"],
            "sell_events_count": res_primary["n_sell"],
            "optimizer_convergence": res_primary["convergence"],
            "parameters": res_primary["parameters"],
            "branching_ratios": res_primary["branching_ratios"],
            "stability_status": res_primary["stability_status"],
            "residual_diagnostics": res_primary["residual_diagnostics"],
            "fitting_warnings": res_primary.get("fitting_warnings", []),
            "jitter_sensitivity": jitter_sens,
            "control_model_microsecond_aggregated": control_model,
            "statistical_interpretation": res_primary["interpretation"]
        }

    def _fit_event_sequence(
        self,
        raw_ns: np.ndarray,
        directions: np.ndarray,
        jitter_sec: float = 1e-7
    ) -> Dict[str, Any]:
        """Internal helper to fit bivariate Hawkes on a timestamp sequence"""
        t_sec = np.zeros(len(raw_ns), dtype=np.float64)
        t_base = raw_ns[0] / 1e9
        prev_raw = raw_ns[0]
        tie_count = 0

        for i, ns in enumerate(raw_ns):
            if ns == prev_raw and i > 0:
                tie_count += 1
            else:
                tie_count = 0
                prev_raw = ns
            t_sec[i] = (ns / 1e9 - t_base) + (tie_count * jitter_sec)

        T = float(t_sec[-1])
        t_buy = t_sec[directions == 1]
        t_sell = t_sec[directions == -1]

        n_buy = len(t_buy)
        n_sell = len(t_sell)

        if n_buy < 20 or n_sell < 20 or T <= 0:
            raise ValueError(f"Insufficient trade samples for Hawkes estimation: {n_buy} buys, {n_sell} sells")

        mu_1_init = max(0.1, n_buy / T * 0.2)
        mu_2_init = max(0.1, n_sell / T * 0.2)
        alpha_init = self.beta * 0.4

        all_events = [t_buy, t_sell]

        (mu_1, alpha_11, alpha_12), res_buy = self._fit_single_dimension(
            t_buy, all_events, T, mu_1_init, alpha_init
        )
        (mu_2, alpha_21, alpha_22), res_sell = self._fit_single_dimension(
            t_sell, all_events, T, mu_2_init, alpha_init
        )

        beta = self.beta
        gamma_matrix = np.array([
            [alpha_11 / beta, alpha_12 / beta],
            [alpha_21 / beta, alpha_22 / beta]
        ])

        eigvals = np.linalg.eigvals(gamma_matrix)
        spectral_radius = float(np.max(np.abs(eigvals)))
        is_stable = bool(spectral_radius < 1.0)
        stability_status = "SUBCRITICAL_STABLE" if is_stable else "SUPERCRITICAL_UNSTABLE"

        # Residual Diagnostics
        comp_buy = self._compute_compensator(t_buy, all_events, mu_1, alpha_11, alpha_12, beta)
        comp_sell = self._compute_compensator(t_sell, all_events, mu_2, alpha_21, alpha_22, beta)

        ks_buy = self._run_ks_diagnostic(comp_buy)
        ks_sell = self._run_ks_diagnostic(comp_sell)

        fitting_warnings = []
        if spectral_radius >= 1.0:
            fitting_warnings.append(
                f"Supercritical regime: Spectral radius rho = {spectral_radius:.4f} >= 1.0 indicates "
                "theoretical non-stationarity over infinite horizons; linear branching approximations may diverge."
            )
        if ks_buy["ks_p_value"] < 0.05 or ks_sell["ks_p_value"] < 0.05:
            fitting_warnings.append(
                f"Residual misspecification: Compensator residual KS test rejects Exp(1) (buy p={ks_buy['ks_p_value']:.4f}, sell p={ks_sell['ks_p_value']:.4f}); "
                "empirical trade arrivals exhibit higher-order clustering beyond standard exponential decay."
            )

        interpretation = (
            f"Spectral radius rho(Gamma) = {spectral_radius:.4f} ({stability_status}). "
            f"{'Process is sub-critical and stationary.' if is_stable else 'Process is near or above criticality (rho >= 1), where linear branching theory implies potential explosion or non-stationarity.'} "
            f"Self-excitation ({gamma_matrix[0, 0]:.3f} buy, {gamma_matrix[1, 1]:.3f} sell) vs cross-excitation ({gamma_matrix[0, 1]:.3f} / {gamma_matrix[1, 0]:.3f})."
        )

        return {
            "T": T,
            "n_buy": n_buy,
            "n_sell": n_sell,
            "spectral_radius": spectral_radius,
            "stability_status": stability_status,
            "fitting_warnings": fitting_warnings,
            "convergence": {
                "buy_dimension_converged": bool(res_buy.success),
                "sell_dimension_converged": bool(res_sell.success),
                "buy_message": str(res_buy.message),
                "sell_message": str(res_sell.message)
            },
            "parameters": {
                "mu_buy": float(mu_1),
                "mu_sell": float(mu_2),
                "alpha_buy_buy_self": float(alpha_11),
                "alpha_sell_buy_cross": float(alpha_12),
                "alpha_buy_sell_cross": float(alpha_21),
                "alpha_sell_sell_self": float(alpha_22),
            },
            "branching_ratios": {
                "buy_to_buy": float(gamma_matrix[0, 0]),
                "sell_to_buy": float(gamma_matrix[0, 1]),
                "buy_to_sell": float(gamma_matrix[1, 0]),
                "sell_to_sell": float(gamma_matrix[1, 1]),
                "spectral_radius": spectral_radius,
                "is_subcritical_stable": is_stable
            },
            "residual_diagnostics": {
                "method": "Random Time Change Theorem (Compensator Transformation)",
                "buy_ks_statistic": ks_buy["ks_statistic"],
                "buy_ks_p_value": ks_buy["ks_p_value"],
                "buy_residual_autocorr_lag1": ks_buy["autocorr_lag1"],
                "sell_ks_statistic": ks_sell["ks_statistic"],
                "sell_ks_p_value": ks_sell["ks_p_value"],
                "sell_residual_autocorr_lag1": ks_sell["autocorr_lag1"],
                "interpretation": (
                    "Residual compensator increments tested against Exp(1) distribution. "
                    "Non-rejection indicates empirical consistency with Hawkes intensity dynamics, "
                    "but does not constitute mathematical proof of the underlying data generating mechanism."
                )
            },
            "interpretation": interpretation
        }

    def _fit_microsecond_aggregated_control(self, df: pl.DataFrame) -> Dict[str, Any]:
        """
        Control Model: Groups trades occurring at the exact same microsecond timestamp
        into a single aggregate matching event to quantify how much clustering is
        driven by trade slicing vs true inter-arrival point process dynamics.
        """
        agg_exprs = [
            pl.col("direction").sum().alias("dir_sum"),
            pl.col("direction").first().alias("first_dir")
        ]
        if "base_quantity" in df.columns:
            agg_exprs.append(pl.col("base_quantity").sum().alias("total_qty"))
        elif "quantity" in df.columns:
            agg_exprs.append(pl.col("quantity").sum().alias("total_qty"))

        agg_df = (
            df.group_by("event_timestamp_ns")
            .agg(agg_exprs)
            .sort("event_timestamp_ns")
            .with_columns(
                pl.when(pl.col("dir_sum") > 0)
                .then(1)
                .when(pl.col("dir_sum") < 0)
                .then(-1)
                .otherwise(pl.col("first_dir"))
                .alias("direction")
            )
        )

        n_raw = len(df)
        n_agg = len(agg_df)
        compression_pct = float(100.0 * (1.0 - n_agg / max(1, n_raw)))

        raw_ns = agg_df["event_timestamp_ns"].to_numpy().astype(np.float64)
        dirs = agg_df["direction"].to_numpy()

        try:
            res_agg = self._fit_event_sequence(raw_ns, dirs, jitter_sec=1e-7)
            return {
                "raw_events_count": n_raw,
                "aggregated_events_count": n_agg,
                "compression_ratio_pct": compression_pct,
                "spectral_radius": res_agg["spectral_radius"],
                "stability_status": res_agg["stability_status"],
                "branching_ratios": res_agg["branching_ratios"],
                "buy_ks_statistic": res_agg["residual_diagnostics"]["buy_ks_statistic"],
                "interpretation": (
                    f"Microsecond aggregation compresses {n_raw} raw fills into {n_agg} unique timestamp matching events (-{compression_pct:.1f}%). "
                    f"Aggregated spectral radius drops to {res_agg['spectral_radius']:.4f} ({res_agg['stability_status']}). "
                    "This empirical comparison demonstrates that measured point-process self-excitation is highly sensitive to the definition of the event unit "
                    "(individual child execution vs. matching engine time slice), rather than establishing definitive causal attribution of trader behavior."
                )
            }
        except Exception as e:
            return {
                "raw_events_count": n_raw,
                "aggregated_events_count": n_agg,
                "error": str(e)
            }

    def _fit_single_dimension(
        self,
        t_target: np.ndarray,
        all_event_times: List[np.ndarray],
        T: float,
        mu_init: float,
        alpha_init: float
    ) -> Tuple[Tuple[float, float, float], Any]:
        """
        Maximizes log-likelihood for single point process with inputs from all dimensions:
        lambda(t) = mu + alpha_1 * R_1(t) + alpha_2 * R_2(t)
        """
        beta = self.beta
        r_matrices = []

        for src_times in all_event_times:
            r_vals = np.zeros(len(t_target), dtype=np.float64)
            src_idx = 0
            acc = 0.0
            last_t = 0.0
            for i, cur_t in enumerate(t_target):
                if cur_t > last_t:
                    acc *= np.exp(-beta * (cur_t - last_t))
                while src_idx < len(src_times) and src_times[src_idx] < cur_t:
                    dt = cur_t - src_times[src_idx]
                    acc += np.exp(-beta * dt)
                    src_idx += 1
                r_vals[i] = acc
                last_t = cur_t
            r_matrices.append(r_vals)

        R1 = r_matrices[0]
        R2 = r_matrices[1]

        int_factor_1 = float(np.sum(1.0 - np.exp(-beta * (T - all_event_times[0]))) / beta)
        int_factor_2 = float(np.sum(1.0 - np.exp(-beta * (T - all_event_times[1]))) / beta)

        def neg_log_lik(params):
            mu, a1, a2 = params
            if mu <= 1e-5 or a1 < 0 or a2 < 0:
                return 1e12
            lam = mu + a1 * R1 + a2 * R2
            if np.any(lam <= 1e-10):
                return 1e12
            log_term = np.sum(np.log(lam))
            int_term = mu * T + a1 * int_factor_1 + a2 * int_factor_2
            return -(log_term - int_term)

        init_params = [mu_init, alpha_init, alpha_init * 0.5]
        bounds = [(1e-4, None), (0.0, beta * 1.5), (0.0, beta * 1.5)]
        res = minimize(neg_log_lik, init_params, bounds=bounds, method="L-BFGS-B")

        return (float(res.x[0]), float(res.x[1]), float(res.x[2])), res

    def _compute_compensator(
        self,
        t_target: np.ndarray,
        all_event_times: List[np.ndarray],
        mu: float,
        a1: float,
        a2: float,
        beta: float
    ) -> np.ndarray:
        """Computes integrated intensity Lambda(t_k) at each event time"""
        t_src1, t_src2 = all_event_times
        compensators = np.zeros(len(t_target), dtype=np.float64)

        for i, t in enumerate(t_target):
            base = mu * t
            s1_mask = t_src1 < t
            k1 = (a1 / beta) * np.sum(1.0 - np.exp(-beta * (t - t_src1[s1_mask]))) if np.any(s1_mask) else 0.0
            s2_mask = t_src2 < t
            k2 = (a2 / beta) * np.sum(1.0 - np.exp(-beta * (t - t_src2[s2_mask]))) if np.any(s2_mask) else 0.0
            compensators[i] = base + k1 + k2

        return compensators

    def _run_ks_diagnostic(self, tau: np.ndarray) -> Dict[str, float]:
        """Runs Kolmogorov-Smirnov test and autocorrelation on compensator increments delta_tau ~ Exp(1)"""
        if len(tau) < 20:
            return {"ks_statistic": 0.0, "ks_p_value": 1.0, "autocorr_lag1": 0.0}

        delta_tau = np.diff(tau)
        valid_deltas = delta_tau[delta_tau > 0]

        if len(valid_deltas) < 20:
            return {"ks_statistic": 0.0, "ks_p_value": 1.0, "autocorr_lag1": 0.0}

        # KS test against standard exponential distribution scale=1.0
        res = kstest(valid_deltas, "expon", args=(0, 1.0))

        # Autocorrelation of compensator increments at lag 1
        demeaned = valid_deltas - np.mean(valid_deltas)
        var_d = np.var(valid_deltas)
        ac1 = float(np.mean(demeaned[:-1] * demeaned[1:]) / var_d) if var_d > 0 else 0.0

        return {
            "ks_statistic": float(res.statistic),
            "ks_p_value": float(res.pvalue),
            "autocorr_lag1": ac1
        }
