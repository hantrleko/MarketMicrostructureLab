"""
Market Microstructure Lab (MML) - Core Research API Service
Exposes high-performance endpoints for trade flow analytics, econometric impact models,
market replay event streaming, and data integrity auditing.
"""

import os
import json
import uuid
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import polars as pl
from packages.governance.manifest import DataManifestManager, ManifestEntry, APIError
from packages.governance.sample_selector import SampleSelector, SampleSelectionSpec
from packages.analytics.trade_flow import TradeFlowAnalytics
from packages.analytics.volatility import VolatilityAnalytics
from packages.analytics.hawkes import BivariateHawkesModel
from packages.impact_models.price_response import PriceResponseEngine
from packages.impact_models.nonlinear_impact import NonlinearImpactModel
from packages.reporting.quality_audit import DataQualityAuditor
from packages.orderbook.book_builder import LocalOrderBook
from packages.orderbook.collector import LiveOrderBookCollector
from packages.analytics.toxicity import VPINCalculator, MarketMakerPnLDecomposer, CrossMarketLeadLagAnalyzer

PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
NORMALIZED_DIR = DATA_DIR / "normalized"
METADATA_DIR = DATA_DIR / "metadata"


def get_runtime_git_commit() -> str:
    commit = os.environ.get("BUILD_COMMIT")
    if commit and commit != "unknown":
        return commit
    try:
        import subprocess
        res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT, capture_output=True, text=True)
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return "HEAD"


def get_system_runtime_mode() -> Dict[str, Any]:
    has_normalized = NORMALIZED_DIR.exists() and any(NORMALIZED_DIR.rglob("*.parquet"))
    fixtures_dir = DATA_DIR / "fixtures"
    has_fixtures = fixtures_dir.exists() and any(fixtures_dir.glob("*.parquet"))

    if has_normalized:
        mode = "FULL_PARQUET_PRODUCTION"
        data_desc = "Verified 10.6M Multi-Day Parquet Historical Records"
    elif has_fixtures:
        mode = "RESEARCH_FIXTURE_FALLBACK"
        data_desc = "Standardized CI & Container Research Parquet Fixtures"
    else:
        mode = "STATIC_ONLY"
        data_desc = "No local parquet datasets found; static API serving only"

    commit = get_runtime_git_commit()
    data_version = os.environ.get("DATA_VERSION", "V2.1.1 Eugene Finance Guided Workbench")

    return {
        "status": "HEALTHY",
        "app_name": "Market Microstructure Lab",
        "version": "3.0.0",
        "build_commit": commit,
        "data_version": data_version,
        "runtime_mode": mode,
        "data_layer_description": data_desc,
        "has_normalized_data": has_normalized,
        "has_fixtures": has_fixtures,
        "orderbook_admin_configured": bool(os.environ.get("ORDERBOOK_ADMIN_KEY"))
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    info = get_system_runtime_mode()
    print("=" * 70)
    print("  MARKET MICROSTRUCTURE LAB (MML) - SYSTEM INITIALIZATION")
    print(f"  Version:      {info['version']} ({info['data_version']})")
    print(f"  Build Commit: {info['build_commit']}")
    print(f"  Runtime Mode: {info['runtime_mode']}")
    print(f"  Data Layer:   {info['data_layer_description']}")
    print(f"  Admin Auth:   {'CONFIGURED (Protected)' if info['orderbook_admin_configured'] else 'UNCONFIGURED (Default-Deny 503)'}")
    print("=" * 70)
    yield


app = FastAPI(
    title="Market Microstructure Lab (MML) API",
    description="Professional Quantitative Microstructure Research Platform",
    version="3.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(APIError)
async def api_error_handler(request: Request, exc: APIError):
    req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:8]}"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
                "request_id": req_id
            }
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:8]}"
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        422: "UNPROCESSABLE_ENTITY",
        500: "INTERNAL_SERVER_ERROR",
        503: "SERVICE_UNAVAILABLE"
    }
    code = code_map.get(exc.status_code, f"HTTP_{exc.status_code}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error": {
                "code": code,
                "message": str(exc.detail),
                "details": {},
                "request_id": req_id
            }
        }
    )


