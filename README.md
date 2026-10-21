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
    └── unit/                  # Automated pytest suite (57 clean checkout / 60 production tests)
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

### 3. Run Automated Tests & Provenance Audit
```powershell
# Standard Clean Clone Suite (57 unit & regression tests, zero external data required):
.\.venv\Scripts\pytest -v -m "not production_data"

# Full Suite (60 tests, auto-detects local raw ZIPs and Parquets):
.\.venv\Scripts\pytest -v

# Provenance Audit - Manifest Integrity Mode (verifies 18 static JSONs & Contract 1.3.0 in clean clone):
.\.venv\Scripts\python scripts/recompute_and_audit_provenance.py --mode manifest

# Provenance Audit - Full Recomputation Mode (Stages 1-3 + Stage 4 raw ZIP extraction, Parquet bitwise parity, and live model recomputation < 1e-6; requires local production datasets):
.\.venv\Scripts\python scripts/recompute_and_audit_provenance.py --mode full
```
*(Clean clones pass 57/57 unit tests with 0 failures and certify `--mode manifest` with exit 0; environments with mounted production data pass 60/60 tests and 4-stage end-to-end recomputation audit `--mode full` with exit 0. If production data is missing, `--mode full` fails-close with exit 1 [INCOMPLETE]).*

### 4. CI Workflow & Release Gate Activation
The reference GitHub Actions pipeline is version-controlled at `ci/workflows/ci.yml`.
To activate it under `.github/workflows/ci.yml`, ensure your GitHub CLI or personal access token has the `workflow` scope:
```powershell
# Refresh token with workflow scope:
gh auth refresh -h github.com -s workflow

# Copy workflow into .github directory:
New-Item -ItemType Directory -Force -Path .github/workflows
Copy-Item ci/workflows/ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "ci: enable automated GitHub Actions release gates"
git push
```

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

## 6. Deployment & Runtime Modes (M7 Specification)
- **Static Research Deployment (GitHub Pages)**: The public frontend terminal is hosted at `https://hantrleko.github.io/MarketMicrostructureLab/` reading pre-computed, cryptographically verified static JSON fixtures (Contract 1.3.0). It provides an offline, non-realtime historical research environment.
- **Local Analytical Engine (DuckDB & FastAPI)**: Running locally with `uvicorn apps.api.main:app` connects directly to the 10.6M row normalized Parquet files via DuckDB for real-time slicing and dynamic modeling.
- **Docker Status**: `EXPERIMENTAL / UNVERIFIED (LOCAL RUNTIME)`. Dockerfile and docker-compose configurations are provided for containerized deployment, but host environments lacking an active Docker daemon have not executed container images. The verified reference runtimes are the local Python virtual environment and the GitHub Pages static deployment.

---

## 7. Econometric Framing & Disclaimer (M4 Bounded Language)
- **Non-Commercial License**: The historical data from Binance Vision is strictly licensed for non-commercial research, academic inquiry, and educational purposes.
- **Bounded Empirical Framing**: Square-root price impact ($I(Q) \approx Y \sigma \sqrt{Q/V}$) is an empirical scaling relationship established for cumulative institutional meta-orders executed over hours or days; it is not an axiomatic law, universal invariance, or physical theorem. Single child-order tick response $\mathcal{R}(v, k)$ measures instantaneous liquidity depletion and transient quote replenishment; it cannot be conflated with exogenous meta-order impact.
- **Inference Precision**: Confidence interval containment of zero does not prove the absence of an effect; it indicates that the current sample and specification do not detect a statistically distinguishable difference from zero. Power-law scaling parameters depend substantially on the date, specification, and temporal dependence assumptions.
