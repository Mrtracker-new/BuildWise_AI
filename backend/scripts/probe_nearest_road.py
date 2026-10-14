#!/usr/bin/env python
"""
probe_nearest_road.py — live Overpass lookup probe (manual diagnostic tool).
=============================================================================
Runs the REAL road_service lookup against the live Overpass API for a set of
coordinates and prints success rate + latency per budget configuration. Not a
gate: it depends on the public instance's health, so it is run by hand when the
frontage suggestion looks wrong or Overpass is suspected of misbehaving.

Usage (from backend/):
    python scripts/probe_nearest_road.py
    python scripts/probe_nearest_road.py --points 8 --verbose
"""

import argparse
import asyncio
import logging
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.services.road_service as rs  # noqa: E402

# Bengaluru grid, ~50-80 m apart so the 1e-4 deg proxy cache never collapses
# two sample points into one answer.
POINTS = [
    (12.9716, 77.5946),
    (12.9722, 77.5952),
    (12.9708, 77.5938),
    (12.9731, 77.5961),
    (12.9699, 77.5925),
    (12.9745, 77.5972),
    (12.9686, 77.5911),
    (12.9758, 77.5985),
]

# (label, QL timeout, attempt read timeout, max attempts, total budget)
CONFIGS = [
    ("old budget (QL 4s, read 3.5s, 1 attempt)", 4.0, 3.5, 1, 5.0),
    ("current budget", rs._QL_TIMEOUT_S, rs._ATTEMPT_READ_TIMEOUT_S, rs._MAX_ATTEMPTS, rs._TOTAL_BUDGET_S),
]


async def run_config(label, ql, read, attempts, budget, points):
    rs._QL_TIMEOUT_S = ql
    rs._ATTEMPT_READ_TIMEOUT_S = read
    rs._MAX_ATTEMPTS = attempts
    rs._TOTAL_BUDGET_S = budget
    rs._MIN_RETRY_BUDGET_S = ql + 1.5

    hits, latencies = 0, []
    print(f"\n=== {label} ===")
    for lat, lon in points:
        rs.hazard_cache.clear()
        rs._overpass_last_call = 0.0
        rs._upstream_down_until = 0.0   # one sample per point: no breaker carry-over
        t = time.perf_counter()
        res, _hit, _warn = await rs.fetch_nearest_road(lat, lon)
        dt = time.perf_counter() - t
        latencies.append(dt)
        hits += 0 if res["is_fallback"] else 1
        verdict = "OK  " if not res["is_fallback"] else "MISS"
        detail = (
            f"{res['distance_meters']}m {res['highway_class']} "
            f"bear={res['bearing_degrees']}"
            if not res["is_fallback"]
            else "ASSUMED fallback"
        )
        print(f"  {verdict} ({lat:.4f},{lon:.4f}) {dt:5.2f}s  {detail}")
    print(
        f"  -> {hits}/{len(points)} measured, "
        f"median {statistics.median(latencies):.2f}s, max {max(latencies):.2f}s"
    )
    return hits, len(points)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--points", type=int, default=6)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.ERROR,
        format="LOG %(levelname)s %(message)s",
    )
    points = POINTS[: args.points]
    summary = []
    for label, ql, read, attempts, budget in CONFIGS:
        summary.append(await run_config(label, ql, read, attempts, budget, points))

    print("\n=== summary (live Overpass, same points both runs) ===")
    for (label, *_rest), (hits, total) in zip(CONFIGS, summary):
        print(f"  {hits}/{total}  {label}")


if __name__ == "__main__":
    asyncio.run(main())