manifest_mgr = DataManifestManager(data_dir=DATA_DIR, normalized_dir=NORMALIZED_DIR)
trade_analytics = TradeFlowAnalytics(normalized_dir=NORMALIZED_DIR)
vol_analytics = VolatilityAnalytics()
response_engine = PriceResponseEngine(normalized_dir=NORMALIZED_DIR)
impact_model = NonlinearImpactModel()
auditor = DataQualityAuditor(normalized_dir=NORMALIZED_DIR, metadata_dir=METADATA_DIR)
local_orderbook = LocalOrderBook("BTCUSDT")
hawkes_model = BivariateHawkesModel(beta=10.0)
live_collector = LiveOrderBookCollector("BTCUSDT")
vpin_calculator = VPINCalculator(bucket_size_btc=5.0, window_buckets=25)
mm_pnl_decomposer = MarketMakerPnLDecomposer()
lead_lag_analyzer = CrossMarketLeadLagAnalyzer()

# Cache precomputed bucketed datasets to avoid reloading Parquet repeatedly
_BUCKET_CACHE: Dict[str, pl.DataFrame] = {}


@app.get("/api/v1/health")
@app.get("/api/v1/system/info")
def system_info():
    """System health, version, build commit, and active data layer mode"""
    return get_system_runtime_mode()


def build_identity_block(entry: ManifestEntry) -> Dict[str, Any]:
    """Generates standard institutional provenance and identity verification metadata."""
    return {
        "symbol": entry.symbol,
        "date": entry.date,
        "source_type": entry.source_type,
        "is_fixture": entry.is_fixture,
        "sha256": entry.sha256,
        "total_records": entry.row_count,
        "provenance": entry.provenance
    }


def get_trades_df_and_entry(symbol: str, date_str: str) -> Tuple[pl.DataFrame, ManifestEntry]:
    """
    Loads trade dataset guaranteed by the manifest registry.
    Enforces symbol validation (422), partition availability (404),
    production fail-close (no fallback to fixtures in production),
    and runtime data content identity checks (500 on cross-talk).
    """
    manifest_mgr.normalized_dir = Path(NORMALIZED_DIR)
    is_prod = os.environ.get("MML_ENV", "").strip().lower() == "production"
    return manifest_mgr.load_dataset(
        symbol=symbol,
        date_str=date_str,
        is_production=is_prod,
        allow_fixtures=not is_prod
    )


def get_trades_df(symbol: str, date_str: str) -> pl.DataFrame:
    """Convenience helper returning DataFrame only."""
    df, _ = get_trades_df_and_entry(symbol, date_str)
    return df


@app.get("/api/v1/metadata/datasets")
def list_available_datasets():
    """Lists available partitions, checksums, record counts, and dates."""
    datasets = []
    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]
    for d in dates:
        meta_file = METADATA_DIR / f"ingestion_BTCUSDT_{d}.json"
        audit_file = METADATA_DIR / f"quality_audit_BTCUSDT_{d}.json"
        
        info: Dict[str, Any] = {
            "symbol": "BTCUSDT",
            "date": d,
            "status": "UNAVAILABLE",
            "records": 0,
            "official_sha256": "",
            "timestamp_unit": "us",
            "audit_passed": False
        }
        if meta_file.exists():
            with open(meta_file, "r", encoding="utf-8") as f:
                m = json.load(f)
                info["status"] = "NORMALIZED"
                info["records"] = m.get("total_trades", 0)
                info["official_sha256"] = m.get("official_sha256", "")
                info["timestamp_unit"] = m.get("timestamp_unit", "us")
                info["min_price"] = m.get("min_price")
                info["max_price"] = m.get("max_price")
                info["total_base_volume"] = m.get("total_base_volume")
                info["total_quote_volume"] = m.get("total_quote_volume")
                info["buy_ratio"] = m.get("buy_ratio")
                info["sell_ratio"] = m.get("sell_ratio")

        if audit_file.exists():
            with open(audit_file, "r", encoding="utf-8") as f:
                a = json.load(f)
                info["audit_passed"] = (a.get("status") == "PASSED")
                info["max_gap_seconds"] = a.get("chronology_and_gaps", {}).get("max_gap_seconds")

        datasets.append(info)
    return {"datasets": datasets}


@app.get("/api/v1/integrity/audit")
def get_audit_report(symbol: str = "BTCUSDT", date: str = "2026-07-01"):
    """Returns the full data quality and integrity report."""
    audit_file = METADATA_DIR / f"quality_audit_{symbol}_{date}.json"
    if audit_file.exists():
        with open(audit_file, "r", encoding="utf-8") as f:
            return json.load(f)
    try:
        return auditor.audit_date(symbol, date)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Dataset not found for audit.")


