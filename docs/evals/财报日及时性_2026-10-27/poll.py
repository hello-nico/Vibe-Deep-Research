#!/Users/apple/ts/src/Stock-Research/backend/.venv/bin/python
"""V1 轮询：公告挂出与公开财务源是否已有 2026Q3。默认每 30 分钟一轮，--once 只跑一轮。"""
from __future__ import annotations

import argparse
import time
import traceback
from collections import Counter
from datetime import datetime

from lib import (
    EVAL_DIR, LOCAL, PERIOD, SHANGHAI, StopPolling, append_jsonl, fetch_cninfo_q3,
    fetch_em_zyzb, fetch_sina_period, load_json, load_or_build_sample, now,
    now_iso, save_json,
)

STATE_PATH = LOCAL / "state.json"
ROUNDS_PATH = LOCAL / "rounds.jsonl"
LATEST_PATH = EVAL_DIR / "round_latest.json"


def load_state() -> dict:
    state = load_json(STATE_PATH, default=None) or {
        "first_seen": {}, "rounds": 0, "started_at": now_iso(),
    }
    state.setdefault("first_seen", {})
    return state


def mark(state: dict, symbol: str, key: str, present: bool, round_iso: str) -> str | None:
    slot = state["first_seen"].setdefault(symbol, {})
    if present and key not in slot:
        slot[key] = round_iso
    return slot.get(key)


def probe_one(row: dict) -> dict:
    symbol = row["symbol"]
    cninfo = fetch_cninfo_q3(symbol)
    sina = fetch_sina_period(symbol)
    eastmoney = fetch_em_zyzb(symbol)
    return {
        "symbol": symbol,
        "name": row.get("name"),
        "board": row.get("board"),
        "in_watch": row.get("in_watch"),
        "appoint": row.get("appoint"),
        "calendar_actual": row.get("actual"),
        "cninfo": {
            "ok": cninfo.get("ok"),
            "posted": cninfo.get("posted"),
            "earliest": cninfo.get("earliest"),
            "title": cninfo.get("title"),
            "error": cninfo.get("error"),
        },
        "sina": {
            "ok": sina.get("ok"),
            "has_period": sina.get("has_period"),
            "publish_date": sina.get("publish_date"),
            "error": sina.get("error"),
            "latest_periods": sina.get("periods"),
        },
        "eastmoney": {
            "ok": eastmoney.get("ok"),
            "has_period": eastmoney.get("has_period"),
            "notice_date": eastmoney.get("notice_date"),
            "error": eastmoney.get("error"),
            "latest_dates": eastmoney.get("dates"),
        },
    }


def run_round(sample: dict, state: dict) -> dict:
    LOCAL.mkdir(parents=True, exist_ok=True)
    started = now()
    items = []
    errors = []
    for row in sample["items"]:
        try:
            item = probe_one(row)
        except StopPolling:
            raise
        except Exception as exc:
            item = {
                "symbol": row["symbol"], "name": row.get("name"), "board": row.get("board"),
                "error": type(exc).__name__,
            }
            errors.append({"symbol": row["symbol"], "error": type(exc).__name__})
        stamp = now_iso()
        if "cninfo" in item:
            item["first_seen"] = {
                "cninfo": mark(state, row["symbol"], "cninfo", bool(item["cninfo"].get("posted")), stamp),
                "sina": mark(state, row["symbol"], "sina", bool(item["sina"].get("has_period")), stamp),
                "eastmoney": mark(state, row["symbol"], "eastmoney", bool(item["eastmoney"].get("has_period")), stamp),
            }
        items.append(item)
    finished = now()
    state["rounds"] = int(state.get("rounds") or 0) + 1
    state["updated_at"] = finished.isoformat(timespec="seconds")
    summary = {
        "round": state["rounds"],
        "period": PERIOD,
        "started_at": started.isoformat(timespec="seconds"),
        "finished_at": finished.isoformat(timespec="seconds"),
        "elapsed_s": round((finished - started).total_seconds(), 1),
        "n": len(items),
        "n_cninfo_posted": sum(1 for item in items if item.get("cninfo", {}).get("posted")),
        "n_sina": sum(1 for item in items if item.get("sina", {}).get("has_period")),
        "n_eastmoney": sum(1 for item in items if item.get("eastmoney", {}).get("has_period")),
        "n_errors": len(errors),
        "boards": dict(Counter(item.get("board") or "?" for item in items)),
        "errors": errors,
        "items": items,
    }
    append_jsonl(ROUNDS_PATH, summary)
    save_json(STATE_PATH, state)
    save_json(LATEST_PATH, {k: v for k, v in summary.items() if k != "items"} | {
        "items": [
            {
                "symbol": item.get("symbol"),
                "name": item.get("name"),
                "board": item.get("board"),
                "in_watch": item.get("in_watch"),
                "appoint": item.get("appoint"),
                "cninfo_posted": item.get("cninfo", {}).get("posted"),
                "cninfo_earliest": item.get("cninfo", {}).get("earliest"),
                "sina": item.get("sina", {}).get("has_period"),
                "eastmoney": item.get("eastmoney", {}).get("has_period"),
                "first_seen": item.get("first_seen"),
            }
            for item in items
        ],
    })
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="只跑一轮并退出")
    parser.add_argument("--interval", type=int, default=1800, help="轮询间隔秒，默认 1800")
    parser.add_argument("--until", default="2026-10-31T23:30:00+08:00", help="循环截止（含）")
    parser.add_argument("--rebuild-sample", action="store_true")
    args = parser.parse_args()
    LOCAL.mkdir(parents=True, exist_ok=True)
    sample = build_if_needed(args.rebuild_sample)
    state = load_state()
    until = datetime.fromisoformat(args.until)
    if until.tzinfo is None:
        until = until.replace(tzinfo=SHANGHAI)
    while True:
        try:
            summary = run_round(sample, state)
        except StopPolling as exc:
            save_json(LOCAL / "stopped.json", {"at": now_iso(), "reason": str(exc)})
            print(f"STOP {exc}")
            return 2
        except Exception as exc:
            save_json(LOCAL / "round_error.json", {"at": now_iso(), "error": type(exc).__name__, "trace": traceback.format_exc()})
            print(f"ROUND_ERROR {type(exc).__name__}: {exc}")
            return 1
        print(
            f"round={summary['round']} elapsed_s={summary['elapsed_s']} "
            f"cninfo={summary['n_cninfo_posted']}/{summary['n']} "
            f"sina={summary['n_sina']} eastmoney={summary['n_eastmoney']} errors={summary['n_errors']}"
        )
        if args.once or now() >= until:
            return 0
        sleep_for = max(5, args.interval - summary["elapsed_s"])
        time.sleep(sleep_for)
        if now() >= until:
            return 0


def build_if_needed(rebuild: bool):
    from lib import build_sample, load_or_build_sample
    return build_sample() if rebuild else load_or_build_sample()


if __name__ == "__main__":
    raise SystemExit(main())
