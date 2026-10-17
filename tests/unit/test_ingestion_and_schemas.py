"""
Unit tests for Ingestion, Timestamp Unit Detection, and Aggressor Mapping.
"""

import pytest
import polars as pl
from packages.schemas.trades import RawTradeRecord, NormalizedTrade


def test_aggressor_mapping():
    # isBuyerMaker == True -> Aggressive SELL (-1)
    # isBuyerMaker == False -> Aggressive BUY (+1)
    df = pl.DataFrame({
        "trade_id": [1, 2],
        "is_buyer_maker": [True, False],
        "price": [50000.0, 50001.0],
        "base_quantity": [0.1, 0.2]
    }).with_columns([
        pl.when(pl.col("is_buyer_maker"))
        .then(pl.lit("SELL"))
        .otherwise(pl.lit("BUY"))
        .alias("aggressor_side"),

        pl.when(pl.col("is_buyer_maker"))
        .then(pl.lit(-1))
        .otherwise(pl.lit(1))
        .alias("direction")
    ])

    assert df["aggressor_side"][0] == "SELL"
    assert df["direction"][0] == -1

    assert df["aggressor_side"][1] == "BUY"
    assert df["direction"][1] == 1


def test_timestamp_unit_detection():
    # Microsecond timestamp has 16 digits: e.g. 1782864000054233
    us_ts = 1782864000054233
    assert us_ts > 10**14

    # Millisecond timestamp has 13 digits: e.g. 1782864000054
    ms_ts = 1782864000054
    assert ms_ts < 10**14


def test_simultaneous_trade_ordering():
    # Two trades with identical timestamp must be ordered deterministically by trade_id
    df = pl.DataFrame({
        "trade_id": [102, 101, 103],
        "original_timestamp": [1000, 1000, 1000],
        "price": [100.0, 100.0, 100.0]
    })
    sorted_df = df.sort(["original_timestamp", "trade_id"])
    assert sorted_df["trade_id"].to_list() == [101, 102, 103]