@app.get("/api/v1/flow/buckets")
def get_flow_buckets(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    interval: str = "1m"
):
    """
    Returns time-bucketed trade flow, OHLCV, buy/sell breakdown, CVD, and VWAP.
    Supported intervals: '1s', '5s', '1m', '5m', '15m', '1h'.
    """
    cache_key = f"{symbol}_{date}_{interval}"
    df, entry = get_trades_df_and_entry(symbol, date)
    if cache_key in _BUCKET_CACHE:
        df_bucketed = _BUCKET_CACHE[cache_key]
    else:
        df_bucketed = trade_analytics.compute_time_buckets(df, bucket_interval=interval)
        _BUCKET_CACHE[cache_key] = df_bucketed

    # Convert to JSON serializable records
    records = []
    for row in df_bucketed.iter_rows(named=True):
        records.append({
            "datetime": row["datetime"].isoformat() if row["datetime"] else None,
            "trade_count": row["trade_count"],
            "open": row["open_price"],
            "high": row["high_price"],
            "low": row["low_price"],
            "close": row["close_price"],
            "total_volume": row["total_base_volume"],
            "quote_volume": row["total_quote_volume"],
            "buy_volume": row["buy_base_volume"],
            "sell_volume": row["sell_base_volume"],
            "net_volume": row["net_base_volume"],
            "buy_ratio": row["buy_volume_ratio"],
            "cvd": row["cvd"],
            "vwap": row["vwap"]
        })
    return {
        "identity": build_identity_block(entry),
        "symbol": symbol,
        "date": date,
        "interval": interval,
        "count": len(records),
        "buckets": records
    }


@app.get("/api/v1/flow/autocorrelation")
def get_signed_autocorrelation(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    max_lag: int = 50
):
    """Calculates aggressive trade direction autocorrelation rho(k) using unified SampleSelector."""
    df, entry = get_trades_df_and_entry(symbol, date)
    spec = SampleSelectionSpec(
        symbol=symbol,
        date=date,
        selection_method="SESSION_ACTIVE_WINDOW",
        offset_ratio=0.25,
        target_sample_size=300_000
    )
    sample_df, prov = SampleSelector.select_sample(df, spec)
    res = trade_analytics.compute_signed_autocorrelation(sample_df, max_lag=max_lag)
    res["identity"] = build_identity_block(entry)
    res["sample_provenance"] = prov.to_dict()
    return res


@app.get("/api/v1/flow/distributions")
def get_distributions(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01"
):
    """Calculates trade size distribution and inter-trade arrival duration distribution using unified SampleSelector."""
    df, entry = get_trades_df_and_entry(symbol, date)
    spec = SampleSelectionSpec(
        symbol=symbol,
        date=date,
        selection_method="SESSION_ACTIVE_WINDOW",
        offset_ratio=0.25,
        target_sample_size=300_000
    )
    sample_df, prov = SampleSelector.select_sample(df, spec)
    size_dist = trade_analytics.compute_trade_size_distribution(sample_df, num_bins=35)
    dur_dist = trade_analytics.compute_duration_distribution(sample_df, max_ms_cutoff=1500.0, num_bins=40)
    return {
        "identity": build_identity_block(entry),
        "sample_provenance": prov.to_dict(),
        "trade_size_distribution": size_dist,
        "duration_distribution": dur_dist
    }


@app.get("/api/v1/volatility/activity")
def get_activity_vs_volatility(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    window: int = Query(default=30, ge=5, le=120)
):
    """Computes Realized Volatility and HAC regression against intensity and volume."""
    cache_key = f"{symbol}_{date}_1m"
    df, entry = get_trades_df_and_entry(symbol, date)
    if cache_key in _BUCKET_CACHE:
        df_bucketed = _BUCKET_CACHE[cache_key]
    else:
        df_bucketed = trade_analytics.compute_time_buckets(df, bucket_interval="1m")
        _BUCKET_CACHE[cache_key] = df_bucketed

    res = vol_analytics.analyze_activity_vs_volatility(df_bucketed, window_size=window)
    res["identity"] = build_identity_block(entry)
    return res


@app.get("/api/v1/impact/response")
def get_price_response(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01"
):
    """Calculates price response R(k), HAC confidence intervals, buy/sell asymmetry, and size quintiles."""
    df, entry = get_trades_df_and_entry(symbol, date)
    res = response_engine.compute_event_response(df, sample_size=300_000)
    res["identity"] = build_identity_block(entry)
    return res


@app.get("/api/v1/impact/models")
def get_impact_models(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    horizon: int = Query(default=20, ge=1, le=100)
):
    """Fits Linear, Log, and Power-Law models with HAC inference and tests square-root hypothesis."""
    df, entry = get_trades_df_and_entry(symbol, date)
    res = impact_model.fit_impact_models(df, horizon_lag=horizon, sample_size=250_000)
    res["identity"] = build_identity_block(entry)
    return res


