"""
Empirical Price Response & Market Impact Engine.
Calculates event-time price response functions R(k) = E[epsilon_i * (ln P_{i+k} - ln P_i)],
asymmetric buy/sell curves, rank-based size-stratified responses,
and HAC-adjusted confidence bands with bandwidth sensitivity analysis.
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
import numpy as np
import polars as pl
from scipy.stats import rankdata


class PriceResponseEngine:
    def __init__(self, normalized_dir: str | Path = "data/normalized"):
        self.normalized_dir = Path(normalized_dir)

    def compute_event_response(
        self,
        df: pl.DataFrame,
        lags: Optional[List[int]] = None,
        sample_size: Optional[int] = 500_000
    ) -> Dict[str, Any]:
        """
        Calculates R(k) = E[eps_i * (ln P_{i+k} - ln P_i)] for specified event lags k.
        Uses rank-based quantile partitioning to prevent empty buckets caused by discrete trade sizes.
        Includes HAC standard error estimation across multiple Bartlett bandwidths.
        """
        if lags is None:
            lags = [1, 2, 3, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500]

        # Extract numpy arrays
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

        # Rank-based quantile allocation (avoids empty bins from duplicate percentiles)
        # Uses average ranking for ties to guarantee non-empty groups
        ranks = (rankdata(quantities, method="average") - 1.0) / max(1, n - 1)
        q_bins = np.floor(ranks * 5.0).astype(int).clip(0, 4)

        # Calculate actual bounds for each quintile with unique values audit
        quintile_bounds = []
        for q_idx in range(5):
            mask_q = (q_bins == q_idx)
            if np.any(mask_q):
                q_sub = quantities[mask_q]
                min_v = float(np.min(q_sub))
                max_v = float(np.max(q_sub))
                n_uniq = int(len(np.unique(q_sub)))
                quintile_bounds.append({
                    "quintile": q_idx + 1,
                    "min_qty": min_v,
                    "max_qty": max_v,
                    "mean_qty": float(np.mean(q_sub)),
                    "unique_quantities_count": n_uniq,
                    "is_point_mass": bool(min_v == max_v),
                    "count": int(np.sum(mask_q))
                })

        results_by_lag = []

        for k in lags:
            if k >= n:
                continue

            # Event returns: ln(P_{i+k}) - ln(P_i)
            ret_k = log_prices[k:] - log_prices[:-k]
            eps = directions[:-k]
            q_bin_slice = q_bins[:-k]

            # Signed return: eps_i * ret_k (in basis points: * 10,000)
            signed_ret_bps = (eps * ret_k) * 10_000.0
            
            # Mean price response
            mean_resp_bps = float(np.mean(signed_ret_bps))
            n_obs = len(signed_ret_bps)
            var_bps = float(np.var(signed_ret_bps))
            demeaned = signed_ret_bps - mean_resp_bps

            # Newey-West HAC standard error estimation with multiple bandwidths
            bandwidths = [5, 10, 20, 30, 50]
            hac_by_bandwidth: Dict[str, float] = {}
            for bw in bandwidths:
                actual_bw = min(bw, n_obs // 10)
                gamma_sum = 0.0
                for j in range(1, actual_bw + 1):
                    weight = 1.0 - (j / (actual_bw + 1.0))  # Bartlett kernel
                    cov_j = np.mean(demeaned[:-j] * demeaned[j:])
                    gamma_sum += 2.0 * weight * cov_j
                lr_var = max(1e-9, var_bps + gamma_sum)
                hac_by_bandwidth[f"lag_{bw}"] = float(np.sqrt(lr_var / n_obs))

            # Primary standard error uses standard Newey-West bandwidth min(k, 30)
            primary_bw = max(5, min(k, 30))
            hac_se = hac_by_bandwidth.get(f"lag_{primary_bw}", hac_by_bandwidth["lag_20"])
            t_stat = mean_resp_bps / hac_se if hac_se > 0 else 0.0

            # Buy vs. Sell asymmetry
            buy_mask = (eps == 1.0)
            sell_mask = (eps == -1.0)

            buy_ret_bps = ret_k[buy_mask] * 10_000.0
            sell_ret_bps = -ret_k[sell_mask] * 10_000.0

            buy_resp_bps = float(np.mean(buy_ret_bps)) if len(buy_ret_bps) > 0 else 0.0
            sell_resp_bps = float(np.mean(sell_ret_bps)) if len(sell_ret_bps) > 0 else 0.0

            # Size quintile breakdown (never zero-filled: only valid averages)
            quintile_resps = []
            for q_idx in range(5):
                mask_q = (q_bin_slice == q_idx)
                cnt = int(np.sum(mask_q))
                if cnt > 0:
                    q_mean = float(np.mean(signed_ret_bps[mask_q]))
                else:
                    q_mean = None
                quintile_resps.append(q_mean)

            results_by_lag.append({
                "lag_events": k,
                "response_bps": mean_resp_bps,
                "hac_std_err": hac_se,
                "hac_bandwidth_sensitivity": hac_by_bandwidth,
                "ci_lower_95": mean_resp_bps - 1.96 * hac_se,
                "ci_upper_95": mean_resp_bps + 1.96 * hac_se,
                "t_stat": t_stat,
                "observations": n_obs,
                "buy_response_bps": buy_resp_bps,
                "sell_response_bps": sell_resp_bps,
                "asymmetry_bps": buy_resp_bps - sell_resp_bps,
                "quintile_q1_bps": quintile_resps[0],
                "quintile_q2_bps": quintile_resps[1],
                "quintile_q3_bps": quintile_resps[2],
                "quintile_q4_bps": quintile_resps[3],
                "quintile_q5_bps": quintile_resps[4],
            })

        return {
            "symbol": sub_df["symbol"][0] if "symbol" in sub_df.columns else "BTCUSDT",
            "sample_size": n,
            "quintile_bounds": quintile_bounds,
            "curves": results_by_lag
        }
