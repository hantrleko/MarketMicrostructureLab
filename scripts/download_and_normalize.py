"""
End-to-end data acquisition, checksum verification, and normalization script.
Allows 100% automated reproduction of normalized Parquet datasets.
"""

import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from packages.ingestion.binance_downloader import BinanceVisionDownloader
from packages.ingestion.normalizer import BinanceTradeNormalizer
from packages.reporting.quality_audit import DataQualityAuditor

def main():
    symbol = "BTCUSDT"
    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]

    print("==========================================================")
    print("  MML DATA REPRODUCTION PIPELINE: BINANCE VISION SPOT     ")
    print("==========================================================")
    
    downloader = BinanceVisionDownloader(raw_dir="data/raw")
    normalizer = BinanceTradeNormalizer(raw_dir="data/raw", normalized_dir="data/normalized", metadata_dir="data/metadata")
    auditor = DataQualityAuditor(normalized_dir="data/normalized", metadata_dir="data/metadata")

    for d in dates:
        print(f"\n[>>>] Processing {symbol} for {d}...")
        # 1. Download & Verify SHA256
        res_dl = downloader.download_and_verify(symbol=symbol, date_str=d)
        print(f"      [1/3] SHA256 Verified: {res_dl['official_sha256']}")
        
        # 2. Normalize to Parquet
        res_norm = normalizer.normalize_date(symbol=symbol, date_str=d)
        print(f"      [2/3] Normalized {res_norm['total_trades']:,} trades to Parquet.")
        
        # 3. Quality Audit
        res_audit = auditor.audit_date(symbol=symbol, date_str=d)
        print(f"      [3/3] Audit Status: {res_audit['status']} (Duplicates: {res_audit['checks']['duplicate_trade_ids']}, Reversals: {res_audit['checks']['chronological_reversals']})")

    print("\n[+] All datasets acquired, verified, and normalized successfully!")

if __name__ == "__main__":
    main()
