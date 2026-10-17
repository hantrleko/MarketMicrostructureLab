# Data Dictionary

## Normalized Trades Schema (`trades.parquet`)

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `exchange` | String | Fixed string `"binance"`. |
| `market_type` | String | Fixed string `"spot"`. |
| `symbol` | String | Market pair symbol, e.g. `"BTCUSDT"`. |
| `trade_id` | Int64 | Unique continuous integer trade identifier assigned by Binance matching engine. |
| `event_time_utc` | String | ISO 8601 UTC timestamp string with microsecond resolution (e.g. `2026-07-01T00:00:00.054233Z`). |
| `event_timestamp_ns` | Int64 | Nanosecond Unix epoch timestamp for high-precision arithmetic and chronological sorting. |
| `original_timestamp` | Int64 | Raw timestamp extracted from Binance Vision archive. |
| `timestamp_unit` | String | `"us"` (microseconds, $\ge 10^{14}$) or `"ms"` (milliseconds). |
| `price` | Float64 | Transaction execution price in quote asset (USDT). |
| `base_quantity` | Float64 | Transaction quantity in base asset (BTC). |
| `quote_quantity` | Float64 | Transaction quote notional ($P \times Q$) in USDT. |
| `is_buyer_maker` | Boolean | `True` if buyer was passive maker; `False` if buyer was taker. |
| `aggressor_side` | String | Explicit active party: `"BUY"` if `is_buyer_maker=False`, `"SELL"` if `is_buyer_maker=True`. |
| `direction` | Int8 | Aggressive signed direction: `+1` for `"BUY"`, `-1` for `"SELL"`. |
| `source_file` | String | Name of the raw CSV file inside the ZIP archive. |
| `ingestion_version`| String | Normalization pipeline semantic version, e.g. `"1.0.0"`. |
