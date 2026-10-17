"""
Test script to verify Hawkes estimation and live L2 order book synchronization.
"""

import urllib.request
import json
import time

def main():
    # 1. Test Hawkes
    print("--- Testing Hawkes Estimation ---")
    req = urllib.request.urlopen("http://127.0.0.1:8000/api/v1/analytics/hawkes?date=2026-07-01&sample_size=2000")
    hawkes = json.loads(req.read().decode())
    print("Hawkes parameters:", hawkes["parameters"])
    print("Branching matrix Gamma:", hawkes["branching_ratios"])
    print(f"Spectral radius: {hawkes['branching_ratios']['spectral_radius']:.4f}")
    print("Stable / Sub-critical:", hawkes["branching_ratios"]["is_subcritical_stable"])

    # 2. Test Live Orderbook Start
    print("\n--- Testing Live Orderbook Control Start ---")
    post_data = json.dumps({"action": "start"}).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:8000/api/v1/orderbook/control", data=post_data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    print("Control response:", json.loads(resp.read().decode()))

    # Wait 4s for snapshot & diff updates to synchronize
    print("Waiting 4s for synchronization...")
    time.sleep(4.0)

    # 3. Query Live Ladder
    req = urllib.request.urlopen("http://127.0.0.1:8000/api/v1/orderbook/live")
    ladder = json.loads(req.read().decode())
    print("Ladder status:", ladder["status"])
    print("Is valid:", ladder["is_valid"])
    print("Last update id:", ladder["last_update_id"])
    if ladder["bids"] and ladder["asks"]:
        print("Top Bid:", ladder["bids"][0])
        print("Top Ask:", ladder["asks"][0])
        print("Spread bps:", ladder["metrics"]["spread_bps"])
        print("Microprice:", ladder["metrics"]["microprice"])
        print("Book Imbalance:", ladder["metrics"]["book_imbalance"])
        print("Rolling History length:", len(ladder["history"]))

    # 4. Stop collector
    post_data = json.dumps({"action": "stop"}).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:8000/api/v1/orderbook/control", data=post_data, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req)
    print("Live collector stopped.")

if __name__ == "__main__":
    main()
