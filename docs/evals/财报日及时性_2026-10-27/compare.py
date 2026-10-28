#!/Users/apple/ts/src/Stock-Research/backend/.venv/bin/python
"""V2：已入库三季报原文抽取 vs 公开数据源（新浪、东财）。"""
from __future__ import annotations

import csv
import json
from collections import Counter
from decimal import Decimal

from lib import (
    BACKEND_HTTP, EVAL_DIR, LOCAL, PERIOD, V2_REQUIRED, WATCH_NAMES, backend_get,
    compare_values, decimal_or_none, ensure_backend_path, fetch_em_zyzb,
    fetch_sina_cash, fetch_sina_period, list_q3_document, load_or_build_sample,
    now_iso, save_json, watch_symbols,
)

METRICS = [
    ("revenue", "营收", "BIZINCO", "TOTALOPERATEREVE"),
    ("net_profit_attributable", "归母净利润", "PARENETP", "PARENTNETPROFIT"),
    ("net_profit_ex_nonrecurring", "扣非归母净利润", None, "KCFJCXSYJLR"),
    ("cost", "营业成本", "BIZCOST", None),
    ("operating_cash_flow", "经营现金流", "MANANETR", None),
]
EXTRA_CANDIDATES = [
    "000001.SZ", "000063.SZ", "000725.SZ", "002415.SZ", "600519.SH", "601318.SH",
    "601012.SH", "000338.SZ", "002594.SZ", "601888.SH",
]


def load_report(symbol: str, doc: dict):
    ensure_backend_path()
    from app.services.company_packet_extract import Report, extract_report, select_reading
    document_id = doc["document_id"]
    revision = (doc.get("active_revision") or {}).get("parse_revision_id")
    meta = backend_get(f"/api/v1/documents/{document_id}")
    params = {"parse_revision_id": revision} if revision else None
    index = backend_get(f"/api/v1/documents/{document_id}/evidence-index", params)
    import urllib.parse
    import urllib.request
    url = f"{BACKEND_HTTP}/api/v1/documents/{document_id}/parsed"
    if revision:
        url += "?" + urllib.parse.urlencode({"parse_revision_id": revision})
    with urllib.request.urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    report = Report(meta, index, text)
    readings = extract_report(report)
    picked = {}
    conflicts = {}
    for metric, _label, _sina, _em in METRICS:
        value = select_reading(readings, metric, PERIOD)
        if value is None:
            hits = [r for r in readings if r["metric"] == metric and r["period"] == PERIOD and r.get("report_period") == PERIOD]
            if len({(r["value"], r["unit"]) for r in hits}) > 1:
                conflicts[metric] = [{"value": r["value"], "unit": r["unit"], "page": r.get("page"), "row": r.get("row")} for r in hits[:4]]
        picked[metric] = value
    return {
        "document_id": document_id,
        "title": meta.get("title") or doc.get("title"),
        "parse_revision_id": revision,
        "report_period": report.period,
        "n_readings": len(readings),
        "picked": picked,
        "conflicts": conflicts,
    }


def source_metric(sina: dict, cash: dict, eastmoney: dict, sina_key: str | None, em_key: str | None) -> dict:
    sina_fields = dict(sina.get("fields") or {})
    sina_fields.update(cash.get("fields") or {})
    em_fields = eastmoney.get("fields") or {}
    sina_val = decimal_or_none(sina_fields.get(sina_key)) if sina_key else None
    em_val = decimal_or_none(em_fields.get(em_key)) if em_key else None
    return {"sina": sina_val, "eastmoney": em_val}


