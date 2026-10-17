# Market Microstructure Lab (MML) - Architecture Documentation

## 1. System Philosophy & Design Goals
The Market Microstructure Lab (MML) is designed for academic-grade financial quantitative research, high-frequency tick analysis, and interactive market microstructure visualization.

### Core Architecture Principles:
- **Clean Separation of Concerns**: Strict decoupling of data ingestion, schema enforcement, econometric computation, API serialization, and UI visualization.
- **Data Lineage & Non-Destructive Ingestion**: Raw Binance Vision archives are verified by SHA-256 before extraction. The normalized layer uses partitioned Apache Parquet (`zstd` compression) queried via Polars and DuckDB.
- **Type Safety & Precision Preservation**: Int64 trade IDs and nanosecond timestamps are cast to strings in JSON representations to prevent JavaScript float64 rounding errors.
- **Asynchronous Execution & Caching**: Precomputation of time buckets (1s, 5s, 1m, 5m, 1h) allows sub-second chart rendering across multi-million trade partitions.

---

## 2. Directory Layout & Package Boundaries

```text
MarketMicrostructureLab/
├── apps/
│   ├── api/                  # FastAPI REST Service & Data Endpoints
│   │   └── main.py
│   └── web/                  # React 18 + Vite + TypeScript + ECharts Terminal
│       ├── src/
│       │   ├── api/          # Typed API Client
│       │   ├── components/   # Header, Metric Cards, Controls
│       │   ├── pages/        # 5 Interactive Research Pages
│       │   └── types/        # TypeScript Contracts
├── packages/
│   ├── ingestion/            # Downloader, Verifier, Normalizer
│   ├── schemas/              # Pydantic Schemas & Types
│   ├── analytics/            # Trade Flow, CVD, Autocorr, Duration
│   ├── impact_models/        # Price Response R(k), Nonlinear Models, HAC Inference
│   ├── orderbook/            # Local L2 Order Book & Sequence Validator
│   └── reporting/            # Data Quality Auditor & Lineage
├── data/
│   ├── raw/                  # Official ZIPs and .CHECKSUM files
│   ├── normalized/           # Partitioned Parquet files
│   └── metadata/             # Lineage JSONs & Quality Audit Reports
├── research/
│   └── reports/              # Empirical Research Reports
├── tests/
│   └── unit/                 # Pytest Verification Suite
└── docs/                     # Full Documentation Suite
```

---

## 3. Storage Hierarchy

```
Raw Layer (data/raw/)
  └── BTCUSDT-trades-YYYY-MM-DD.zip + .CHECKSUM
          │
          ▼  (SHA-256 Verification & Polars Streaming Normalization)
Normalized Layer (data/normalized/)
  └── exchange=binance/market=spot/symbol=BTCUSDT/date=YYYY-MM-DD/trades.parquet
          │
          ▼  (Dynamic Aggregations & Analytical Engines)
Feature Layer (in-memory / DuckDB lazy scan)
  └── Buckets (CVD, VWAP), Direction Autocorrelation, Size Distributions
          │
          ▼  (Econometric Estimation & HAC Covariance)
Research Layer (data/metadata/ & research/reports/)
  └── R(k) price responses, Square-root tests, Empirical reports
```
