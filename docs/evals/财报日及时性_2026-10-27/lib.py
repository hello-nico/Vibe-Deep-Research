"""Shared helpers for 财报日及时性 eval. Public sources only; no Hithink, no .env."""
from __future__ import annotations

import json
import re
import sqlite3
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

EVAL_DIR = Path(__file__).resolve().parent
REPO = EVAL_DIR.parents[2]
LOCAL = REPO / ".local" / "财报日及时性_2026-10-27"
BACKEND = Path("/Users/apple/ts/src/Stock-Research/backend")
SQLITE = REPO / ".local" / "client" / "choices.sqlite"
BACKEND_HTTP = "http://127.0.0.1:8700"
SHANGHAI = ZoneInfo("Asia/Shanghai")
PERIOD = "2026Q3"
PERIOD_END = "2026-09-30"
SINA_STAMP = "20260930"
APPOINT_START = "2026-10-28"
APPOINT_END = "2026-10-31"
WATCH_NAMES = {
    "000034.SZ": "神州数码", "000807.SZ": "云铝股份", "000933.SZ": "神火股份",
    "300750.SZ": "宁德时代", "600011.SH": "华能国际", "600176.SH": "中国巨石",
    "600309.SH": "万华化学", "600585.SH": "海螺水泥", "600795.SH": "国电电力",
    "600863.SH": "华能蒙电", "600900.SH": "长江电力", "600941.SH": "中国移动",
    "601288.SH": "农业银行", "601811.SH": "新华文轩", "601899.SH": "紫金矿业",
    "603799.SH": "华友钴业", "688041.SH": "海光信息",
}
V2_REQUIRED = ["600011.SH", "600795.SH", "600863.SH", "000933.SZ", "601899.SH", "603799.SH"]
EM_CAL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
EM_ZYZB = "https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew"
SINA_URL = "https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"


class StopPolling(RuntimeError):
    """Deprecated: whole-process stop. Prefer SourceLimited."""


class SourceLimited(RuntimeError):
    """One public source hit rate-limit or breaker; skip it this round, keep polling."""

    def __init__(self, source: str, reason: str = ""):
        self.source = source
        self.reason = reason or "limited"
        super().__init__(f"{source} 频率限制或熔断: {reason}")


def now() -> datetime:
    return datetime.now(SHANGHAI)


def now_iso() -> str:
    return now().isoformat(timespec="seconds")


def day(value) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    match = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    return match.group(1) if match else None


def save_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def append_jsonl(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False) + "\n")


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_backend_path() -> None:
    root = str(BACKEND)
    if root not in sys.path:
        sys.path.insert(0, root)


def limiter(source: str):
    ensure_backend_path()
    from app.providers.rate_limit import get_limiter
    return get_limiter(source)


def _is_limited(exc: BaseException) -> bool:
    text = str(exc)
    name = type(exc).__name__
    return "403" in text or "Breaker" in name or "breaker" in text.lower()


def request(source: str, method: str, url: str, **kwargs):
    try:
        response = limiter(source).request(method, url, **kwargs)
    except Exception as exc:
        if _is_limited(exc):
            raise SourceLimited(source, type(exc).__name__) from exc
        raise
    if response.status_code == 403:
        raise SourceLimited(source, "HTTP 403")
    return response


def source_cooldown(source: str) -> float:
    try:
        return float(limiter(source).config.breaker_cooldown)
    except Exception:
        return 1800.0


def to_symbol(code: str) -> str | None:
    raw = str(code or "").strip().upper()
    if re.fullmatch(r"\d{6}\.(SH|SZ|BJ)", raw):
        return raw
    if re.fullmatch(r"\d{6}", raw):
        if raw.startswith(("8", "4", "92")):
            return raw + ".BJ"
        if raw.startswith(("6", "9")):
            return raw + ".SH"
        return raw + ".SZ"
    return None


def board_of(symbol: str, market: str | None = None) -> str:
    if market:
        text = str(market)
        if "创业板" in text:
            return "深市创业板"
        if "科创板" in text:
            return "沪市科创板"
        if "北" in text:
            return "北交所"
        if "深" in text and "主板" in text:
            return "深市主板"
        if "上" in text and "主板" in text:
            return "沪市主板"
    code = symbol.split(".")[0]
    if code.startswith(("300", "301")):
        return "深市创业板"
    if code.startswith("688"):
        return "沪市科创板"
    if code.startswith(("000", "001")):
        return "深市主板"
    if code.startswith(("002", "003")):
        return "深市主板"
    if symbol.endswith(".SH"):
        return "沪市主板"
    if symbol.endswith(".SZ"):
        return "深市主板"
    return "其他"


