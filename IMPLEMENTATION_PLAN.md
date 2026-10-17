# Market Microstructure Lab (MML) - Implementation Plan

## 1. Project Overview & Core Philosophy
The Market Microstructure Lab (MML) is a high-rigor quantitative research platform and interactive research laboratory designed for analyzing tick-level financial transactions, order flow dynamics, nonlinear market impact, and high-frequency price discovery.

### Guiding Principles:
1. **Real Data Integrity**: No synthetic or mock data masquerading as real exchange records. No simulated fills presented as empirical reality without verifiable assumptions.
2. **Methodological Rigor**: Explicit distinction between correlation and causation, trade-price response vs. true mid-price impact, descriptive statistics vs. predictive models.
3. **Reproducibility**: End-to-end data lineage from official SHA256 checksums to normalized Parquet files, analytical features, and econometric outputs.
4. **Professional High-Density Visualization**: High-performance UI utilizing dark themes, cyan-blue for aggressive buy flow, amber for aggressive sell flow, and gold for key econometric events.

---

## 2. Technical Stack & Dependencies

### Backend & Analytics Engine:
- **Language / Runtime**: Python 3.13 / `uv` for virtual environment & package management.
- **Data Engine**: `polars` (fast columnar processing), `duckdb` (SQL OLAP querying over partitioned Parquet), `pyarrow`.
- **Econometrics / Statistics**: `numpy`, `scipy`, `statsmodels` (HAC / Newey-West standard errors, regression diagnostics, autocorrelation).
- **API Framework**: `fastapi`, `uvicorn`, `pydantic` (strict schemas, avoiding JS float truncation by stringifying or decimal representations where required).
- **Testing**: `pytest`, `pytest-asyncio`.

### Frontend & Visual System:
- **Framework**: React 19 + TypeScript + Vite.
- **Charts / Graphics**: Apache ECharts, HTML5 Canvas for high-frequency order-flow and replay rendering.
- **State & Communication**: Lightweight reactive store (Zustand), Server-Sent Events (SSE) / WebSocket for streaming replay.
- **Styling**: Tailored dark-mode CSS (quant-terminal aesthetic).

---

## 3. Architecture & Data Layers

```
Raw Layer (data/raw/)
  └── ZIP + .CHECKSUM files directly downloaded from Binance Vision
          │ (Validated by SHA256 against official checksum)
Normalized Layer (data/normalized/)
  └── Partitioned Parquet: exchange=binance/market=spot/symbol=BTCUSDT/date=YYYY-MM-DD/
          │ Normalized schema: trade_id, event_time_utc, original_timestamp,
          │ timestamp_unit, price, base_quantity, quote_quantity, is_buyer_maker,
          │ aggressor_side, source_file, ingestion_version
Feature Layer (data/features/)
  └── Microstructure metrics: CVD, volume buckets, duration distribution,
          │ signed trade autocorrelation, trade intensity, realized volatility
Research Layer (data/research/ & research/reports/)
  └── Price response curves R(k), nonlinear impact models (linear, log, power law),
          │ regression tables with HAC standard errors, sample split tests
Metadata Layer (data/metadata/)
  └── Lineage JSON, ingestion logs, data quality audit reports, checksum records
```

---

## 4. Work Breakdown & Milestones

### Milestone 1: Data Foundation & Governance (Highest Priority)
- **Module 1.1: Ingestion & Verification Engine** (`packages/ingestion/`)
  - Target: Binance Spot BTCUSDT trades (start date `2026-07-01`, extendable to `2026-07-03`).
  - Automated download of `.zip` and `.CHECKSUM`.
  - SHA-256 verification against official checksum file before processing.
  - Lineage & metadata recording (source URL, download timestamp UTC, file size, hash, license).
- **Module 1.2: Normalization & Parquet Storage**
  - Parsing Binance trades schema: `tradeId`, `price`, `qty`, `quoteQty`, `time`, `isBuyerMaker`, `isBestMatch`.
  - Timestamp unit auto-detection: microsecond (`us`) for 2025+ Binance spot trades vs. millisecond (`ms`), preserving exact UTC resolution.
  - Direction mapping: `isBuyerMaker == True` -> Aggressive Sell (`aggressor_side = "SELL"`), `isBuyerMaker == False` -> Aggressive Buy (`aggressor_side = "BUY"`).
  - Multi-trade sorting at identical timestamp by `trade_id`.
  - Partitioned Parquet export with zstd compression.
- **Module 1.3: Data Quality & Audit Engine** (`packages/reporting/quality_audit.py`)
  - Validation checks: duplicate trade IDs, monotonic timestamp progression, non-negative volume, positive price, quote volume consistency (`price * qty ≈ quoteQty`), gap detection.
  - Export machine-readable data quality report (`data/metadata/data_quality_report.json`).

### Milestone 2: Analytics & Econometric Engine
- **Module 2.1: Trade Flow Analytics** (`packages/analytics/trade_flow.py`)
  - Aggressive buy / sell volume decomposition.
  - Cumulative Volume Delta (CVD) calculation (tick-by-tick and time-bucketed).
  - VWAP, trade count, inter-trade duration distributions.
  - Signed trade direction autocorrelation $\rho(k) = \text{Corr}(\epsilon_i, \epsilon_{i+k})$.
  - Time-bucketed aggregation (1s, 5s, 1m, 5m, 1h) without interpolating phantom trades in empty buckets.
