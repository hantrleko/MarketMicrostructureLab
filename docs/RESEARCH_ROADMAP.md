# Research Roadmap & Phase Progression

## Phase 1: Real Trade Flow Lab (Complete)
- [x] Official Binance Vision downloader with SHA-256 verification.
- [x] Polars-based microsecond normalization to partitioned Parquet.
- [x] Full data quality audit suite.
- [x] Cumulative Volume Delta (CVD) and time-bucketed aggregations.
- [x] Signed direction autocorrelation $\rho(k)$.
- [x] Event-time price response $R(k)$ with Newey-West HAC confidence intervals.
- [x] Competing nonlinear impact models and Square-Root Law hypothesis testing.
- [x] 5-Page Quant Research Web Terminal with real-time replay and inspection.

## Phase 2: Live L2 Order Book Reconstruction (Architected & Previewed)
- [x] LocalOrderBook engine with snapshot alignment and sequence gap detection.
- [x] Order book synchronization status and metric calculations (Spread bps, Microprice, Top-5 Depth, Imbalance).
- [ ] Production background WebSocket daemon recording full diff-depth event streams.
- [ ] Multi-day persistent L2 depth snapshots and quote-based order flow imbalance (OFI).

## Phase 3: Advanced Econometrics & Hawkes Processes
- [ ] Mutually exciting multidimensional Hawkes process for buy and sell arrival intensities.
- [ ] Volatility regime-switching market impact models.
- [ ] Cross-asset comparison (ETHUSDT vs BTCUSDT).

## Phase 4: Execution Cost Modeling
- [ ] Almgren-Chriss optimal liquidation execution simulator based on empirical impact parameters.
- [ ] Strict out-of-sample backtesting with explicit exchange fee tiers and slippage bounds.
