# Market Microstructure Lab (MML)
> **Professional Quantitative Research Software & Market Microstructure Laboratory**  
> *V1.1 Master Release &bull; Quantitative Microstructure Research Workbench*

---

## 1. Project Overview & Mission
**Market Microstructure Lab (MML)** is a quantitative research platform engineered to analyze high-frequency tick-level financial transactions, order flow dynamics, nonlinear price impact, and short-horizon price discovery.

Unlike standard market dashboards, MML enforces:
1. **Real Data Integrity**: Powered by 10,621,476 real, microsecond-resolved Binance Spot BTC/USDT trades from official Binance Vision archives. Zero synthetic or fabricated data.
2. **Econometric Rigor**: Newey-West HAC covariance adjustments for overlapping return horizons, formal hypothesis testing of the Square-Root Law ($\gamma = 0.5$), moving block bootstrap (MBB) inference sensitivity, and empirical price response functions $R(k)$.
3. **Reproducibility**: Complete cryptographic audit trail (official SHA-256 validation), Parquet partitioning via Polars and DuckDB, and an automated regression test suite (90 tests).
4. **Professional Dark-Theme Visualization**: High-performance UI utilizing Cyan (`#00e5ff`) for aggressive buys, Amber (`#ff9100`) for aggressive sells, and Gold (`#ffd700`) for econometric milestones. Fully responsive across 375px to 1920px viewports with native KaTeX mathematical typesetting and modular ECharts bundle optimization.

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
│   └── web/                   # React 18 + Vite + TypeScript + Modular ECharts + KaTeX (port 5173)
├── packages/
│   ├── ingestion/             # Binance Vision downloader & Polars normalizer
│   ├── schemas/               # Strict Pydantic models & data contracts (Contract 1.0.0/1.1.0)
│   ├── analytics/             # CVD, VWAP, trade flow, duration, and autocorrelation
│   ├── impact_models/         # Price response R(k), nonlinear regressions, HAC & MBB inference
│   ├── orderbook/             # Phase 2 LocalOrderBook & sequence gap validator
│   └── reporting/             # Data quality auditor & metadata generators
├── data/
│   ├── raw/                   # Raw ZIP archives and official .CHECKSUM files
│   ├── normalized/            # Partitioned Parquet: exchange/market/symbol/date/
│   └── metadata/              # JSON audit logs and data lineage
├── research/
│   └── reports/               # Academic research report (MML_BTCUSDT_MICROSTRUCTURE_REPORT.md)
└── tests/
    └── unit/                  # Automated pytest suite (87 clean checkout / 90 full tests)
```

---

## 4. Five Interactive Research Pages

1. **Market Replay (`/replay`)**:
   - Historical time range selection and microsecond-order replay.
   - Compact 2-row consolidated toolbar ($\le 85\text{px}$) with pre-indexed intraday windows and playback modes.
   - Dynamic buffer status guidance: indicates loaded clip size, elapsed span, and play instructions.
   - Dynamic y-axis price framing: scales tightly around loaded clip price extremes ($\pm 8\%$ margin).
   - High-performance canvas price trajectory with trade bubble scatter (circle radius $\propto \sqrt{\text{volume}}$).
   - Cyan for aggressive buys, Amber for aggressive sells.
   - Synchronized Cumulative Volume Delta (CVD) and live tick telemetry inspector.
   - Responsive inspector grid (`.responsive-inspector-grid`) with zero horizontal blowout.
2. **Order Flow Observatory (`/observatory`)**:
   - Multi-resolution aggregation (1s, 5s, 1m, 5m, 1h) without phantom trade interpolation.
   - Buy vs. sell volume breakdown, CVD trajectory, and VWAP.
   - Signed trade direction autocorrelation $\rho(k)$ decay curve.
   - Log-scale trade size distribution histogram and inter-trade arrival duration quantiles.
3. **Market Impact Research (`/impact`)**:
   - Reordered cognitive flow: (1) Research Scope & Plain-language framing $\rightarrow$ (2) Date & Horizon Selector $\rightarrow$ (3) Key Empirical Summary $\rightarrow$ (4) First-Screen Visualizations ($R(k)$ & Competing specifications side-by-side) $\rightarrow$ (5) Robustness & Diagnostics $\rightarrow$ (6) Collapsible Sample Accounting Ledger.
   - Native KaTeX mathematical typesetting (`<MathFormula>`): zero unrendered LaTeX exposed in prose; local horizontal scrolling on narrow viewports.
   - Adaptive statistical test cards (`.stat-cards-adaptive`): seamlessly adapts across 375px to 1920px viewports without clipping MBB results.
   - Empirical price response curves $R(k) = \mathbb{E}[\epsilon_i \cdot (\ln P_{i+k} - \ln P_i)]$ with 95% Newey-West HAC confidence bands.
   - Competing impact specifications: Linear, Logarithmic, and Power-Law ($R = \alpha \cdot Q^\gamma$).
   - Formal hypothesis testing card for the Square-Root Law ($H_0: \gamma = 0.5$ vs. $H_0: \gamma = 0$) across WLS, OLS, and Moving Block Bootstrap (MBB).
   - Non-overlapping Purged Walk-Forward Cross-Validation matrix ($k$-trade lookahead purged).
   - Full-sample cryptographic provenance ledger with one-click JSON evidence package export.
4. **Data Integrity Console (`/integrity`)**:
   - Live scorecard of verified partitions, SHA-256 match status, and byte counts.
   - Detailed audit checks: Duplicates (0), Chronological reversals (0), Arithmetic errors (0), Max duration gaps, and simultaneous trade percentage.
5. **Order Book Lab (`/orderbook`)**:
   - Architecture preview of Phase 2 L2 local order book reconstruction.
   - Real-time monitoring of WebSocket sequence alignment, diff depth buffering, and gap rejection.
   - Responsive inspector grid (`.responsive-orderbook-grid`).

---

## 5. Quickstart & Reproduction Guide

### Prerequisites
- **Python**: 3.12+ (tested on Python 3.13)
- **Node.js**: v18+ (tested on Node v22 / v24)
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
# Standard Clean Clone Suite (87 unit & regression tests, zero external data required):
.\.venv\Scripts\pytest -v -m "not production_data"

# Full Suite (90 tests, auto-detects local raw ZIPs and Parquets):
.\.venv\Scripts\pytest -v

# Provenance Audit - Manifest Integrity Mode (verifies 22 static JSON fixtures & Contract 1.0.0/1.1.0 in clean clone):
.\.venv\Scripts\python scripts/recompute_and_audit_provenance.py --mode manifest

# Frontend UI & Production Bundle Quality Gate:
cd apps/web
npm run test:ui
```
*(Clean clones pass 87/87 unit tests with 0 failures and certify `--mode manifest` with exit 0; environments with mounted production data pass 90/90 tests and 4-stage end-to-end recomputation audit `--mode full` with exit 0. If production data is missing, `--mode full` fails-close with exit 1 [INCOMPLETE]).*

### 4. CI Workflow & Automated Quality Gates
The CI pipeline is active under `.github/workflows/ci.yml`, running automatically on every push and pull request across three parallel jobs:
1. **Python Regression & Research Reproducibility**: Runs security audit (`pip-audit`), 90-test pytest suite, and multi-day leak-free consistency checks.
2. **Frontend Typecheck, Security Audit & Build**: Runs `npm audit`, TypeScript typecheck, Vite production build, and `test:ui` bundle quality gate.
3. **Docker Container Build & Runtime Smoke Test**: Builds container image via Buildx, spins up container instance, and validates live runtime endpoints.

### 5. Start the Application
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