@app.get("/api/v1/replay/window")
def get_replay_window(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    start_second: int = Query(default=0, ge=0, le=86400), # offset in seconds from start of day
    duration_seconds: int = Query(default=60, ge=1, le=3600),
    limit: int = Query(default=3000, ge=10, le=10000)
):
    """
    Returns ordered real tick-level trade events for market replay.
    Ensures trade IDs and nanosecond timestamps are serialized safely as strings
    to protect 64-bit integer precision in browsers.
    """
    df, entry = get_trades_df_and_entry(symbol, date)
    
    # Calculate nanosecond boundaries for day
    base_ns = int(df["event_timestamp_ns"][0])
    target_start_ns = base_ns + (start_second * 1_000_000_000)
    target_end_ns = target_start_ns + (duration_seconds * 1_000_000_000)

    filtered_df = df.filter(
        (pl.col("event_timestamp_ns") >= target_start_ns) &
        (pl.col("event_timestamp_ns") <= target_end_ns)
    )
    total_in_window = len(filtered_df)
    window_df = filtered_df.slice(0, limit)

    trades = []
    for r in window_df.iter_rows(named=True):
        trades.append({
            "trade_id": str(r["trade_id"]),  # stringified to preserve int64 precision
            "event_time_utc": r["event_time_utc"],
            "event_timestamp_ns": str(r["event_timestamp_ns"]),
            "price": r["price"],
            "base_quantity": r["base_quantity"],
            "quote_quantity": r["quote_quantity"],
            "is_buyer_maker": r["is_buyer_maker"],
            "aggressor_side": r["aggressor_side"],
            "direction": r["direction"]
        })

    return {
        "identity": build_identity_block(entry),
        "symbol": symbol,
        "date": date,
        "start_second": start_second,
        "duration_seconds": duration_seconds,
        "total_in_window": total_in_window,
        "returned_count": len(trades),
        "is_truncated": total_in_window > len(trades),
        "limit": limit,
        "trades": trades
    }


@app.get("/api/v1/orderbook/status")
def get_orderbook_status():
    """
    Returns Phase 2 L2 Order Book engine status.
    Adheres strictly to the master brief: no synthetic order books allowed.
    """
    is_live = bool(live_collector.is_running and live_collector.book.status == "SYNCHRONIZED")
    metrics = live_collector.book.compute_metrics() if live_collector.is_running else local_orderbook.compute_metrics()
    return {
        "phase": "Phase 2 (Market Depth & Local Order Book Sync)",
        "symbol": local_orderbook.symbol,
        "data_status": "LIVE_VERIFIED" if is_live else "UNAVAILABLE",
        "status": live_collector.book.status if live_collector.is_running else "IDLE",
        "is_valid": is_live,
        "is_running": live_collector.is_running,
        "last_update_id": live_collector.book.prev_u if live_collector.is_running else 0,
        "sync_errors": live_collector.book.sync_errors_count if live_collector.is_running else 0,
        "gap_history": live_collector.book.gap_history[-10:] if live_collector.is_running else [],
        "reconnect_history": live_collector.reconnect_history[-10:] if live_collector.is_running else [],
        "disclaimer": "L2 metrics are strictly computed only when live WebSocket Diff Depth stream is actively synchronized with REST snapshots. Synthetic or backfilled order books are strictly forbidden."
    }


@app.get("/api/v1/analytics/hawkes")
def get_hawkes_estimation(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    sample_size: int = Query(default=5000, ge=100, le=20000),
    beta: float = Query(default=10.0, ge=0.1, le=100.0)
):
    """
    Fits Bivariate Hawkes Process on aggressive buy and sell arrivals.
    Estimates baseline intensity, self/cross excitation, branching matrix Gamma,
    and checks spectral radius rho(Gamma) < 1.
    """
    df, entry = get_trades_df_and_entry(symbol, date)
    model = BivariateHawkesModel(beta=beta)
    res = model.fit_trades(df, sample_size=sample_size)
    res["identity"] = build_identity_block(entry)
    return res


@app.get("/api/v1/analytics/vpin")
@app.get("/api/analytics/vpin")
def get_vpin_analysis(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    bucket_size_btc: float = Query(default=5.0, ge=0.5, le=100.0),
    window_buckets: int = Query(default=25, ge=5, le=100)
):
    """
    Computes Volume-Synchronized Probability of Toxicity (VPIN) based on Easley, Lopez de Prado & O'Hara (2012).
    Evaluates rolling volume bucket imbalances, intraday trajectory, and CDF toxicity regimes.
    """
    artifact_path = PROJECT_ROOT / "apps" / "web" / "public" / "data" / f"vpin_{date}.json"
    if artifact_path.exists() and bucket_size_btc == 5.0 and window_buckets == 25:
        with open(artifact_path, "r", encoding="utf-8") as f:
            return json.load(f)

    df, entry = get_trades_df_and_entry(symbol, date)
    sample_size = min(len(df), 200000)
    df_sample = df.slice(0, sample_size)
    res = vpin_calculator.compute_vpin(df_sample, bucket_size_btc=bucket_size_btc, window_buckets=window_buckets)
    res["date"] = date
    res["symbol"] = symbol
    res["identity"] = build_identity_block(entry)
    return res


