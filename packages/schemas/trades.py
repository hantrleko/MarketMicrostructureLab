"""
Strict schemas and data contracts for trade events and microstructure analytics.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field

AggressorSide = Literal["BUY", "SELL"]
TimestampUnit = Literal["ms", "us"]

class RawTradeRecord(BaseModel):
    trade_id: int
    price: float
    qty: float
    quote_qty: float
    time: int
    is_buyer_maker: bool
    is_best_match: bool

class NormalizedTrade(BaseModel):
    exchange: str = "binance"
    market_type: str = "spot"
    symbol: str = "BTCUSDT"
    trade_id: int
    event_time_utc: str  # ISO 8601 string e.g. "2026-07-01T00:00:00.123456Z"
    event_timestamp_ns: int # Unix epoch in nanoseconds for exact integer calculations
    original_timestamp: int
    timestamp_unit: TimestampUnit
    price: float
    base_quantity: float
    quote_quantity: float
    is_buyer_maker: bool
    aggressor_side: AggressorSide
    source_file: str
    ingestion_version: str = "1.0.0"

class IngestionMetadata(BaseModel):
    exchange: str
    market_type: str
    symbol: str
    date: str
    raw_url: str
    raw_checksum_url: str
    raw_file_bytes: int
    official_sha256: str
    local_sha256: str
    checksum_verified: bool
    download_timestamp_utc: str
    total_trades_raw: int
    total_trades_normalized: int
    timestamp_unit: TimestampUnit
    min_event_time_utc: str
    max_event_time_utc: str
    min_price: float
    max_price: float
    total_base_volume: float
    total_quote_volume: float
    buy_trades_count: int
    sell_trades_count: int
    source_license: str = "Binance Public Data Non-Commercial License (Terms & Conditions)"
    ingestion_version: str = "1.0.0"
