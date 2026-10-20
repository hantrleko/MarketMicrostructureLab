# MarketMicrostructureLab V1.1.1 — Static Deployment & Fixture Validation Report

**Validation Document:** V1.1.1 Production Artifact Verification (Release Candidate)  
**Date:** 2026-10-17  
**Build Target:** `apps/web/dist`  
**Distribution Mode:** Static Web Application (GitHub Pages / Standalone CDN Compatible)  
**Deployment Authorization Gate:** STRICTLY HOLDING PENDING EXPLICIT USER AUTHORIZATION  

---

## 1. Static Artifact Catalog & Verification Matrix

The static deployment bundle contains 62 verified research fixtures generated directly from normalized Parquet layers (`10,621,476` trades) across three consecutive trading days:

### 1.1 Dataset Inventory by Date

| Partition Date | Audit Report | Flow Buckets (1m, 5m, 15m, 1h) | Direction Autocorr | Size Distributions | Price Response $\mathcal{R}(k)$ | Impact Models ($k=5, 10, 20, 50, 100$) | Bivariate Hawkes & Control | Replay Sessions (00:00, 08:00, 14:00, 20:00) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **2026-07-01** | `audit_2026-07-01.json` | 4 resolutions | `autocorr_2026-07-01.json` | `distributions_2026-07-01.json` | `response_2026-07-01.json` | 5 horizons + default | `hawkes_2026-07-01.json` | 4 offsets |
| **2026-07-02** | `audit_2026-07-02.json` | 4 resolutions | `autocorr_2026-07-02.json` | `distributions_2026-07-02.json` | `response_2026-07-02.json` | 5 horizons + default | `hawkes_2026-07-02.json` | 4 offsets |
| **2026-07-03** | `audit_2026-07-03.json` | 4 resolutions | `autocorr_2026-07-03.json` | `distributions_2026-07-03.json` | `response_2026-07-03.json` | 5 horizons + default | `hawkes_2026-07-03.json` | 4 offsets |

### 1.2 Global Fixtures & Contracts
- `datasets.json`: Catalog of all three normalized partitions with record counts, timestamp units (`us`), price ranges, and SHA-256 integrity checksums.
- `orderbook_status.json`: Explicit static contract:
  ```json
  {
    "symbol": "BTCUSDT",
    "status": "DISCONNECTED",
    "data_status": "UNAVAILABLE",
    "is_valid": false,
    "last_sync_timestamp": null,
    "message": "Live orderbook synchronizer requires running the local backend API server."
  }
  ```

---

## 2. Client Fallback & Data Status Segregation Architecture

In `apps/web/src/api/client.ts`, all API requests automatically follow a two-tier resolution pathway:
1. **Tier 1 (Local API)**: If running with FastAPI at `http://localhost:8000`, requests are served dynamically from DuckDB and the live L2 WebSocket collector.
2. **Tier 2 (Static Fallback)**: If the backend is unreachable (e.g., when hosted on GitHub Pages or file server), requests transparently fall back to `/data/<fixture>.json`.

### Strict Veracity Safeguards
- **Zero Synthetic Disguise**: When static fallback occurs for the L2 order book, the system explicitly reports `data_status: "UNAVAILABLE"`.
- **Quarantined Simulation**: If the user clicks `SIMULATE PREVIEW (DEMO)` in `OrderBookLab`, the UI renders a prominent warning banner and updates the status badge to `SIMULATED`. Simulated quotes are stored strictly in browser memory and are **never transmitted, mixed into research statistics, or serialized into historical layers**.
- **Point-Mass Stratification**: `models_${date}_k${k}.json` features 10 discrete economic tiers isolating the `0.00009 BTC` point mass (`unique_quantities_count: 1`, `is_point_mass: true`). Zero tied values are split across bins.
- **Power-Law 95% Confidence Interval**: Renders exact 95% CI $[-0.1190, 0.0581]$ confirming child-order flat saturation while disclaiming any refutation of the Meta-Order Square-Root Law.
- **Hawkes Microsecond Aggregation Control Model**: Compares raw tick self-excitation ($\rho \approx 0.965-1.008$) against aggregated matching events ($\rho \approx 0.498-0.562$), proving limit order slicing accounts for over 40% of measured clustering.
- **Pre-Indexed Replay Offsets**: Clicking session shortcuts (`Session 1 (00:00)`, `Session 2 (08:00)`, `Session 3 (14:00)`, `Session 4 (20:00)`) requests pre-indexed fixtures `/data/replay_window_${date}_${offset}.json`.
- **True Count Clarification**: `total_in_window` reflects the actual total events in that 10-second slice, while `returned_count` reflects the maximum sliced limit (1,000 events).

---

## 3. Automated Playwright Browser Audit Results

The production bundle in `apps/web/dist` was audited using Playwright Chromium in headless mode across desktop and mobile form factors.

### 3.1 Viewport Audit Log

| Viewport | Form Factor | Pages Audited | Console Errors | Network Failures (4xx/5xx) | Screenshot Artifacts |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Desktop** | $1920 \times 1080$ (HiDPI 2x) | All 5 tabs + interactive controls | **0** | **0** | `desktop_01_market_replay.png`<br>`desktop_02_order_flow_observatory.png`<br>`desktop_03_market_impact_research.png`<br>`desktop_03b_impact_horizon_k5.png`<br>`desktop_04_data_integrity_console.png`<br>`desktop_05_orderbook_lab_initial.png`<br>`desktop_05b_orderbook_lab_simulated.png` |
| **Mobile** | $375 \times 812$ (iPhone 13) | All 5 tabs + responsive navigation | **0** | **0** | `mobile_01_market_replay.png`<br>`mobile_02_order_flow_observatory.png`<br>`mobile_03_market_impact_research.png`<br>`mobile_03b_impact_horizon_k5.png`<br>`mobile_04_data_integrity_console.png`<br>`mobile_05_orderbook_lab_initial.png`<br>`mobile_05b_orderbook_lab_simulated.png` |

---

## 4. Legal Compliance & Data Governance

1. **Official Data Provenance**:
   - Primary data: Binance Vision Public Data Archive (`https://data.binance.vision/data/spot/daily/trades/BTCUSDT/`).
   - Integrity validated against official SHA-256 checksums for all three partitions.
2. **License Restrictions**:
   - Binance Vision data is used strictly in accordance with Binance Public Data Terms & Conditions: **Non-commercial academic research, pedagogical review, and econometric inquiry only**.
   - Automated algorithmic execution, commercial proprietary trading, or monetized trade signal syndication are strictly prohibited.
3. **Open Data & Derived Output License**:
   - All derived empirical statistics, model parameters, and visualizations are distributed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)** license. Any downstream usage or derivation must credit Market Microstructure Lab (MML) and remain strictly non-commercial and ShareAlike.

---

## 5. Deployment Authorization Status

- **Build Output**: `apps/web/dist/` is complete, standalone, self-contained, and verified.
- **GitHub Pages Branch**: `gh-pages` deployment is **NOT executed**.
- **Deployment Status**: Gated and awaiting user instruction:
  - When the user confirms readiness to publish, deployment can be triggered directly via git or GitHub Actions.
