"""
High-Precision Local L2 Order Book Rebuilder adhering strictly to Binance WebSocket specification.
Manages snapshot synchronization, diff-depth buffer alignment, gap detection,
overlapping/expired event filtering, crossed-book validation,
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
        self.gap_history: List[Dict[str, Any]] = []
        self.last_sync_timestamp: float = 0.0

    def reset(self):
        """Resets local state completely prior to resynchronization"""
        self.status = "IDLE"
        self.bids.clear()
        self.asks.clear()
        self.buffer.clear()
        self.last_update_id = 0
        self.prev_u = 0

    def start_buffering(self):
        self.reset()
        self.status = "BUFFERING"

    def buffer_event(self, event: Dict[str, Any]):
        """Buffers raw depth update during snapshot fetch"""
        if self.status == "BUFFERING":
            self.buffer.append(event)
        elif self.status == "SYNCHRONIZED":
            self.process_diff_event(event)

    def apply_snapshot(self, snapshot: Dict[str, Any]) -> bool:
        """
        Applies REST snapshot and validates against buffered diff depth events.
        Binance rule:
        1. Drop any event where u <= lastUpdateId.
        2. First event: U <= lastUpdateId + 1 AND u >= lastUpdateId + 1.
        3. Subsequent events: U <= prev_u + 1 AND u >= prev_u + 1.
        """
        self.last_update_id = int(snapshot["lastUpdateId"])
        self.bids.clear()
        self.asks.clear()

        for p_str, q_str in snapshot.get("bids", []):
            p = float(p_str)
            q = float(q_str)
            if q > 0:
                self.bids[p] = q

        for p_str, q_str in snapshot.get("asks", []):
            p = float(p_str)
            q = float(q_str)
            if q > 0:
                self.asks[p] = q

        if not self.buffer:
            self.prev_u = self.last_update_id
            self.status = "SYNCHRONIZED"
            self.last_sync_timestamp = time.time()
            return True

        first_event_found = False
        for ev in self.buffer:
            U = int(ev.get("U", 0))
            u = int(ev.get("u", 0))

            # Drop old events that occurred strictly before snapshot
            if u <= self.last_update_id:
                continue

            if not first_event_found:
                if U <= self.last_update_id + 1 and u >= self.last_update_id + 1:
                    first_event_found = True
                    self._apply_level_updates(ev.get("b", []), ev.get("a", []))
                    self.prev_u = u
                else:
                    self.status = "OUT_OF_SYNC"
                    self.gap_history.append({
                        "timestamp": time.time(),
                        "type": "BUFFER_ALIGNMENT_FAILURE",
                        "lastUpdateId": self.last_update_id,
                        "U": U,
                        "u": u
                    })
                    return False
            else:
                # Expired/duplicate event in buffer
                if u < self.prev_u + 1:
                    continue
                # Gap in buffer sequence
                if U > self.prev_u + 1:
                    self.status = "OUT_OF_SYNC"
                    self.gap_history.append({
                        "timestamp": time.time(),
                        "type": "BUFFER_GAP",
                        "expected": self.prev_u + 1,
                        "U": U,
                        "u": u
                    })
                    return False
                # Valid update (overlapping or contiguous)
                self._apply_level_updates(ev.get("b", []), ev.get("a", []))
                self.prev_u = u

        if not first_event_found:
            # Buffer had events but none bridged the snapshot
            self.status = "OUT_OF_SYNC"
            return False

        self.buffer.clear()
        self.status = "SYNCHRONIZED"
        self.last_sync_timestamp = time.time()
        return True

    def process_diff_event(self, ev: Dict[str, Any]) -> bool:
        """
        Processes live diff depth stream event:
        Binance rule: Each event's U should be <= prev_u + 1 AND u should be >= prev_u + 1.
        """
        if self.status != "SYNCHRONIZED":
            return False

        U = int(ev.get("U", 0))
        u = int(ev.get("u", 0))

        # 1. Expired event: event ended before our current state
        if u < self.prev_u + 1:
            return True

        # 2. Sequence gap: event starts after expected contiguous index
        if U > self.prev_u + 1:
            self.status = "OUT_OF_SYNC"
            self.sync_errors_count += 1
            self.gap_history.append({
                "timestamp": time.time(),
                "type": "STREAM_GAP",
                "expected": self.prev_u + 1,
                "U": U,
                "u": u,
                "gap_size": U - (self.prev_u + 1)
            })
            return False

        # 3. Valid update (U <= prev_u + 1 and u >= prev_u + 1)
        self._apply_level_updates(ev.get("b", []), ev.get("a", []))
        self.prev_u = u
        return True

    def _apply_level_updates(self, bids_delta: list, asks_delta: list):
        # Update bids (0 qty removes price level)
        for p_val, q_val in bids_delta:
            p = float(p_val)
            q = float(q_val)
            if q == 0.0:
                self.bids.pop(p, None)
            else:
                self.bids[p] = q

        # Update asks (0 qty removes price level)
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

        # Validation: book must be synchronized, non-empty, and uncrossed (best_bid < best_ask)
        is_valid = (
            self.status == "SYNCHRONIZED"
            and best_b is not None
            and best_a is not None
            and best_b[0] < best_a[0]
        )

        if not is_valid or not best_b or not best_a:
            return OrderBookMetrics(
                is_valid=False,
                status=self.status,
                last_update_id=self.prev_u or self.last_update_id,
                event_time_utc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                best_bid=best_b[0] if best_b else 0.0,
                best_ask=best_a[0] if best_a else 0.0,
                mid_price=0.0,
                microprice=0.0,
                spread=0.0,
                spread_bps=0.0,
                bid_depth_top5=0.0,
                ask_depth_top5=0.0,
                book_imbalance=0.0
            )

        bid_p, bid_q = best_b
        ask_p, ask_q = best_a

        spread = ask_p - bid_p
        mid_price = (ask_p + bid_p) / 2.0
        spread_bps = (spread / mid_price) * 10_000.0 if mid_price > 0 else 0.0

        # Microprice (Stoikov, 2018): P_micro = (Q_bid * P_ask + Q_ask * P_bid) / (Q_bid + Q_ask)
        tot_q = bid_q + ask_q
        microprice = ((bid_q * ask_p) + (ask_q * bid_p)) / tot_q if tot_q > 0 else mid_price

        # Top 5 Depth and Imbalance
        sorted_bids = sorted(self.bids.items(), key=lambda x: x[0], reverse=True)[:5]
        sorted_asks = sorted(self.asks.items(), key=lambda x: x[0])[:5]

        bid_depth_5 = sum(q for _, q in sorted_bids)
        ask_depth_5 = sum(q for _, q in sorted_asks)
        tot_depth_5 = bid_depth_5 + ask_depth_5
        book_imbalance = (bid_depth_5 - ask_depth_5) / tot_depth_5 if tot_depth_5 > 0 else 0.0

        return OrderBookMetrics(
            is_valid=True,
            status=self.status,
            last_update_id=self.prev_u,
            event_time_utc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            best_bid=bid_p,
            best_ask=ask_p,
            mid_price=mid_price,
            microprice=microprice,
            spread=spread,
            spread_bps=spread_bps,
            bid_depth_top5=bid_depth_5,
            ask_depth_top5=ask_depth_5,
            book_imbalance=book_imbalance
        )
