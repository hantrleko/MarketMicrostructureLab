"""
Binance Vision official public data downloader and SHA256 verifier.
Strictly adheres to official checksum verification and audit logging.
"""

import os
import hashlib
import datetime
from pathlib import Path
import urllib.request
import ssl
from typing import Dict, Any, Tuple


class BinanceVisionDownloader:
    BASE_URL = "https://data.binance.vision/data/spot/daily/trades"

    def __init__(self, raw_dir: str | Path = "data/raw"):
        self.raw_dir = Path(raw_dir)
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.ssl_context = ssl.create_default_context()

    def get_urls(self, symbol: str, date_str: str) -> Tuple[str, str, str]:
        filename = f"{symbol}-trades-{date_str}.zip"
        zip_url = f"{self.BASE_URL}/{symbol}/{filename}"
        checksum_url = f"{zip_url}.CHECKSUM"
        return filename, zip_url, checksum_url

    def fetch_official_checksum(self, checksum_url: str) -> str:
        req = urllib.request.Request(checksum_url, headers={"User-Agent": "MML-Downloader/1.0"})
        with urllib.request.urlopen(req, timeout=15, context=self.ssl_context) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Failed to fetch checksum from {checksum_url}, HTTP status {resp.status}")
            content = resp.read().decode("utf-8").strip()
            # Content format: "<hash>  <filename>" or "<hash>"
            parts = content.split()
            if not parts:
                raise ValueError(f"Empty checksum response from {checksum_url}")
            return parts[0].strip().lower()

    def compute_sha256(self, file_path: Path) -> str:
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(1024 * 1024):  # 1MB chunks
                hasher.update(chunk)
        return hasher.hexdigest().lower()

    def download_and_verify(
        self,
        symbol: str = "BTCUSDT",
        date_str: str = "2026-07-01",
        force_redownload: bool = False
    ) -> Dict[str, Any]:
        filename, zip_url, checksum_url = self.get_urls(symbol, date_str)
        local_zip = self.raw_dir / filename
        local_checksum = self.raw_dir / f"{filename}.CHECKSUM"

        print(f"[*] Querying official checksum from: {checksum_url}")
        official_sha256 = self.fetch_official_checksum(checksum_url)
        with open(local_checksum, "w", encoding="utf-8") as f:
            f.write(f"{official_sha256}  {filename}\n")

        # Check existing file
        if local_zip.exists() and not force_redownload:
            print(f"[*] Checking existing local file: {local_zip}")
            local_sha256 = self.compute_sha256(local_zip)
            if local_sha256 == official_sha256:
                print(f"[+] Local file matches official SHA256: {local_sha256}")
                return {
                    "symbol": symbol,
                    "date": date_str,
                    "filename": filename,
                    "zip_path": str(local_zip),
                    "checksum_path": str(local_checksum),
                    "raw_url": zip_url,
                    "raw_checksum_url": checksum_url,
                    "official_sha256": official_sha256,
                    "local_sha256": local_sha256,
                    "checksum_verified": True,
                    "file_bytes": local_zip.stat().st_size,
                    "download_timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "cached": True,
                }
            else:
                print(f"[!] Checksum mismatch on cached file. Removing corrupt file.")
                local_zip.unlink(missing_ok=True)

        print(f"[*] Downloading {zip_url} -> {local_zip}")
        req = urllib.request.Request(zip_url, headers={"User-Agent": "MML-Downloader/1.0"})
        download_start_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        with urllib.request.urlopen(req, timeout=60, context=self.ssl_context) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status} while downloading {zip_url}")
            total_bytes = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            with open(local_zip, "wb") as f_out:
                while chunk := resp.read(1024 * 512):  # 512KB chunk
                    f_out.write(chunk)
                    downloaded += len(chunk)
                    if total_bytes > 0 and downloaded % (1024 * 1024 * 5) < len(chunk):
                        pct = (downloaded / total_bytes) * 100
                        print(f"    Downloaded {downloaded / 1024 / 1024:.1f} MB / {total_bytes / 1024 / 1024:.1f} MB ({pct:.1f}%)")

        print(f"[*] Computing SHA256 of downloaded archive...")
        local_sha256 = self.compute_sha256(local_zip)
        if local_sha256 != official_sha256:
            local_zip.unlink(missing_ok=True)
            raise ValueError(
                f"FATAL: Download verification failed! Expected SHA256 {official_sha256}, got {local_sha256}"
            )

        print(f"[+] Download & verification SUCCESSFUL: {local_sha256}")
        return {
            "symbol": symbol,
            "date": date_str,
            "filename": filename,
            "zip_path": str(local_zip),
            "checksum_path": str(local_checksum),
            "raw_url": zip_url,
            "raw_checksum_url": checksum_url,
            "official_sha256": official_sha256,
            "local_sha256": local_sha256,
            "checksum_verified": True,
            "file_bytes": local_zip.stat().st_size,
            "download_timestamp_utc": download_start_utc,
            "cached": False,
        }
