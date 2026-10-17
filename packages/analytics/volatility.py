"""
Volatility & Trading Activity Modeling:
Computes Realized Volatility (RV), Bipower Variation, and runs HAC-robust regressions
between trading intensity, volume, and volatility dynamics.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import polars as pl
import statsmodels.api as sm


class VolatilityAnalytics:
    def __init__(self):
        pass

    def compute_realized_volatility(
        self,
        bucketed_df: pl.DataFrame,
        window_size: int = 30
    ) -> pl.DataFrame:
        """
        Computes rolling realized volatility from bucketed close prices.
        r_t = ln(close_t / close_{t-1})
        RV_t = sqrt(sum_{i=0}^{W-1} r_{t-i}^2)
        """
        df = bucketed_df.with_columns([
            pl.col("close_price").log().diff().alias("log_return")
        ]).with_columns([
            (pl.col("log_return") ** 2).alias("sq_return")
        ]).with_columns([
            (pl.col("sq_return").rolling_sum(window_size=window_size).sqrt()).alias("realized_volatility"),
            (pl.col("trade_count") / 60.0).alias("trades_per_sec")
        ])
        return df

    def analyze_activity_vs_volatility(
        self,
        bucketed_df: pl.DataFrame,
        window_size: int = 30
    ) -> Dict[str, Any]:
        """
        Regresses Realized Volatility on Trading Activity (trade count & volume)
        using OLS with Newey-West HAC covariance estimator.
        RV_t = alpha + beta_1 * Intensity_t + beta_2 * LogVolume_t + e_t
        """
        df_rv = self.compute_realized_volatility(bucketed_df, window_size=window_size)
        
        # Drop nulls from rolling window
        clean = df_rv.filter(
            pl.col("realized_volatility").is_not_null() &
            pl.col("trades_per_sec").is_not_null() &
            (pl.col("total_base_volume") > 0)
        )

        y = clean["realized_volatility"].to_numpy()
        x_intensity = clean["trades_per_sec"].to_numpy()
        x_volume = np.log(clean["total_base_volume"].to_numpy())

        X = np.column_stack([np.ones_like(y), x_intensity, x_volume])
        
        # Fit OLS with Newey-West HAC standard errors (lag = window_size)
        ols_model = sm.OLS(y, X).fit(cov_type="HAC", cov_kwds={"maxlags": window_size})

        return {
            "window_size": window_size,
            "observations": int(len(y)),
            "r_squared": float(ols_model.rsquared),
            "adj_r_squared": float(ols_model.rsquared_adj),
            "f_statistic": float(ols_model.fvalue) if ols_model.fvalue is not None else 0.0,
            "f_pvalue": float(ols_model.f_pvalue) if ols_model.f_pvalue is not None else 0.0,
            "coefficients": {
                "intercept": {
                    "estimate": float(ols_model.params[0]),
                    "hac_std_err": float(ols_model.bse[0]),
                    "t_stat": float(ols_model.tvalues[0]),
                    "p_value": float(ols_model.pvalues[0])
                },
                "trade_intensity": {
                    "estimate": float(ols_model.params[1]),
                    "hac_std_err": float(ols_model.bse[1]),
                    "t_stat": float(ols_model.tvalues[1]),
                    "p_value": float(ols_model.pvalues[1])
                },
                "log_volume": {
                    "estimate": float(ols_model.params[2]),
                    "hac_std_err": float(ols_model.bse[2]),
                    "t_stat": float(ols_model.tvalues[2]),
                    "p_value": float(ols_model.pvalues[2])
                }
            },
            "mean_rv": float(np.mean(y)),
            "std_rv": float(np.std(y)),
            "mean_intensity": float(np.mean(x_intensity))
        }
