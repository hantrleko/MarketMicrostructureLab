"""
Unit tests for Trade Flow Analytics, CVD, Autocorrelation, and Volatility.
"""

import pytest
import numpy as np
import polars as pl
from packages.analytics.trade_flow import TradeFlowAnalytics
from packages.analytics.volatility import VolatilityAnalytics


def test_cvd_calculation():
    analytics = TradeFlowAnalytics()
    # Construct synthetic verifiable sample
    # 3 trades: BUY 1.0, BUY 2.0, SELL 0.5 -> net volume = 1.0 + 2.0 - 0.5 = 2.5
    df = pl.DataFrame({
        "event_timestamp_ns": [1000_000_000, 2000_000_000, 3000_000_000],
        "price": [100.0, 101.0, 100.5],
        "base_quantity": [1.0, 2.0, 0.5],
        "quote_quantity": [100.0, 202.0, 50.25],
        "direction": [1, 1, -1]
    })
    bucketed = analytics.compute_time_buckets(df, bucket_interval="10s")
    assert len(bucketed) == 1
    assert bucketed["buy_base_volume"][0] == 3.0
    assert bucketed["sell_base_volume"][0] == 0.5
    assert bucketed["net_base_volume"][0] == 2.5
    assert bucketed["cvd"][0] == 2.5


def test_signed_autocorrelation():
    analytics = TradeFlowAnalytics()
    # Alternating direction: +1, -1, +1, -1 -> rho(1) should be approx -1.0
    dirs = [1, -1] * 50
    df = pl.DataFrame({"direction": dirs})
    res = analytics.compute_signed_autocorrelation(df, max_lag=2)
    assert res["autocorrelations"][0] < -0.95
    assert res["autocorrelations"][1] > 0.95


def test_volatility_activity_regression():
    vol = VolatilityAnalytics()
    # Simple bucketed dataframe with prices and volume
    prices = [100.0 + i * 0.1 for i in range(50)]
    df_bucketed = pl.DataFrame({
        "datetime": [f"2026-07-01T00:{i:02d}:00Z" for i in range(50)],
        "close_price": prices,
        "trade_count": [100 + i * 2 for i in range(50)],
        "total_base_volume": [10.0 + i for i in range(50)],
    })
    res = vol.analyze_activity_vs_volatility(df_bucketed, window_size=5)
    assert "r_squared" in res
    assert "coefficients" in res
    assert res["observations"] > 0