- **Module 2.2: Price Response & Nonlinear Market Impact** (`packages/impact_models/price_response.py`)
  - Event-time price response function:
    $$R(k) = \mathbb{E}[\epsilon_i \cdot (\ln P_{i+k} - \ln P_i)]$$
    where $\epsilon_i \in \{+1, -1\}$ is the aggressor side.
  - Window evaluation: $k \in [1, 2, 5, 10, 20, 50, 100, 200, 500]$ events, plus clock-time windows (100ms, 500ms, 1s, 5s, 30s).
  - Asymmetric response analysis: separate buy response $R_{\text{buy}}(k)$ and sell response $R_{\text{sell}}(k)$.
  - Nonlinear impact analysis: impact vs. trade volume $Q$:
    - Linear: $R \sim \alpha + \beta Q$
    - Logarithmic: $R \sim \alpha + \beta \ln Q$
    - Power law / Square-root: $R \sim \alpha \cdot Q^\gamma$ (testing whether $\gamma \approx 0.5$ holds or is rejected).
  - Econometric inference: Newey-West HAC standard errors, $t$-statistics, $R^2$, confidence bands.
- **Module 2.3: Trade Arrival & Realized Volatility** (`packages/analytics/volatility.py`)
  - Inter-trade arrival duration distribution (log-normal, Weibull, Pareto diagnostics).
  - Realized volatility (RV) across sampling frequencies.
  - Trading intensity vs. volatility regression with HAC adjustment.

### Milestone 3: Research APIs & High-Performance Web Dashboard
- **Module 3.1: FastAPI Service Layer** (`apps/api/`)
  - Clean separation between storage layer, analytical engine, and REST/WebSocket endpoints.
  - Endpoints:
    - `/api/v1/integrity`: Data coverage, checksum verification status, record counts, anomalies.
    - `/api/v1/replay/window`: Streamed or chunked trade events for market replay with strict cursor/pagination.
    - `/api/v1/analytics/flow`: Time-bucketed volume, aggressive buy/sell ratio, CVD, VWAP.
    - `/api/v1/analytics/distributions`: Trade size distribution, duration distribution, autocorrelation.
    - `/api/v1/impact/response`: Computed $R(k)$ curves, confidence bands, buy vs. sell breakdown.
    - `/api/v1/impact/models`: Nonlinear fit parameters, regression diagnostics, residuals.
- **Module 3.2: Interactive Research UI** (`apps/web/`)
  - **Page 1: Market Replay**:
    - High-precision timeline playback (play, pause, step forward, 0.5x to 10x speed).
    - Canvas-rendered price trajectory with trade bubbles (radius $\propto \sqrt{\text{quantity}}$).
    - Color-coded aggressive buy (cyan) vs. aggressive sell (amber).
    - Synchronized CVD line, volume histogram, and microsecond trade inspector panel.
  - **Page 2: Order Flow Observatory**:
    - Multi-panel dashboard: Aggressive buy/sell flow, CVD progression, signed trade autocorrelation decay $\rho(k)$, log-scale trade size distribution histogram, inter-trade duration distribution.
  - **Page 3: Market Impact Research**:
    - Event-time price response $R(k)$ with 95% HAC confidence intervals.
    - Trade size bucket response curves (quintiles).
    - Buy vs. sell asymmetry plot.
    - Model comparison table (Linear vs. Log vs. Power Law) with parameter estimates, $t$-stats, and $R^2$.
  - **Page 4: Data Integrity Console**:
    - Complete dataset health scorecard: raw file SHA256 audit, records ingested, timestamp unit, missing timestamp/ID checks, schema enforcement status.
  - **Page 5: Order Book Lab (Phase 2 Preview / Architecture)**:
    - Dedicated state display explaining L2 reconstruction requirements and status.
    - Real-time diff depth WebSocket handler ready for live connection testing.

### Milestone 4: Verification, Automated Testing & Research Report
- Comprehensive test suite (`pytest`):
  - Unit tests for buyer-maker mapping, timestamp parsing, CVD calculation, price response.
  - Data quality tests on the ingested BTCUSDT dataset.
  - Edge cases: zero price/qty rejection, monotonic event ordering, multi-trade deduplication.
- Formal Research Report (`research/reports/MML_BTCUSDT_MICROSTRUCTURE_REPORT.md`):
  - Sample definition, methodology, empirical findings, econometric limitations, and robustness checks.

---

## 5. Risk Assessment & Mitigation

| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| Huge file size (>20M trades) causing memory overflow | Med | High | Streaming chunks with Polars / DuckDB lazy scans, precomputed time-bucketed features for UI. |
| Timestamp unit ambiguity (ms vs us) | High | Critical | Automatic inspection of digit count: $\ge 16$ digits indicates $\mu\text{s}$, 13 digits indicates $\text{ms}$. Exact test suite assertion. |
| Direction inverted (`isBuyerMaker`) | High | Critical | Explicit schema mapping with unit tests: `isBuyerMaker == True` -> SELL. |
| JavaScript 64-bit integer precision loss on trade IDs / timestamps | Med | High | Trade IDs and high-precision timestamps serialized as strings in JSON API responses. |
| Overlapping return windows causing invalid standard errors in impact regression | High | Med | Implement Newey-West HAC covariance estimator with bandwidth $L \ge k$. |
