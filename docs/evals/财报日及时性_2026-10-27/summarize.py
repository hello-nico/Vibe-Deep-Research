#!/Users/apple/ts/src/Stock-Research/backend/.venv/bin/python
"""V1 汇总：由 rounds.jsonl / state.json 出「挂出到可取」时长分布。"""
from __future__ import annotations

import csv
from collections import Counter
from datetime import datetime

from lib import EVAL_DIR, LOCAL, load_json, now_iso, save_json

BUCKETS = [
    ("same_round_≤30min", 0, 30),
    ("30–60min", 30, 60),
    ("1–3h", 60, 180),
    ("3–12h", 180, 720),
    (">12h", 720, 10**9),
]


def parse_iso(value: str | None):
    if not value:
        return None
    return datetime.fromisoformat(value)


def bucket_of(minutes: float | None) -> str:
    if minutes is None:
        return "unknown"
    if minutes < 0:
        return "source_before_filing"
    for name, lo, hi in BUCKETS:
        if lo <= minutes < hi:
            return name
    return BUCKETS[-1][0]


def lag_minutes(announced: str | None, arrived: str | None) -> float | None:
    start, end = parse_iso(announced), parse_iso(arrived)
    if start is None or end is None:
        return None
    return (end - start).total_seconds() / 60


def main() -> int:
    state = load_json(LOCAL / "state.json") or {"first_seen": {}, "rounds": 0}
    latest = load_json(EVAL_DIR / "round_latest.json") or {}
    first_seen = state.get("first_seen") or {}
    started = parse_iso(state.get("started_at"))
    rows = []
    for item in latest.get("items") or []:
        symbol = item["symbol"]
        seen = first_seen.get(symbol) or item.get("first_seen") or {}
        announced = seen.get("cninfo")
        sina_lag = lag_minutes(announced, seen.get("sina"))
        em_lag = lag_minutes(announced, seen.get("eastmoney"))
        both_round1 = (
            int(state.get("rounds") or 0) >= 1
            and announced
            and started
            and parse_iso(announced)
            and abs((parse_iso(announced) - started).total_seconds()) < 3 * 3600
            and seen.get("sina") == announced
        )
        rows.append({
            "symbol": symbol,
            "name": item.get("name"),
            "board": item.get("board"),
            "in_watch": item.get("in_watch"),
            "appoint": item.get("appoint"),
            "cninfo_posted": item.get("cninfo_posted"),
            "cninfo_earliest": item.get("cninfo_earliest"),
            "cninfo_first_seen": announced,
            "sina": item.get("sina"),
            "sina_first_seen": seen.get("sina"),
            "sina_lag_min": "" if sina_lag is None else round(sina_lag, 1),
            "sina_bucket": bucket_of(sina_lag) if item.get("sina") and announced else ("waiting" if announced else "not_filed"),
            "eastmoney": item.get("eastmoney"),
            "eastmoney_first_seen": seen.get("eastmoney"),
            "eastmoney_lag_min": "" if em_lag is None else round(em_lag, 1),
            "eastmoney_bucket": bucket_of(em_lag) if item.get("eastmoney") and announced else ("waiting" if announced else "not_filed"),
            "left_censored": bool(item.get("cninfo_posted") and (item.get("sina") or item.get("eastmoney")) and both_round1),
        })
        if item.get("cninfo_posted") and (item.get("sina") or item.get("eastmoney")) and announced and started:
            first_round_window = abs((parse_iso(announced) - started).total_seconds()) < 4 * 3600
            rows[-1]["left_censored"] = bool(first_round_window and int(state.get("rounds") or 1) == 1)

    path = EVAL_DIR / "v1_lag.csv"
    fields = list(rows[0].keys()) if rows else [
        "symbol", "name", "board", "cninfo_posted", "sina", "eastmoney", "sina_bucket", "eastmoney_bucket",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    def dist(field: str) -> dict:
        return dict(Counter(row[field] for row in rows))

    table = {
        "built_at": now_iso(),
        "rounds": state.get("rounds"),
        "n": len(rows),
        "n_filed": sum(1 for row in rows if row["cninfo_posted"]),
        "n_sina": sum(1 for row in rows if row["sina"]),
        "n_eastmoney": sum(1 for row in rows if row["eastmoney"]),
        "n_left_censored": sum(1 for row in rows if row.get("left_censored")),
        "sina_buckets": dist("sina_bucket"),
        "eastmoney_buckets": dist("eastmoney_bucket"),
        "note": "时长按本机轮询首次看见的时刻相减；同一轮内同时看见则落入 same_round_≤30min。"
                "首轮开始前双方已到的记 left_censored，不能当作真实时延。",
    }
    save_json(EVAL_DIR / "v1_summary.json", table)
    print(
        f"n={table['n']} filed={table['n_filed']} sina={table['n_sina']} "
        f"eastmoney={table['n_eastmoney']} censored={table['n_left_censored']}"
    )
    print("sina_buckets", table["sina_buckets"])
    print("eastmoney_buckets", table["eastmoney_buckets"])
    print("wrote", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
