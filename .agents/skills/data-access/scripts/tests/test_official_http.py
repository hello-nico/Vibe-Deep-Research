"""传输失败不能冒充业务无数据；日期回退仍需拿到有效正文。全部离线。"""
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sources import _http

MISSING = (404, "text/html", "<html>Not Found</html>")
DENIED = (403, "application/xml", "<Error><Code>AccessDenied</Code></Error>")


def install_http(monkeypatch, replies):
    calls = []

    def get(url, **kwargs):
        calls.append(url)
        status, content_type, body = replies[len(calls) - 1] if len(calls) <= len(replies) else replies[-1]
        response = requests.Response()
        response.status_code, response.url = status, url
        response.headers["Content-Type"] = content_type
        response._content = body.encode()
        return response

    monkeypatch.setattr(_http, "_session", lambda *a: SimpleNamespace(get=get))
    monkeypatch.setattr(_http, "_limiter_for", lambda *a: SimpleNamespace(wait=lambda: None))
    monkeypatch.setenv("VRA_SEC_CONTACT", "Test fixture@example.invalid")
    return calls


@pytest.mark.parametrize("reply", [MISSING, DENIED, (403, "text/html", "denied"), (429, "text/plain", "slow down")])
def test_http_failure_is_not_business_absence_and_raw_is_kept(tmp_path, monkeypatch, reply):
    install_http(monkeypatch, [reply])
    with _http.capture(str(tmp_path), "fixture", "probe") as capture:
        with pytest.raises(RuntimeError) as error:
            _http.official_get("https://api.example.invalid/data/20260904")
    assert not isinstance(error.value, _http.DataNotAvailable)
    assert str(reply[0]) in str(error.value)
    assert "该日无数据" not in str(error.value)
    assert (tmp_path / capture.last_raw_ref).read_bytes() == reply[2].encode()
