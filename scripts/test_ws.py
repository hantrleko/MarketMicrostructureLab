"""
Test live Binance diff depth WebSocket connection.
"""
import asyncio
import json
import ssl
import websockets

async def test_ws():
    uri = "wss://stream.binance.com:9443/ws/btcusdt@depth@100ms"
    print(f"[*] Connecting to WebSocket: {uri}...")
    ctx = ssl.create_default_context()
    async with websockets.connect(uri, ssl=ctx) as ws:
        print("[+] Connected successfully! Awaiting 3 diff-depth packets...")
        for i in range(3):
            msg = await ws.recv()
            data = json.loads(msg)
            U = data.get("U")
            u = data.get("u")
            b_cnt = len(data.get("b", []))
            a_cnt = len(data.get("a", []))
            print(f"    Received Diff Event {i+1}: U={U}, u={u}, bids_updates={b_cnt}, asks_updates={a_cnt}")
    print("[+] WebSocket test complete!")

if __name__ == "__main__":
    asyncio.run(test_ws())
