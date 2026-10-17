"""
Unit tests for Local Order Book reconstruction and sequence gap detection.
"""

import pytest
from packages.orderbook.book_builder import LocalOrderBook


def test_orderbook_lifecycle_and_sequence():
    ob = LocalOrderBook("BTCUSDT")
    assert ob.status == "IDLE"

    ob.start_buffering()
    assert ob.status == "BUFFERING"

    # Buffer diff updates
    # Event 1: U=101, u=105
    ob.buffer_event({
        "U": 101,
        "u": 105,
        "b": [["60000.0", "1.5"]],
        "a": [["60005.0", "2.0"]]
    })

    # Event 2: U=106, u=110
    ob.buffer_event({
        "U": 106,
        "u": 110,
        "b": [["60001.0", "0.8"]],
        "a": [["60004.0", "1.2"]]
    })

    # Snapshot at lastUpdateId = 100
    snapshot = {
        "lastUpdateId": 100,
        "bids": [["59999.0", "3.0"]],
        "asks": [["60010.0", "4.0"]]
    }

    synced = ob.apply_snapshot(snapshot)
    assert synced is True
    assert ob.status == "SYNCHRONIZED"

    # Verify best bid & ask
    bb = ob.get_best_bid()
    ba = ob.get_best_ask()
    assert bb[0] == 60001.0
    assert ba[0] == 60004.0

    # Metrics
    metrics = ob.compute_metrics()
    assert metrics.is_valid is True
    assert metrics.best_bid == 60001.0
    assert metrics.best_ask == 60004.0
    assert metrics.spread == 3.0
    assert metrics.mid_price == 60002.5


def test_orderbook_gap_detection():
    ob = LocalOrderBook("BTCUSDT")
    ob.start_buffering()
    ob.apply_snapshot({
        "lastUpdateId": 100,
        "bids": [["50000.0", "1.0"]],
        "asks": [["50001.0", "1.0"]]
    })

    # Correct next event is U = 101
    # Introduce gap: send U = 105
    res = ob.process_diff_event({
        "U": 105,
        "u": 110,
        "b": [["50000.0", "2.0"]],
        "a": []
    })
    assert res is False
    assert ob.status == "OUT_OF_SYNC"
    assert ob.sync_errors_count == 1
