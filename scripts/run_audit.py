"""
Script to execute data quality audit on all normalized partitions.
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from packages.reporting.quality_audit import DataQualityAuditor

def main():
    auditor = DataQualityAuditor()
    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]
    all_passed = True

    print("=================================================================")
    print("           DATA QUALITY & INTEGRITY AUDIT SUITE                  ")
    print("=================================================================")
    for d in dates:
        print(f"\n>>> Running Audit for BTCUSDT on {d}...")
        try:
            res = auditor.audit_date("BTCUSDT", d)
            status = res["status"]
            print(f"Status: {status}")
            print(f"Total Records: {res['checks']['total_records']:,}")
            print(f"Duplicates: {res['checks']['duplicate_trade_ids']}")
            print(f"Time Reversals: {res['checks']['chronological_reversals']}")
            print(f"Arithmetic Errors: {res['checks']['arithmetic_mismatches']}")
            print(f"Median Duration: {res['chronology_and_gaps']['duration_median_ms']:.2f} ms")
            print(f"Max Duration Gap: {res['chronology_and_gaps']['max_gap_seconds']:.2f} s")
            print(f"Buy/Sell Ratio: {res['volume_and_sides']['buy_ratio']*100:.2f}% / {res['volume_and_sides']['sell_ratio']*100:.2f}%")
            if status != "PASSED":
                all_passed = False
        except Exception as e:
            print(f"Failed to audit {d}: {e}")
            all_passed = False

    print("\n=================================================================")
    if all_passed:
        print("ALL DATASETS PASSED INTEGRITY & QUALITY VERIFICATION!")
    else:
        print("SOME DATASETS FAILED INTEGRITY VERIFICATION!")
    print("=================================================================")

if __name__ == "__main__":
    main()