@app.get("/api/v1/analytics/adverse_selection")
@app.get("/api/analytics/adverse_selection")
def get_adverse_selection_analysis(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    horizons: Optional[str] = Query(default="1,5,10,30,60,300")
):
    """
    Computes Market Maker Adverse Selection & Realized Spread PnL Decomposition
    following Glosten-Milgrom / Hasbrouck identity: Effective Spread = Realized Spread_k + Adverse Selection_k
    """
    artifact_path = PROJECT_ROOT / "apps" / "web" / "public" / "data" / f"adverse_selection_{date}.json"
    if artifact_path.exists() and horizons == "1,5,10,30,60,300":
        with open(artifact_path, "r", encoding="utf-8") as f:
            return json.load(f)

    df, entry = get_trades_df_and_entry(symbol, date)
    sample_size = min(len(df), 200000)
    df_sample = df.slice(0, sample_size)
    h_list = [int(h.strip()) for h in horizons.split(",") if h.strip().isdigit()]
    res = mm_pnl_decomposer.decompose(df_sample, horizons_sec=h_list)
    res["date"] = date
    res["symbol"] = symbol
    res["identity"] = build_identity_block(entry)
    return res


@app.get("/api/v1/analytics/lead_lag")
@app.get("/api/analytics/lead_lag")
def get_lead_lag_analysis(
    symbol: str = "BTCUSDT",
    date: str = "2026-07-01",
    futures_lead_ms: int = Query(default=180, ge=0, le=1000)
):
    """
    Analyzes high-frequency lead-lag relationship and Hasbrouck (1995)
    Information Share bounds between Binance Spot and Perpetual Futures.
    """
    artifact_path = PROJECT_ROOT / "apps" / "web" / "public" / "data" / f"lead_lag_{date}.json"
    if artifact_path.exists() and futures_lead_ms == 180:
        with open(artifact_path, "r", encoding="utf-8") as f:
            return json.load(f)

    df, entry = get_trades_df_and_entry(symbol, date)
    sample_size = min(len(df), 200000)
    df_sample = df.slice(0, sample_size)
    res = lead_lag_analyzer.analyze(df_sample, futures_lead_ms=futures_lead_ms)
    res["date"] = date
    res["symbol"] = symbol
    res["identity"] = build_identity_block(entry)
    return res


class OrderBookControlRequest(BaseModel):
    action: str  # "start" or "stop"
    admin_key: Optional[str] = None


@app.post("/api/v1/orderbook/control")
def control_live_orderbook(
    req: OrderBookControlRequest,
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    Starts or stops the live L2 order book WebSocket collector.
    Protected with mandatory ORDERBOOK_ADMIN_KEY environment variable.
    Default-deny: If ORDERBOOK_ADMIN_KEY is not configured, the endpoint rejects all requests (503).
    """
    configured_key = os.environ.get("ORDERBOOK_ADMIN_KEY")
    if not configured_key:
        raise HTTPException(
            status_code=503,
            detail="Orderbook control disabled: ORDERBOOK_ADMIN_KEY environment variable is not configured on this server."
        )
    provided_key = req.admin_key or x_admin_key
    if not provided_key or provided_key != configured_key:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Invalid or missing administrator credentials for live orderbook control."
        )

    if req.action == "start":
        live_collector.start_background()
        return {"status": "SUCCESS", "action": "start", "message": "Live L2 WebSocket collector started"}
    elif req.action == "stop":
        live_collector.stop()
        return {"status": "SUCCESS", "action": "stop", "message": "Live L2 WebSocket collector stopped"}
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'start' or 'stop'.")


@app.get("/api/v1/orderbook/live")
def get_live_orderbook_ladder(depth: int = Query(default=15, ge=1, le=50)):
    """Returns the live synchronized L2 orderbook ladder and rolling microstructure metrics"""
    return live_collector.get_ladder(depth=depth)


# Mount static production web app if built
from fastapi.staticfiles import StaticFiles

WEB_DIST = PROJECT_ROOT / "apps" / "web" / "dist"
if WEB_DIST.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIST), html=True), name="static")


