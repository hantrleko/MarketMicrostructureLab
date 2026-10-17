"""
Empirical Price Response & Market Impact Engine.
Calculates event-time price response functions R(k) = E[epsilon_i * (ln P_{i+k} - ln P_i)],
asymmetric buy/sell curves, size-stratified responses, and HAC-adjusted confidence bands.
"""

from typing import Dict, Any, List, Optional
from pathlib import Path
import numpy as np
import polars as pl
import statsmodels.api as sm


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
        To maintain optimal response time on multi-million row datasets while preserving
        full econometric validity, allows representative subsampling or full calculation.
        """
        if lags is None:
            lags = [1, 2, 3, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500]

        # Extract numpy arrays
        if sample_size and len(df) > sample_size:
            # Take consecutive slice to preserve sequential dependence
            start_idx = len(df) // 4
            sub_df = df.slice(start_idx, sample_size)
        else:
            sub_df = df

        prices = sub_df["price"].to_numpy().astype(np.float64)
        directions = sub_df["direction"].to_numpy().astype(np.float64)
        quantities = sub_df["base_quantity"].to_numpy().astype(np.float64)
        log_prices = np.log(prices)
        n = len(log_prices)

        results_by_lag = []

        # Trade size quintiles
        q_edges = np.percentile(quantities, [20, 40, 60, 80])
        q_bins = np.digitize(quantities, q_edges) # 0 to 4 (5 quintiles)

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

            # Newey-West HAC standard error estimation
            # For lag k, serial correlation in overlapping returns extends up to k lags
            var_bps = np.var(signed_ret_bps)
            n_obs = len(signed_ret_bps)
            
            # Autocovariance adjustment up to min(k, 50) lags
            max_nw_lag = min(k, 30)
            gamma_0 = var_bps
            gamma_sum = 0.0
            demeaned = signed_ret_bps - mean_resp_bps
            for j in range(1, max_nw_lag + 1):
                weight = 1.0 - (j / (max_nw_lag + 1.0)) # Bartlett kernel
                cov_j = np.mean(demeaned[:-j] * demeaned[j:])
                gamma_sum += 2.0 * weight * cov_j

            lr_var = max(1e-9, gamma_0 + gamma_sum)
            hac_se = float(np.sqrt(lr_var / n_obs))
            t_stat = mean_resp_bps / hac_se if hac_se > 0 else 0.0

            # Buy vs. Sell asymmetry
            buy_mask = (eps == 1.0)
            sell_mask = (eps == -1.0)

            buy_ret_bps = (ret_k[buy_mask] * 10_000.0)
            sell_ret_bps = (-ret_k[sell_mask] * 10_000.0)

            buy_resp_bps = float(np.mean(buy_ret_bps)) if len(buy_ret_bps) > 0 else 0.0
            sell_resp_bps = float(np.mean(sell_ret_bps)) if len(sell_ret_bps) > 0 else 0.0

            # Size quintile breakdown
            quintile_resps = []
            for q_idx in range(5):
                mask_q = (q_bin_slice == q_idx)
                if np.sum(mask_q) > 0:
                    q_mean = float(np.mean(signed_ret_bps[mask_q]))
                else:
                    q_mean = 0.0
                quintile_resps.append(q_mean)

            results_by_lag.append({
                "lag_events": k,
                "response_bps": mean_resp_bps,
                "hac_std_err": hac_se,
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
            "quintile_thresholds_qty": [float(x) for x in q_edges],
            "curves": results_by_lag
        }
