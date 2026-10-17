# Market Microstructure Lab (MML)
> **Professional Quantitative Research Software & Market Microstructure Laboratory**  
> *V1.0 Master Release &bull; Non-Commercial Research & Educational Platform*

---

## 1. Project Overview & Mission
**Market Microstructure Lab (MML)** is a quantitative research platform engineered to analyze high-frequency tick-level financial transactions, order flow dynamics, nonlinear price impact, and short-horizon price discovery.

Unlike standard market dashboards, MML enforces:
1. **Real Data Integrity**: Powered by 10,621,476 real, microsecond-resolved Binance Spot BTC/USDT trades from official Binance Vision archives. Zero synthetic or fabricated data.
2. **Econometric Rigor**: Newey-West HAC covariance adjustments for overlapping return horizons, formal hypothesis testing of the Square-Root Law ($\gamma = 0.5$), and empirical price response functions $R(k)$.
3. **Reproducibility**: Complete cryptographic audit trail (official SHA-256 validation), Parquet partitioning via Polars and DuckDB, and an automated data quality test suite.
4. **Professional Dark-Theme Visualization**: High-performance UI utilizing Cyan (`#00e5ff`) for aggressive buys, Amber (`#ff9100`) for aggressive sells, and Gold (`#ffd700`) for econometric milestones.

---

## 2. Ingested & Verified Real Datasets

| Partition Date | Market Symbol | Records Ingested | Base Volume (BTC) | Quote Volume (USDT) | Official SHA-256 Checksum | Integrity Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2026-07-01** | `BTCUSDT` | 4,166,849 | 25,093.45 | $1,491,051,306.82 | `c1366b2200130527cdd87da1c5b1a012ac31de00db93b3db2a13281187bb8653` | **PASSED** (0 dup, 0 rev) |
| **2026-07-02** | `BTCUSDT` | 3,883,096 | 21,382.14 | $1,308,156,569.72 | `c3f109b71a6980c84f4f2e7e03198e579b836e76e5a356c80063cc830848b073` | **PASSED** (0 dup, 0 rev) |
| **2026-07-03** | `BTCUSDT` | 2,571,531 | 14,048.99 | $870,359,931.58 | `d73d74dc6a0775d686c09228ff2b3c02e5763d9409716a809f5279844dd364be` | **PASSED** (0 dup, 0 rev) |
| **Total** | **BTCUSDT** | **10,621,476** | **60,524.58** | **$3,669,567,808.12** | **Cryptographically Verified** | **100% HEALTHY** |

---

## 3. Platform Architecture & Modules

```text
MarketMicrostructureLab/
├── apps/
│   ├── api/                   # FastAPI backend service (port 8000)
│   └── web/                   # React 18 + Vite + TypeScript + ECharts frontend (port 5173)
├── packages/
│   ├── ingestion/             # Binance Vision downloader & Polars normalizer
│   ├── schemas/               # Strict Pydantic models & data contracts
│   ├── analytics/             # CVD, VWAP, trade flow, duration, and autocorrelation
│   ├── impact_models/         # Price response R(k), nonlinear regressions, HAC inference
│   ├── orderbook/             # Phase 2 LocalOrderBook & sequence gap validator
│   └── reporting/             # Data quality auditor & metadata generators
├── data/
│   ├── raw/                   # Raw ZIP archives and official .CHECKSUM files
│   ├── normalized/            # Partitioned Parquet: exchange/market/symbol/date/
│   └── metadata/              # JSON audit logs and data lineage
├── research/
│   └── reports/               # Academic research report (MML_BTCUSDT_MICROSTRUCTURE_REPORT.md)
└── tests/
    └── unit/                  # Automated pytest suite (15 unit & integration tests)
```

---

## 4. Five Interactive Research Pages

1. **Market Replay (`/replay`)**:
   - Historical time range selection and microsecond-order replay.
   - Interactive playback controls: Play, Pause, Step, Speed (1x, 2x, 5x, 10x).
   - Canvas/ECharts price trajectory with trade bubble scatter (circle radius $\propto \sqrt{\text{volume}}$).
   - Cyan for aggressive buys, Amber for aggressive sells.
   - Synchronized Cumulative Volume Delta (CVD) and live trade tape inspector.
2. **Order Flow Observatory (`/observatory`)**:
   - Multi-resolution aggregation (1s, 5s, 1m, 5m, 1h) without phantom trade interpolation.
   - Buy vs. sell volume breakdown, CVD trajectory, and VWAP.
   - Signed trade direction autocorrelation $\rho(k)$ decay curve.
   - Log-scale trade size distribution histogram and inter-trade arrival duration quantiles.
3. **Market Impact Research (`/impact`)**:
   - Empirical price response curves $R(k) = \mathbb{E}[\epsilon_i \cdot (\ln P_{i+k} - \ln P_i)]$ with 95% Newey-West HAC confidence bands.
   - Buy vs. sell asymmetric response curves.
   - Competing impact specifications: Linear, Logarithmic, and Power-Law ($R = \alpha \cdot Q^\gamma$).
   - Formal hypothesis testing card for the Square-Root Law ($H_0: \gamma = 0.5$).
4. **Data Integrity Console (`/integrity`)**:
   - Live scorecard of verified partitions, SHA-256 match status, and byte counts.
   - Detailed audit checks: Duplicates (0), Chronological reversals (0), Arithmetic errors (0), Max duration gaps, and simultaneous trade percentage.
5. **Order Book Lab (`/orderbook`)**:
   - Architecture preview of Phase 2 L2 local order book reconstruction.
   - Real-time monitoring of WebSocket sequence alignment, diff depth buffering, and gap rejection.

---

## 5. Quickstart & Reproduction Guide

### Prerequisites
- **Python**: 3.12+ (tested on Python 3.13)
- **Node.js**: v18+ (tested on Node v24.15)
- **uv** (recommended) or standard `pip`

### 1. Environment Setup
```powershell
# From MarketMicrostructureLab root:
uv venv --python 3.13 .venv
.\.venv\Scripts\activate

# Install backend dependencies:
uv pip install -e .
```

### 2. Run Data Quality Audit
```powershell
.\.venv\Scripts\python scripts/run_audit.py
```

### 3. Run Automated Tests
```powershell
.\.venv\Scripts\pytest -v
```
*(All 15 unit and integration tests will run and pass).*

### 4. Start the Application
You can launch both services using the provided PowerShell script or run them in separate terminals:

**Terminal 1 (Backend API - FastAPI):**
```powershell
.\.venv\Scripts\uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend UI - React/Vite):**
```powershell
cd apps/web
npm run dev
```
Open your browser to: **http://localhost:5173**

---

## 6. Academic License & Disclaimer
- **Non-Commercial License**: The historical data from Binance Vision is strictly licensed for non-commercial research, academic inquiry, and educational purposes.
- **Microstructure Notice**: Transaction-price responses reflect effective trade-price dynamics and bid-ask bounce; they should not be conflated with exogenous mid-quote price impact or guaranteed strategy returns.
