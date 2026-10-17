"""
Exports real computed research datasets to static JSON fixtures in apps/web/public/data/
Allows standalone deployment on GitHub Pages without requiring a public Python backend server.
"""

import sys
import json
import urllib.request
from pathlib import Path

# Project root
ROOT = Path(__file__).parent.parent
STATIC_DATA_DIR = ROOT / "apps" / "web" / "public" / "data"
STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

API_BASE = "http://127.0.0.1:8000/api/v1"

def fetch_and_save(endpoint: str, filename: str):
    url = f"{API_BASE}/{endpoint}"
    print(f"[*] Fetching {url} -> {filename}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MML-Exporter/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            out_path = STATIC_DATA_DIR / filename
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print(f"    Saved {out_path.stat().st_size:,} bytes")
    except Exception as e:
        print(f"[!] Error fetching {endpoint}: {e}")

def main():
    print("=== EXPORTING REAL RESEARCH DATA FIXTURES FOR GITHUB PAGES ===")
    
    # 1. Datasets catalog
    fetch_and_save("metadata/datasets", "datasets.json")

    dates = ["2026-07-01", "2026-07-02", "2026-07-03"]
    for d in dates:
        # Audit
        fetch_and_save(f"integrity/audit?symbol=BTCUSDT&date={d}", f"audit_{d}.json")
        # Buckets 1m
        fetch_and_save(f"flow/buckets?symbol=BTCUSDT&date={d}&interval=1m", f"buckets_1m_{d}.json")
        # Buckets 5m
        fetch_and_save(f"flow/buckets?symbol=BTCUSDT&date={d}&interval=5m", f"buckets_5m_{d}.json")
        # Buckets 1h
        fetch_and_save(f"flow/buckets?symbol=BTCUSDT&date={d}&interval=1h", f"buckets_1h_{d}.json")
        # Autocorrelation
        fetch_and_save(f"flow/autocorrelation?symbol=BTCUSDT&date={d}&max_lag=40", f"autocorr_{d}.json")
        # Distributions
        fetch_and_save(f"flow/distributions?symbol=BTCUSDT&date={d}", f"distributions_{d}.json")
        # Price response
        fetch_and_save(f"impact/response?symbol=BTCUSDT&date={d}", f"response_{d}.json")
        # Impact models (k=20)
        fetch_and_save(f"impact/models?symbol=BTCUSDT&date={d}&horizon=20", f"models_{d}.json")
        # Hawkes estimation
        fetch_and_save(f"analytics/hawkes?symbol=BTCUSDT&date={d}&sample_size=3000&beta=10.0", f"hawkes_{d}.json")
        # Replay window
        fetch_and_save(f"replay/window?symbol=BTCUSDT&date={d}&start_second=0&duration_seconds=60&limit=1500", f"replay_window_{d}.json")

    # Orderbook status
    fetch_and_save("orderbook/status", "orderbook_status.json")

    print("\n[+] All static research fixtures exported successfully!")

if __name__ == "__main__":
    main()
