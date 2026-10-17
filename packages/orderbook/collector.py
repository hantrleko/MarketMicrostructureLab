"""
Production-grade Live L2 Order Book Synchronizer and WebSocket Collector.
Adheres strictly to Binance Diff Depth documentation:
1. Buffers depth updates from WebSocket.
2. Fetches REST snapshot.
3. Aligns updates by sequence IDs (U <= lastUpdateId + 1 <= u).
4. Maintains full local book and computes real-time OFI, microprice, and depth imbalance.
5. In case of sequence gap, invalidates and resynchronizes.
"""

import asyncio
import json
import ssl
import time
import urllib.request
from typing import Dict, Any, List, Optional
import threading

from .book_builder import LocalOrderBook, OrderBookMetrics


class LiveOrderBookCollector:
    WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@depth@100ms"
    REST_SNAPSHOT_URL = "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=1000"

    def __init__(self, symbol: str = "BTCUSDT"):
        self.symbol = symbol
        self.book = LocalOrderBook(symbol)
        self.is_running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.lock = threading.Lock()
        
        # Microstructure history buffer (rolling 100 snapshots)
        self.metrics_history: List[Dict[str, Any]] = []
        
        # Previous top-of-book for OFI calculation
        self._prev_best_bid: Optional[tuple] = None
        self._prev_best_ask: Optional[tuple] = None
        self.cumulative_ofi: float = 0.0

    def start_background(self):
        """Starts the collector in a dedicated daemon thread"""
        if self.is_running:
            return
        self.is_running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("[+] LiveOrderBookCollector background thread started.")

    def stop(self):
        self.is_running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=3.0)
        print("[*] LiveOrderBookCollector stopped.")

    def _fetch_snapshot(self) -> Dict[str, Any]:
        req = urllib.request.Request(self.REST_SNAPSHOT_URL, headers={"User-Agent": "MML-L2/1.0"})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            if resp.status != 200:
                raise RuntimeError(f"Failed to fetch snapshot: HTTP {resp.status}")
            return json.loads(resp.read().decode("utf-8"))

    def _calculate_ofi(self, best_bid: tuple, best_ask: tuple) -> float:
        """
        Calculates quote-based Order Flow Imbalance (OFI):
        Cont et al. (2014) formulation:
        delta_W = I_{b_t >= b_{t-1}} q_b,t - I_{b_t <= b_{t-1}} q_b,t-1 - I_{a_t <= a_{t-1}} q_a,t + I_{a_t >= a_{t-1}} q_a,t-1
        """
        if not self._prev_best_bid or not self._prev_best_ask:
            self._prev_best_bid = best_bid
            self._prev_best_ask = best_ask
            return 0.0

        p_b, q_b = best_bid
        p_b_prev, q_b_prev = self._prev_best_bid

        p_a, q_a = best_ask
        p_a_prev, q_a_prev = self._prev_best_ask

        # Bid component
        if p_b > p_b_prev:
            delta_bid = q_b
        elif p_b == p_b_prev:
            delta_bid = q_b - q_b_prev
        else:
            delta_bid = -q_b_prev

        # Ask component
        if p_a < p_a_prev:
            delta_ask = q_a
        elif p_a == p_a_prev:
            delta_ask = q_a - q_a_prev
        else:
            delta_ask = -q_a_prev

        ofi = delta_bid - delta_ask
        self._prev_best_bid = best_bid
        self._prev_best_ask = best_ask
        return ofi

    def _run_loop(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._websocket_worker())
        finally:
            loop.close()

    async def _websocket_worker(self):
        import websockets
        ctx = ssl.create_default_context()

        while not self._stop_event.is_set():
            try:
                print(f"[*] Connecting to {self.WS_URL}...")
                async with websockets.connect(self.WS_URL, ssl=ctx) as ws:
                    with self.lock:
                        self.book.start_buffering()

                    # 1. Start concurrent buffer reader task
                    print("[*] Starting concurrent WebSocket buffer reader...")
                    buffering = True

                    async def buffer_reader():
                        while buffering and not self._stop_event.is_set():
                            try:
                                raw_msg = await ws.recv()
                                with self.lock:
                                    self.book.buffer_event(json.loads(raw_msg))
                            except asyncio.CancelledError:
                                break
                            except Exception as ex:
                                print(f"[!] Buffer reader error: {ex}")
                                break

                    reader_task = asyncio.create_task(buffer_reader())
                    
                    # Accumulate initial events
                    await asyncio.sleep(0.5)

                    # Fetch REST snapshot concurrently in separate thread
                    print("[*] Fetching REST snapshot while stream is buffered...")
                    snapshot = await asyncio.to_thread(self._fetch_snapshot)

                    # Accumulate events post-snapshot
                    await asyncio.sleep(0.5)

                    # Stop buffer reader
                    buffering = False
                    reader_task.cancel()
                    try:
                        await reader_task
                    except asyncio.CancelledError:
                        pass

                    # Apply snapshot against buffer
                    with self.lock:
                        synced = self.book.apply_snapshot(snapshot)

                    if not synced:
                        print("[!] Initial sync failed. Retrying in 1s...")
                        await asyncio.sleep(1.0)
                        continue

                    # 2. Continuous stream processing
                    while not self._stop_event.is_set():
                        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                        data = json.loads(msg)

                        with self.lock:
                            ok = self.book.process_diff_event(data)
                            if not ok:
                                print("[!] Sequence broken. Restarting synchronization...")
                                break

                            # Calculate metrics and OFI
                            bb = self.book.get_best_bid()
                            ba = self.book.get_best_ask()
                            if bb and ba:
                                ofi = self._calculate_ofi(bb, ba)
                                self.cumulative_ofi += ofi

                                metrics = self.book.compute_metrics()
                                metric_entry = {
                                    "timestamp": time.time(),
                                    "time_str": time.strftime("%H:%M:%S", time.gmtime()),
                                    "best_bid": metrics.best_bid,
                                    "best_ask": metrics.best_ask,
                                    "mid_price": metrics.mid_price,
                                    "microprice": metrics.microprice,
                                    "spread": metrics.spread,
                                    "spread_bps": metrics.spread_bps,
                                    "imbalance": metrics.book_imbalance,
                                    "ofi": ofi,
                                    "cumulative_ofi": self.cumulative_ofi,
                                    "last_update_id": metrics.last_update_id
                                }
                                self.metrics_history.append(metric_entry)
                                if len(self.metrics_history) > 100:
                                    self.metrics_history.pop(0)

            except Exception as e:
                print(f"[!] WebSocket loop error: {e}. Reconnecting in 2s...")
                await asyncio.sleep(2.0)

    def get_ladder(self, depth: int = 15) -> Dict[str, Any]:
        """Returns thread-safe snapshot of top bids and asks"""
        with self.lock:
            metrics = self.book.compute_metrics()
            sorted_bids = sorted(self.book.bids.items(), key=lambda x: x[0], reverse=True)[:depth]
            sorted_asks = sorted(self.book.asks.items(), key=lambda x: x[0])[:depth]

            bids_ladder = [{"price": p, "qty": q, "total": p * q} for p, q in sorted_bids]
            asks_ladder = [{"price": p, "qty": q, "total": p * q} for p, q in sorted_asks]

            return {
                "symbol": self.symbol,
                "status": self.book.status,
                "is_valid": metrics.is_valid,
                "last_update_id": metrics.last_update_id,
                "sync_errors": self.book.sync_errors_count,
                "metrics": metrics.model_dump(),
                "bids": bids_ladder,
                "asks": asks_ladder,
                "history": list(self.metrics_history[-40:])
            }