def main() -> int:
    LOCAL.mkdir(parents=True, exist_ok=True)
    sample = load_or_build_sample()
    symbols = list(dict.fromkeys([*V2_REQUIRED, *watch_symbols(), *[row["symbol"] for row in sample["items"]], *EXTRA_CANDIDATES]))
    found = []
    missing_required = []
    for symbol in symbols:
        doc = list_q3_document(symbol)
        if doc:
            found.append((symbol, doc))
        elif symbol in V2_REQUIRED:
            missing_required.append(symbol)
    if len(found) > 12:
        preferred = set(V2_REQUIRED) | set(watch_symbols())
        found = [row for row in found if row[0] in preferred] + [row for row in found if row[0] not in preferred]
        found = found[:12]
    rows = []
    raw = []
    for symbol, doc in found:
        name = WATCH_NAMES.get(symbol) or next((item["name"] for item in sample["items"] if item["symbol"] == symbol), symbol)
        try:
            extracted = load_report(symbol, doc)
            extract_error = None
        except Exception as exc:
            extracted = {"picked": {}, "conflicts": {}, "document_id": doc.get("document_id"), "title": doc.get("title")}
            extract_error = type(exc).__name__ + ":" + str(exc)[:180]
        sina = fetch_sina_period(symbol)
        cash = fetch_sina_cash(symbol)
        eastmoney = fetch_em_zyzb(symbol)
        report_vals = {}
        for metric, _label, _sk, _ek in METRICS:
            reading = (extracted.get("picked") or {}).get(metric)
            report_vals[metric] = decimal_or_none(reading["value"]) if reading else None
        gross_report = None
        if report_vals.get("revenue") is not None and report_vals.get("cost") is not None:
            gross_report = report_vals["revenue"] - report_vals["cost"]
        em_mlr = decimal_or_none((eastmoney.get("fields") or {}).get("MLR"))
        for metric, label, sina_key, em_key in METRICS + [("gross_profit", "毛利(营收-成本)", None, "MLR")]:
            if metric == "gross_profit":
                report_val = gross_report
                sina_val, em_val = None, em_mlr
                reason = None if report_val is not None else "原文未同时取到营收与营业成本，无法算毛利"
            else:
                report_val = report_vals.get(metric)
                sourced = source_metric(sina, cash, eastmoney, sina_key, em_key)
                sina_val, em_val = sourced["sina"], sourced["eastmoney"]
                reason = None
                if report_val is None:
                    if metric in (extracted.get("conflicts") or {}):
                        reason = "原文同格多值"
                    else:
                        reason = "原文抽取缺失"
            vs_sina = compare_values(report_val, sina_val)
            vs_em = compare_values(report_val, em_val)
            vs_sources = compare_values(sina_val, em_val)
            if report_val is None:
                status = "extract_gap"
            elif sina_val is None and em_val is None:
                status = "source_gap"
                reason = reason or "数据源尚无该期该字段"
            elif vs_sina.get("consistent") is False or vs_em.get("consistent") is False:
                status = "mismatch"
                reason = reason or "原文与数据源不一致"
            elif vs_sina.get("consistent") or vs_em.get("consistent"):
                status = "match"
            else:
                status = "source_gap"
            rows.append({
                "symbol": symbol,
                "name": name,
                "metric": metric,
                "label": label,
                "document_id": extracted.get("document_id"),
                "report_period": extracted.get("report_period"),
                "report_value": format(report_val, "f") if report_val is not None else "",
                "sina_value": format(sina_val, "f") if sina_val is not None else "",
                "eastmoney_value": format(em_val, "f") if em_val is not None else "",
                "sina_has_period": sina.get("has_period"),
                "eastmoney_has_period": eastmoney.get("has_period"),
                "match_sina": vs_sina.get("consistent"),
                "match_eastmoney": vs_em.get("consistent"),
                "sources_agree": vs_sources.get("consistent"),
                "status": status,
                "reason": reason or extract_error,
            })
        raw.append({
            "symbol": symbol, "name": name, "doc": {"document_id": doc.get("document_id"), "title": doc.get("title")},
            "extract_error": extract_error, "extracted": {
                "report_period": extracted.get("report_period"),
                "n_readings": extracted.get("n_readings"),
                "conflicts": extracted.get("conflicts"),
                "picked": {
                    metric: ({"value": reading.get("value"), "unit": reading.get("unit"), "page": reading.get("page"), "row": reading.get("row")} if reading else None)
                    for metric, reading in (extracted.get("picked") or {}).items()
                },
            },
            "sina_ok": sina.get("ok"), "eastmoney_ok": eastmoney.get("ok"),
        })
    path = EVAL_DIR / "v2_compare.csv"
    fields = list(rows[0].keys()) if rows else ["symbol", "metric", "status"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    by_metric = {}
    for metric, label, *_ in METRICS + [("gross_profit", "毛利(营收-成本)", None, None)]:
        subset = [row for row in rows if row["metric"] == metric]
        n = len(subset)
        n_extract = sum(1 for row in subset if row["report_value"])
        n_match = sum(1 for row in subset if row["status"] == "match")
        n_mismatch = sum(1 for row in subset if row["status"] == "mismatch")
        by_metric[metric] = {
            "label": label, "n": n, "extracted": n_extract,
            "extract_rate": None if not n else round(n_extract / n, 3),
            "match": n_match, "mismatch": n_mismatch,
            "match_rate_among_extracted": None if not n_extract else round(n_match / n_extract, 3),
        }
    summary = {
        "built_at": now_iso(),
        "n_companies": len(found),
        "symbols": [symbol for symbol, _ in found],
        "missing_required": missing_required,
        "status_counts": dict(Counter(row["status"] for row in rows)),
        "by_metric": by_metric,
    }
    save_json(EVAL_DIR / "v2_summary.json", summary)
    save_json(LOCAL / "v2_raw.json", raw)
    print(json.dumps({"n_companies": summary["n_companies"], "symbols": summary["symbols"],
                      "missing_required": missing_required, "status": summary["status_counts"]},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
