"""
Unit tests for Price Response Engine and Nonlinear Impact Models.
"""

import pytest
import numpy as np
import polars as pl
from packages.impact_models.price_response import PriceResponseEngine
from packages.impact_models.nonlinear_impact import NonlinearImpactModel


def test_price_response_formula():
    engine = PriceResponseEngine()
    # If price moves strictly in the direction of the trade:
    # BUY at 100, then at lag 1 price is 101 -> ret = ln(101/100) > 0, eps = +1 -> eps * ret > 0
    # SELL at 101, then at lag 1 price is 100 -> ret = ln(100/101) < 0, eps = -1 -> eps * ret > 0
    df = pl.DataFrame({
        "symbol": ["TEST"] * 10,
        "price": [100.0, 101.0, 100.0, 101.0, 100.0, 101.0, 100.0, 101.0, 100.0, 101.0],
        "direction": [1, -1, 1, -1, 1, -1, 1, -1, 1, -1],
        "base_quantity": [1.0] * 10
    })
    res = engine.compute_event_response(df, lags=[1], sample_size=10)
    curve_1 = res["curves"][0]
    # Response must be strictly positive
    assert curve_1["response_bps"] > 0
    assert curve_1["lag_events"] == 1


def test_nonlinear_impact_models():
    model = NonlinearImpactModel()
    # Synthetic dataset with 100 points
    n = 100
    prices = [100.0 + np.sin(i * 0.1) for i in range(n)]
    df = pl.DataFrame({
        "price": prices,
        "direction": [1 if i % 2 == 0 else -1 for i in range(n)],
        "base_quantity": [0.1 + (i % 10) * 0.05 for i in range(n)]
    })
    fit = model.fit_impact_models(df, horizon_lag=5, sample_size=n)
    assert "linear_model" in fit
    assert "logarithmic_model" in fit
    assert "power_law_model" in fit
    assert "hypothesis_test_sqrt_law" in fit["power_law_model"]