def sina_paper(symbol: str) -> str:
    code, market = symbol.split(".")
    return market.lower() + code


def em_code(symbol: str) -> str:
    code, market = symbol.split(".")
    return market + code


def watch_symbols() -> list[str]:
    if not SQLITE.exists():
        raise SystemExit(f"未找到关注库 {SQLITE}")
    conn = sqlite3.connect(f"file:{SQLITE}?mode=ro", uri=True)
    try:
        watch = [row[0] for row in conn.execute("SELECT symbol FROM watchlist")]
        roster = [row[0] for row in conn.execute("SELECT symbol FROM research_roster")]
    finally:
        conn.close()
    out = []
    for code in dict.fromkeys([*watch, *roster]):
        symbol = to_symbol(code)
        if symbol:
            out.append(symbol)
    return out


def em_calendar_rows(filt: str, page_size: int = 20, page: int = 1) -> tuple[int, list[dict]]:
    params = {
        "sortColumns": "SECURITY_CODE",
        "sortTypes": "1",
        "pageSize": str(page_size),
        "pageNumber": str(page),
        "reportName": "RPT_PUBLIC_BS_APPOIN",
        "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_MARKET,REPORT_DATE,REPORT_TYPE_NAME,FIRST_APPOINT_DATE,APPOINT_PUBLISH_DATE,ACTUAL_PUBLISH_DATE",
        "filter": filt,
    }
    response = request(
        "eastmoney_api", "GET", EM_CAL, params=params,
        headers={"User-Agent": UA, "Referer": "https://data.eastmoney.com/bbsj/yysj.html"},
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    result = payload.get("result") or {}
    return int(result.get("count") or 0), result.get("data") or []


def pick_calendar(day_value: str, low: str, high: str, want: int) -> list[dict]:
    filt = (
        f"(REPORT_DATE='{PERIOD_END}')(APPOINT_PUBLISH_DATE='{day_value}')"
        f'(SECURITY_CODE>="{low}")(SECURITY_CODE<"{high}")'
    )
    _count, rows = em_calendar_rows(filt, page_size=40)
    out = []
    for row in rows:
        name = str(row.get("SECURITY_NAME_ABBR") or "")
        if not name or "ST" in name.upper() or name.startswith("*"):
            continue
        symbol = to_symbol(str(row.get("SECURITY_CODE") or ""))
        if not symbol:
            continue
        out.append(row)
        if len(out) >= want:
            break
    return out


def build_sample() -> dict:
    LOCAL.mkdir(parents=True, exist_ok=True)
    watched = watch_symbols()
    items: dict[str, dict] = {}
    for symbol in watched:
        items[symbol] = {
            "symbol": symbol,
            "name": WATCH_NAMES.get(symbol, symbol),
            "board": board_of(symbol),
            "in_watch": True,
            "appoint": None,
            "actual": None,
            "source": "watchlist",
        }
    for symbol in list(items):
        code = symbol.split(".")[0]
        filt = f"(REPORT_DATE='{PERIOD_END}')(SECURITY_CODE=\"{code}\")"
        try:
            _count, rows = em_calendar_rows(filt, page_size=5)
        except Exception as exc:
            items[symbol]["calendar_error"] = type(exc).__name__
            continue
        row = next((r for r in rows if str(r.get("SECURITY_CODE")) == symbol.split(".")[0]), None)
        if not row:
            continue
        items[symbol]["name"] = row.get("SECURITY_NAME_ABBR") or items[symbol]["name"]
        items[symbol]["board"] = board_of(symbol, row.get("TRADE_MARKET"))
        items[symbol]["appoint"] = day(row.get("APPOINT_PUBLISH_DATE"))
        items[symbol]["actual"] = day(row.get("ACTUAL_PUBLISH_DATE"))
        items[symbol]["first_appoint"] = day(row.get("FIRST_APPOINT_DATE"))
    strata = [
        ("2026-10-28", "000000", "002000", 3),
        ("2026-10-28", "300000", "302000", 2),
        ("2026-10-28", "600000", "688000", 3),
        ("2026-10-29", "000000", "002000", 3),
        ("2026-10-29", "300000", "302000", 2),
        ("2026-10-29", "600000", "688000", 3),
        ("2026-10-30", "000000", "002000", 2),
        ("2026-10-30", "300000", "302000", 2),
        ("2026-10-30", "600000", "688000", 2),
        ("2026-10-31", "000000", "002000", 2),
        ("2026-10-31", "300000", "302000", 2),
        ("2026-10-31", "600000", "688000", 3),
    ]
    extra = 0
    for appoint, low, high, want in strata:
        try:
            rows = pick_calendar(appoint, low, high, want + 4)
        except StopPolling:
            raise
        except Exception as exc:
            continue
        taken = 0
        for row in rows:
            symbol = to_symbol(str(row.get("SECURITY_CODE") or ""))
            if not symbol or symbol in items:
                continue
            items[symbol] = {
                "symbol": symbol,
                "name": row.get("SECURITY_NAME_ABBR") or symbol,
                "board": board_of(symbol, row.get("TRADE_MARKET")),
                "in_watch": False,
                "appoint": day(row.get("APPOINT_PUBLISH_DATE")) or appoint,
                "actual": day(row.get("ACTUAL_PUBLISH_DATE")),
                "source": "calendar",
            }
            taken += 1
            extra += 1
            if taken >= want:
                break
    sample = {
        "built_at": now_iso(),
        "period": PERIOD,
        "period_end": PERIOD_END,
        "appoint_window": [APPOINT_START, APPOINT_END],
        "n": len(items),
        "n_watch": sum(1 for row in items.values() if row["in_watch"]),
        "n_calendar_extra": extra,
        "items": sorted(items.values(), key=lambda row: row["symbol"]),
    }
    save_json(EVAL_DIR / "sample.json", sample)
    save_json(LOCAL / "sample.json", sample)
    return sample


def load_or_build_sample() -> dict:
    existing = load_json(EVAL_DIR / "sample.json")
    if existing and existing.get("items"):
        return existing
    return build_sample()


_CNINFO = None


def cninfo_provider():
    global _CNINFO
    if _CNINFO is None:
        ensure_backend_path()
        from app.providers.regular_reports import RegularReportProvider
        _CNINFO = RegularReportProvider()
    return _CNINFO


def fetch_cninfo_q3(symbol: str) -> dict:
    ensure_backend_path()
    from app.models.document import DocumentType
    try:
        docs = cninfo_provider().list_documents(symbol, DocumentType.quarterly_report, period=PERIOD, limit=10)
    except SourceLimited:
        raise
    except Exception as exc:
        if _is_limited(exc):
            raise SourceLimited("cninfo", type(exc).__name__) from exc
        return {"ok": False, "posted": False, "error": type(exc).__name__, "n": 0}
    posted = []
    for doc in docs:
        title = doc.title or ""
        if "摘要" in title:
            continue
        published = doc.published_at
        iso = None
        if published is not None:
            if published.tzinfo is None:
                published = published.replace(tzinfo=SHANGHAI)
            iso = published.astimezone(SHANGHAI).isoformat(timespec="seconds")
        posted.append({
            "title": title,
            "published_at": iso,
            "provider_document_id": doc.provider_document_id,
            "reporting_period": doc.reporting_period,
        })
    posted.sort(key=lambda row: row["published_at"] or "9999")
    return {
        "ok": True,
        "posted": bool(posted),
        "n": len(posted),
        "earliest": posted[0]["published_at"] if posted else None,
        "title": posted[0]["title"] if posted else None,
        "error": None,
    }


def _sina_reports(symbol: str, source: str) -> dict:
    response = request(
        "sina_api", "GET", SINA_URL,
        params={"paperCode": sina_paper(symbol), "source": source, "type": 0, "page": 1, "num": 8},
        headers={"User-Agent": UA},
        timeout=15,
    )
    response.raise_for_status()
    reports = ((response.json().get("result") or {}).get("data") or {}).get("report_list") or {}
    if not isinstance(reports, dict):
        raise ValueError("sina_report_list")
    return reports


def fetch_sina_period(symbol: str) -> dict:
    try:
        reports = _sina_reports(symbol, "lrb")
    except SourceLimited:
        raise
    except Exception as exc:
        return {"ok": False, "has_period": False, "error": type(exc).__name__, "periods": []}
    row = reports.get(SINA_STAMP)
    periods = sorted(reports, reverse=True)[:6]
    if not row:
        return {"ok": True, "has_period": False, "error": None, "periods": periods, "publish_date": None, "fields": {}}
    fields = {}
    for entry in row.get("data") or []:
        column = entry.get("item_field")
        if column in {"BIZINCO", "PARENETP", "NETPARECOMPPROF", "NETPROFIT", "BIZCOST"}:
            fields[column] = entry.get("item_value")
    publish = str(row.get("publish_date") or "")
    publish_iso = None
    if re.fullmatch(r"\d{8}", publish):
        publish_iso = f"{publish[:4]}-{publish[4:6]}-{publish[6:]}T00:00:00+08:00"
    return {
        "ok": True,
        "has_period": True,
        "error": None,
        "periods": periods,
        "publish_date": publish_iso,
        "rType": row.get("rType"),
        "fields": fields,
    }


def fetch_sina_cash(symbol: str) -> dict:
    try:
        reports = _sina_reports(symbol, "llb")
    except SourceLimited:
        raise
    except Exception as exc:
        return {"ok": False, "has_period": False, "error": type(exc).__name__, "fields": {}}
    row = reports.get(SINA_STAMP)
    if not row:
        return {"ok": True, "has_period": False, "error": None, "fields": {}}
    fields = {}
    for entry in row.get("data") or []:
        if entry.get("item_field") in {"MANANETR", "ACQUASSETCASH"}:
            fields[entry["item_field"]] = entry.get("item_value")
    return {"ok": True, "has_period": True, "error": None, "fields": fields}


def fetch_em_zyzb(symbol: str) -> dict:
    try:
        response = request(
            "eastmoney_api", "GET", EM_ZYZB,
            params={"type": "0", "code": em_code(symbol)},
            headers={"User-Agent": UA, "Referer": "https://emweb.securities.eastmoney.com/"},
            timeout=20,
        )
        response.raise_for_status()
        rows = response.json().get("data") or []
    except SourceLimited:
        raise
    except Exception as exc:
        return {"ok": False, "has_period": False, "error": type(exc).__name__, "dates": []}
    if not isinstance(rows, list):
        return {"ok": False, "has_period": False, "error": "invalid_rows", "dates": []}
    dates = [day(row.get("REPORT_DATE")) for row in rows]
    hit = next((row for row in rows if day(row.get("REPORT_DATE")) == PERIOD_END), None)
    if not hit:
        return {"ok": True, "has_period": False, "error": None, "dates": dates[:8], "fields": {}}
    keys = ("TOTALOPERATEREVE", "PARENTNETPROFIT", "KCFJCXSYJLR", "MLR", "NOTICE_DATE", "UPDATE_DATE")
    fields = {key: hit.get(key) for key in keys}
    return {
        "ok": True,
        "has_period": True,
        "error": None,
        "dates": dates[:8],
        "notice_date": day(hit.get("NOTICE_DATE")),
        "fields": fields,
    }


def backend_get(path: str, params: dict | None = None):
    import urllib.parse
    import urllib.request
    url = BACKEND_HTTP + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
        ctype = resp.getheader("Content-Type") or ""
        if "json" in ctype or body[:1] in (b"{", b"["):
            return json.loads(body.decode("utf-8"))
        return body.decode("utf-8")


def list_q3_document(symbol: str) -> dict | None:
    try:
        payload = backend_get(f"/api/v1/wiki/companies/{symbol}/documents", {"limit": 50})
    except Exception:
        return None
    hits = []
    for item in payload.get("items") or []:
        title = item.get("title") or ""
        if item.get("reporting_period") != PERIOD or not item.get("has_parsed"):
            continue
        if "摘要" in title:
            continue
        hits.append(item)
    if not hits:
        return None
    hits.sort(key=lambda item: item.get("published_at") or "")
    return hits[0]


def decimal_or_none(value) -> Decimal | None:
    if value in (None, "", "--", "-"):
        return None
    try:
        number = Decimal(str(value).replace(",", ""))
    except (InvalidOperation, ValueError):
        return None
    return number if number.is_finite() else None


def compare_values(left: Decimal | None, right: Decimal | None) -> dict:
    if left is None or right is None:
        return {"comparable": False, "consistent": None, "difference": None}
    difference = abs(left - right)
    precision = min(left.as_tuple().exponent, right.as_tuple().exponent)
    tolerance = Decimal(10) ** precision / 2 if precision < 0 else Decimal("0.5")
    return {
        "comparable": True,
        "consistent": difference <= tolerance,
        "difference": format(difference, "f"),
        "tolerance": format(tolerance, "f"),
    }
