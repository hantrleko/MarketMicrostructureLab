"""
High-Precision Local L2 Order Book Rebuilder adhering strictly to Binance WebSocket specification.
Manages snapshot synchronization, diff-depth buffer alignment, gap detection,
and computes real-time microprice, spread, and depth imbalance.
"""

from typing import Dict, Any, List, Optional, Tuple, Literal
import time
from pydantic import BaseModel


class OrderBookLevel(BaseModel):
    price: float
    quantity: float


class OrderBookMetrics(BaseModel):
    is_valid: bool
    status: str
    last_update_id: int
    event_time_utc: str
    best_bid: float
    best_ask: float
    mid_price: float
    microprice: float
    spread: float
    spread_bps: float
    bid_depth_top5: float
    ask_depth_top5: float
    book_imbalance: float


class LocalOrderBook:
    def __init__(self, symbol: str = "BTCUSDT"):
        self.symbol = symbol
        self.bids: Dict[float, float] = {}  # price -> quantity
        self.asks: Dict[float, float] = {}  # price -> quantity
        self.last_update_id: int = 0
        self.prev_u: int = 0
        self.status: Literal["IDLE", "BUFFERING", "SYNCHRONIZED", "OUT_OF_SYNC"] = "IDLE"
        self.buffer: List[Dict[str, Any]] = []
        self.sync_errors_count: int = 0
        self.last_sync_timestamp: float = 0.0

    def start_buffering(self):
        self.status = "BUFFERING"
        self.buffer.clear()
        self.bids.clear()
        self.asks.clear()

    def buffer_event(self, event: Dict[str, Any]):
        """Buffers raw depth update during snapshot fetch"""
        if self.status == "BUFFERING":
            self.buffer.append(event)
        elif self.status == "SYNCHRONIZED":
            self.process_diff_event(event)

    def apply_snapshot(self, snapshot: Dict[str, Any]) -> bool:
        """
        Applies REST snapshot:
        snapshot contains: 'lastUpdateId', 'bids' [[p, q], ...], 'asks' [[p, q], ...]
        """
        self.last_update_id = int(snapshot["lastUpdateId"])
        self.bids.clear()
        self.asks.clear()

        for p_str, q_str in snapshot["bids"]:
            p = float(p_str)
            q = float(q_str)
            if q > 0:
                self.bids[p] = q

        for p_str, q_str in snapshot["asks"]:
            p = float(p_str)
            q = float(q_str)
            if q > 0:
                self.asks[p] = q

        print(f"[*] Snapshot applied with lastUpdateId: {self.last_update_id}. Processing {len(self.buffer)} buffered events...")

        # Process buffered updates
        # Binance rule:
        # Drop any event where u <= lastUpdateId.
        # First processed event should satisfy: U <= lastUpdateId + 1 AND u >= lastUpdateId + 1.
        first_event_found = False
        for ev in self.buffer:
            U = int(ev.get("U", 0))
            u = int(ev.get("u", 0))

            if u <= self.last_update_id:
                continue

            if not first_event_found:
                if U <= self.last_update_id + 1 and u >= self.last_update_id + 1:
                    first_event_found = True
                    self._apply_level_updates(ev.get("b", []), ev.get("a", []))
                    self.prev_u = u
                else:
                    print(f"[!] Sequence misalignment in buffered updates: U={U}, u={u}, lastUpdateId={self.last_update_id}")
                    self.status = "OUT_OF_SYNC"
                    return False
            else:
                # Subsequent event: U must be prev_u + 1
                if U != self.prev_u + 1:
                    print(f"[!] Gap detected in buffered sequence: U={U}, expected {self.prev_u + 1}")
                    self.status = "OUT_OF_SYNC"
                    return False
                self._apply_level_updates(ev.get("b", []), ev.get("a", []))
                self.prev_u = u

        self.buffer.clear()
        self.status = "SYNCHRONIZED"
        self.last_sync_timestamp = time.time()
        print(f"[+] Local Order Book is now SYNCHRONIZED! Best Bid: {self.get_best_bid()}, Best Ask: {self.get_best_ask()}")
        return True

    def process_diff_event(self, ev: Dict[str, Any]) -> bool:
        """
        Processes live diff depth stream event:
        U = first update ID in event
        u = final update ID in event
        b = list of [price, qty] for bids
        a = list of [price, qty] for asks
        """
        if self.status != "SYNCHRONIZED":
            return False

        U = int(ev.get("U", 0))
        u = int(ev.get("u", 0))

        if U != self.prev_u + 1:
            print(f"[!] Sequence broken! Received U={U}, expected prev_u + 1 = {self.prev_u + 1}. Marking OUT_OF_SYNC.")
            self.status = "OUT_OF_SYNC"
            self.sync_errors_count += 1
            return False

        self._apply_level_updates(ev.get("b", []), ev.get("a", []))
        self.prev_u = u
        return True

    def _apply_level_updates(self, bids_delta: list, asks_delta: list):
        # Update bids
        for p_val, q_val in bids_delta:
            p = float(p_val)
            q = float(q_val)
            if q == 0.0:
                self.bids.pop(p, None)
            else:
                self.bids[p] = q

        # Update asks
        for p_val, q_val in asks_delta:
            p = float(p_val)
            q = float(q_val)
            if q == 0.0:
                self.asks.pop(p, None)
            else:
                self.asks[p] = q

    def get_best_bid(self) -> Optional[Tuple[float, float]]:
        if not self.bids:
            return None
        max_p = max(self.bids.keys())
        return max_p, self.bids[max_p]

    def get_best_ask(self) -> Optional[Tuple[float, float]]:
        if not self.asks:
            return None
        min_p = min(self.asks.keys())
        return min_p, self.asks[min_p]

    def compute_metrics(self) -> OrderBookMetrics:
        best_b = self.get_best_bid()
        best_a = self.get_best_ask()

        if self.status != "SYNCHRONIZED" or not best_b or not best_a:
            return OrderBookMetrics(
                is_valid=False,
                status=self.status,
                last_update_id=self.prev_u or self.last_update_id,
                event_time_utc="",
                best_bid=0.0,
                best_ask=0.0,
                mid_price=0.0,
                microprice=0.0,
                spread=0.0,
                spread_bps=0.0,
                bid_depth_top5=0.0,
                ask_depth_top5=0.0,
                book_imbalance=0.0,
            )

        bb_p, bb_q = best_b
        ba_p, ba_q = best_a

        mid = (bb_p + ba_p) / 2.0
        spread = ba_p - bb_p
        spread_bps = (spread / mid) * 10_000.0 if mid > 0 else 0.0

        # Microprice: (Ask_p * Bid_qty + Bid_p * Ask_qty) / (Bid_qty + Ask_qty)
        tot_q = bb_q + ba_q
        microprice = (ba_p * bb_q + bb_p * ba_q) / tot_q if tot_q > 0 else mid

        # Top 5 levels depth
        sorted_bids = sorted(self.bids.items(), key=lambda x: x[0], reverse=True)[:5]
        sorted_asks = sorted(self.asks.items(), key=lambda x: x[0])[:5]

        bid_depth_5 = sum(q for _, q in sorted_bids)
        ask_depth_5 = sum(q for _, q in sorted_asks)

        # Imbalance = (B - A) / (B + A)
        depth_sum = bid_depth_5 + ask_depth_5
        imbalance = (bid_depth_5 - ask_depth_5) / depth_sum if depth_sum > 0 else 0.0

        return OrderBookMetrics(
            is_valid=True,
            status=self.status,
            last_update_id=self.prev_u,
            event_time_utc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            best_bid=bb_p,
            best_ask=ba_p,
            mid_price=mid,
            microprice=microprice,
            spread=spread,
            spread_bps=spread_bps,
            bid_depth_top5=bid_depth_5,
            ask_depth_top5=ask_depth_5,
            book_imbalance=imbalance,
        )
