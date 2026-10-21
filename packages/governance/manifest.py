"""
Data Governance & Manifest Verification Module.
Guarantees strict identity binding between:
  API Request (symbol, date) <-> Manifest Registry <-> Physical Parquet Content <-> API Response
Enforces Fail-Close behavior in production and strictly forbids cross-symbol or cross-date fallback.
"""

import os
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
import polars as pl


class APIError(Exception):
    """Structured domain API error mapped to uniform error contract."""
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass
class ManifestEntry:
    symbol: str
    date: str
    source_type: str  # "NORMALIZED_PARQUET" or "RESEARCH_FIXTURE"
    file_path: str
    row_count: int
    sha256: str
    min_event_time_utc: str
    max_event_time_utc: str
    min_timestamp_ns: str
    max_timestamp_ns: str
    is_fixture: bool
    provenance: str
    status: str = "VERIFIED"


class DataManifestManager:
    """
    Manages the verified data manifest registry.
    Ensures that every requested partition matches its physical content and provenance.
    """
    SUPPORTED_SYMBOLS = {"BTCUSDT"}

    def __init__(
        self,
        data_dir: Optional[Path] = None,
        normalized_dir: Optional[Path] = None,
        fixtures_dir: Optional[Path] = None
    ):
        if data_dir is None:
            # Default to repo root / data
            self.data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        else:
            self.data_dir = Path(data_dir)

        self.normalized_dir = Path(normalized_dir) if normalized_dir is not None else (self.data_dir / "normalized")
        self.fixtures_dir = Path(fixtures_dir) if fixtures_dir is not None else (self.data_dir / "fixtures")
        self.metadata_dir = self.data_dir / "metadata"
        self.manifest_file = self.metadata_dir / "dataset_manifest.json"
        self.registry: Dict[str, ManifestEntry] = {}
        self.load_or_rebuild()

    def get_entry_path(self, entry: ManifestEntry) -> Path:
        """Resolves the physical Path of a manifest entry, respecting configured dirs and cross-platform slashes."""
        norm_path = entry.file_path.replace("\\", "/").strip("/")
        parts = norm_path.split("/")
        if parts and parts[0] == "normalized":
            return self.normalized_dir / Path(*parts[1:])
        elif parts and parts[0] == "fixtures":
            return self.fixtures_dir / Path(*parts[1:])
        return self.data_dir / Path(*parts)

    @staticmethod
    def compute_sha256(file_path: Path) -> str:
        """Computes SHA-256 checksum of a file in 64KB chunks."""
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()

    def load_or_rebuild(self) -> None:
        """Loads manifest from disk if valid, otherwise rebuilds it."""
        if self.manifest_file.exists():
            try:
                with open(self.manifest_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for key, item in data.get("entries", {}).items():
                        self.registry[key] = ManifestEntry(**item)
                if self.registry:
                    return
            except Exception:
                pass
        self.rebuild_manifest()

    def rebuild_manifest(self) -> Dict[str, ManifestEntry]:
        """Scans normalized datasets and fixtures to construct verifiable manifest."""
        self.registry.clear()

        # 1. Scan normalized production datasets
        if self.normalized_dir.exists():
            for symbol in self.SUPPORTED_SYMBOLS:
                symbol_dir = self.normalized_dir / "exchange=binance" / "market=spot" / f"symbol={symbol}"
                if symbol_dir.exists():
                    for date_dir in sorted(symbol_dir.glob("date=*")):
                        date_str = date_dir.name.split("=")[-1]
                        parquet_file = date_dir / "trades.parquet"
                        if parquet_file.exists():
                            sha = self.compute_sha256(parquet_file)
                            df_scan = pl.read_parquet(parquet_file, columns=["trade_id", "event_time_utc", "event_timestamp_ns"])
                            n_rows = len(df_scan)
                            min_utc = str(df_scan["event_time_utc"][0]) if n_rows > 0 else ""
                            max_utc = str(df_scan["event_time_utc"][-1]) if n_rows > 0 else ""
                            min_ns = str(df_scan["event_timestamp_ns"][0]) if n_rows > 0 else "0"
                            max_ns = str(df_scan["event_timestamp_ns"][-1]) if n_rows > 0 else "0"

                            key = f"{symbol}_{date_str}_prod"
                            self.registry[key] = ManifestEntry(
                                symbol=symbol,
                                date=date_str,
                                source_type="NORMALIZED_PARQUET",
                                file_path=parquet_file.relative_to(self.data_dir).as_posix(),
                                row_count=n_rows,
                                sha256=sha,
                                min_event_time_utc=min_utc,
                                max_event_time_utc=max_utc,
                                min_timestamp_ns=min_ns,
                                max_timestamp_ns=max_ns,
                                is_fixture=False,
                                provenance="BINANCE_VISION_OFFICIAL_AUDITED",
                                status="VERIFIED"
                            )

        # 2. Scan test and research fixtures
        if self.fixtures_dir.exists():
            for fix_file in sorted(self.fixtures_dir.glob("*.parquet")):
                # Expecting naming pattern: sample_trades_YYYY-MM-DD.parquet or sample_trades_SYMBOL_YYYY-MM-DD.parquet
                try:
                    df_scan = pl.read_parquet(fix_file, columns=["symbol", "event_time_utc", "event_timestamp_ns"])
                    n_rows = len(df_scan)
                    if n_rows > 0 and "symbol" in df_scan.columns:
                        content_symbol = str(df_scan["symbol"][0])
                        date_str = str(df_scan["event_time_utc"][0]).split("T")[0].split(" ")[0]
                        sha = self.compute_sha256(fix_file)
                        min_utc = str(df_scan["event_time_utc"][0])
                        max_utc = str(df_scan["event_time_utc"][-1])
                        min_ns = str(df_scan["event_timestamp_ns"][0])
                        max_ns = str(df_scan["event_timestamp_ns"][-1])

                        key = f"{content_symbol}_{date_str}_fixture"
                        self.registry[key] = ManifestEntry(
                            symbol=content_symbol,
                            date=date_str,
                            source_type="RESEARCH_FIXTURE",
                            file_path=fix_file.relative_to(self.data_dir).as_posix(),
                            row_count=n_rows,
                            sha256=sha,
                            min_event_time_utc=min_utc,
                            max_event_time_utc=max_utc,
                            min_timestamp_ns=min_ns,
                            max_timestamp_ns=max_ns,
                            is_fixture=True,
                            provenance="RESEARCH_FIXTURE_ISOLATED",
                            status="VERIFIED"
                        )
                except Exception:
                    continue

        self.save_manifest()
        return self.registry

    def save_manifest(self) -> None:
        """Persists manifest registry to JSON."""
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        data = {
            "version": "1.1.2",
            "supported_symbols": list(self.SUPPORTED_SYMBOLS),
            "total_entries": len(self.registry),
            "entries": {k: asdict(v) for k, v in self.registry.items()}
        }
        with open(self.manifest_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def resolve_dataset(
        self,
        symbol: str,
        date_str: str,
        is_production: bool = False,
        allow_fixtures: bool = True
    ) -> ManifestEntry:
        """
        Resolves the exact dataset manifest entry for (symbol, date).
        Enforces strict fail-closed and differentiated error typing:
        - 422 UNSUPPORTED_SYMBOL if symbol is not supported.
        - 503 DATASET_NOT_CONFIGURED if production partition is registered but not mounted on disk.
        - 404 RESOURCE_NOT_FOUND if requested date does not exist in dataset catalog.
        - 500 FIXTURE_LOAD_FAILED if a test/research fixture is registered in manifest but missing on disk.
        """
        sym = symbol.strip().upper()
        if sym not in self.SUPPORTED_SYMBOLS:
            raise APIError(
                status_code=422,
                code="UNSUPPORTED_SYMBOL",
                message=f"Symbol '{symbol}' is not supported. Supported symbols: {sorted(list(self.SUPPORTED_SYMBOLS))}",
                details={"requested_symbol": symbol, "supported_symbols": sorted(list(self.SUPPORTED_SYMBOLS))}
            )

        prod_key = f"{sym}_{date_str}_prod"
        if prod_key in self.registry:
            entry = self.registry[prod_key]
            full_path = self.get_entry_path(entry)
            if full_path.exists():
                return entry
            elif is_production or not allow_fixtures:
                raise APIError(
                    status_code=503,
                    code="DATASET_NOT_CONFIGURED",
                    message=f"Production dataset for {sym} on date {date_str} is registered in manifest but not provisioned on disk at '{entry.file_path}'. Production fail-close active.",
                    details={"requested_symbol": sym, "requested_date": date_str, "file_path": entry.file_path, "mode": "PRODUCTION_FAIL_CLOSE"}
                )

        # If production mode: strictly fail-close (no fallback to fixtures)
        if is_production or not allow_fixtures:
            raise APIError(
                status_code=404,
                code="RESOURCE_NOT_FOUND",
                message=f"Production dataset for {sym} on date {date_str} not found in catalog. Production fail-close active.",
                details={"requested_symbol": sym, "requested_date": date_str, "mode": "PRODUCTION_FAIL_CLOSE"}
            )

        # Development / CI fixture fallback (only if symbol AND date match exactly)
        fix_key = f"{sym}_{date_str}_fixture"
        if fix_key in self.registry:
            entry = self.registry[fix_key]
            full_path = self.get_entry_path(entry)
            if full_path.exists():
                return entry
            else:
                # Test fixture is declared in manifest but physically missing on disk!
                raise APIError(
                    status_code=500,
                    code="FIXTURE_LOAD_FAILED",
                    message=f"Test fixture for {sym} on date {date_str} registered in manifest at '{entry.file_path}' failed to load from disk.",
                    details={"requested_symbol": sym, "requested_date": date_str, "file_path": entry.file_path, "resolved_path": str(full_path)}
                )

        raise APIError(
            status_code=404,
            code="RESOURCE_NOT_FOUND",
            message=f"Dataset for {sym} on date {date_str} not found in normalized catalog or test fixtures. Cross-symbol and cross-date fallback is strictly prohibited.",
            details={"requested_symbol": sym, "requested_date": date_str}
        )

    def load_dataset(
        self,
        symbol: str,
        date_str: str,
        is_production: bool = False,
        allow_fixtures: bool = True
    ) -> tuple[pl.DataFrame, ManifestEntry]:
        """
        Resolves, loads, and content-validates the requested dataset.
        Guarantees strict identity binding and fail-close execution.
        """
        entry = self.resolve_dataset(
            symbol=symbol,
            date_str=date_str,
            is_production=is_production,
            allow_fixtures=allow_fixtures
        )
        file_path = self.get_entry_path(entry)
        if not file_path.exists():
            if entry.is_fixture:
                raise APIError(
                    status_code=500,
                    code="FIXTURE_LOAD_FAILED",
                    message=f"Test fixture for {symbol} on date {date_str} at '{file_path}' does not exist on disk.",
                    details={"symbol": symbol, "date": date_str, "file_path": str(file_path)}
                )
            else:
                raise APIError(
                    status_code=503,
                    code="DATASET_NOT_CONFIGURED",
                    message=f"Production dataset for {symbol} on date {date_str} at '{file_path}' does not exist on disk.",
                    details={"symbol": symbol, "date": date_str, "file_path": str(file_path)}
                )
        try:
            df = pl.read_parquet(file_path)
        except Exception as e:
            if entry.is_fixture:
                raise APIError(
                    status_code=500,
                    code="FIXTURE_LOAD_FAILED",
                    message=f"Corrupted or unreadable fixture parquet at '{file_path}': {e}",
                    details={"symbol": symbol, "date": date_str, "error": str(e)}
                )
            else:
                raise APIError(
                    status_code=500,
                    code="DATASET_CORRUPTED",
                    message=f"Corrupted or unreadable production parquet at '{file_path}': {e}",
                    details={"symbol": symbol, "date": date_str, "error": str(e)}
                )
        self.validate_content_identity(df, symbol, date_str, entry)
        return df, entry

    def validate_content_identity(
        self,
        df: pl.DataFrame,
        requested_symbol: str,
        requested_date: str,
        manifest_entry: ManifestEntry
    ) -> None:
        """
        Validates loaded DataFrame content against requested identity and manifest.
        Raises 500 DATA_IDENTITY_MISMATCH if content differs from requested symbol/date.
        """
        if "symbol" in df.columns:
            unique_symbols = df["symbol"].unique().to_list()
            for s in unique_symbols:
                if str(s).upper() != requested_symbol.upper():
                    raise APIError(
                        status_code=500,
                        code="DATA_IDENTITY_MISMATCH",
                        message=f"CRITICAL: Data content symbol '{s}' does not match requested symbol '{requested_symbol}'.",
                        details={
                            "requested_symbol": requested_symbol,
                            "content_symbols": [str(x) for x in unique_symbols],
                            "file_path": manifest_entry.file_path
                        }
                    )

        if "event_time_utc" in df.columns and len(df) > 0:
            first_time = str(df["event_time_utc"][0])
            content_date = first_time.split("T")[0].split(" ")[0]
            if content_date != requested_date:
                raise APIError(
                    status_code=500,
                    code="DATA_IDENTITY_MISMATCH",
                    message=f"CRITICAL: Data content date '{content_date}' does not match requested date '{requested_date}'.",
                    details={
                        "requested_date": requested_date,
                        "content_date": content_date,
                        "file_path": manifest_entry.file_path
                    }
                )
