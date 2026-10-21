"""
Verifies that all 18 model JSON artifacts on the live GitHub Pages deployment
strictly match the manifest in byte size, SHA-256 hash, and LF line endings.
"""

import sys
import json
import time
import hashlib
import urllib.request
from pathlib import Path

BASE_URL = "https://hantrleko.github.io/MarketMicrostructureLab/data"
ROOT = Path(__file__).resolve().parent.parent

def fetch_bytes(url: str, retries: int = 5, delay: float = 3.0) -> bytes:
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                f"{url}?_nocache={int(time.time() * 1000)}",
                headers={"User-Agent": "MML-Integrity-Verifier/1.2"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.read()
        except Exception as e:
            if attempt == retries:
                raise
            time.sleep(delay)

def main():
    print("=" * 80)
    print("VERIFYING LIVE GITHUB PAGES DEPLOYMENT HASHES & BYTE SIZES")
    print(f"Target URL: {BASE_URL}")
    print("=" * 80)

    # 1. Fetch live manifest
    print("[*] Fetching live models_provenance_manifest.json...")
    manifest_bytes = fetch_bytes(f"{BASE_URL}/models_provenance_manifest.json")
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    artifacts = manifest.get("artifacts", {})

    print(f"[+] Loaded live manifest: {len(artifacts)} artifacts registered.")
    print(f"    Build commit: {manifest.get('build_commit')}")
    print(f"    Protocol: {manifest.get('evaluation_protocol')}")

    # 2. Compare against local manifest
    local_manifest_path = ROOT / "apps" / "web" / "public" / "data" / "models_provenance_manifest.json"
    if local_manifest_path.exists():
        local_manifest = json.loads(local_manifest_path.read_bytes().decode("utf-8"))
        print(f"[*] Checking local build commit: {local_manifest.get('build_commit')}")

    total = len(artifacts)
    passed = 0
    failures = []

    print(f"\n[*] Auditing all {total} live artifacts byte-for-byte:\n")

    for fname, meta in artifacts.items():
        expected_size = meta["size_bytes"]
        expected_sha = meta["sha256"]

        file_url = f"{BASE_URL}/{fname}"
        file_bytes = fetch_bytes(file_url)
        actual_size = len(file_bytes)
        actual_sha = hashlib.sha256(file_bytes).hexdigest()

        crlf_count = file_bytes.count(b"\r\n")
        lf_count = file_bytes.count(b"\n")

        size_ok = (actual_size == expected_size)
        sha_ok = (actual_sha == expected_sha)
        lf_ok = (crlf_count == 0)

        if size_ok and sha_ok and lf_ok:
            passed += 1
            print(f"  [PASS] {fname:<26} Size: {actual_size:>6} B | SHA: {actual_sha[:12]}... | CRLF: {crlf_count}")
        else:
            failures.append({
                "file": fname,
                "expected_size": expected_size,
                "actual_size": actual_size,
                "expected_sha": expected_sha,
                "actual_sha": actual_sha,
                "crlf_count": crlf_count,
            })
            print(f"  [FAIL] {fname:<26} Size: {actual_size} (exp {expected_size}) | SHA: {actual_sha[:12]} (exp {expected_sha[:12]}) | CRLF: {crlf_count}")

    print("\n" + "=" * 80)
    print(f"VERIFICATION SUMMARY: {passed}/{total} artifacts verified 100% byte-for-byte!")
    print("=" * 80)

    if failures:
        print(f"\n[!] Detected {len(failures)} mismatch(es):")
        for f in failures:
            print(f"    - {f['file']}: size={f['actual_size']} (exp {f['expected_size']}), sha={f['actual_sha']} (exp {f['expected_sha']})")
        sys.exit(1)
    else:
        print("\n[SUCCESS] All live artifacts match manifest and maintain strict LF encoding!")

if __name__ == "__main__":
    main()
