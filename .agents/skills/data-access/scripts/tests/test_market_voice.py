"""保留不可信文本净化、URL安全与mapper键离线测试；Exa取数已退役。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sources import mappers_cn, textsafe


def test_sanitize_untrusted_neutralizes_actions_and_controls():
    s = textsafe.sanitize_untrusted("  目标价​ 1500，建议买入！减持评级 \x07‍ 增持   ", 300)
    assert "目标价" not in s and "建议买" not in s
    # 裸评级标签可能是第三方事实或篇数统计，保留给产出 gate 做语境判断；
    # 不能在取数层把合法的评级分布先删掉。
    assert "减持评级" in s
    assert s.count(textsafe.ACTION_MARK) == 2 and "\x07" not in s and "​" not in s
    assert "增持" in s, "裸词「增持」不是动作措辞(股东增持是公司行为事实)"
    assert textsafe.sanitize_untrusted("a" * 500, 100) == "a" * 100
    assert textsafe.sanitize_untrusted(None) == ""
    assert "利空" in textsafe.sanitize_untrusted("这是利空消息")


def test_sanitize_bypass_forms_space_invisible_traditional():
    M = textsafe.ACTION_MARK
    assert textsafe.sanitize_untrusted("建 仓") == M, "汉字间空格"
    assert textsafe.sanitize_untrusted("建\u034f仓") == M, "组合字形连接符 CGJ"
    assert textsafe.sanitize_untrusted("目\ufe0f标价") == M, "变体选择符 VS16"
    assert textsafe.sanitize_untrusted("目標價") == M and textsafe.sanitize_untrusted("逢低買入") == M + "入", "繁体"
    assert textsafe.sanitize_untrusted("建·仓 / 止-损 / 目_标_价") == f"{M} / {M} / {M}", "中点 / 连字符 / 下划线分隔"
    assert textsafe.sanitize_untrusted("控股股东拟增持公司股份") == "控股股东拟增持公司股份", "公司行为不误伤"
    assert textsafe.sanitize_untrusted("建议增持评级") == M + "评级"
    # 正常标点与空格不被改动
    assert textsafe.sanitize_untrusted("业绩, 订单 进展。光模块-算力") == "业绩, 订单 进展。光模块-算力"
    assert textsafe.canonical_for_match("建 仓 目標價") == "建仓目标价"


def test_safe_url():
    assert textsafe.safe_url("https://finance.sina.com.cn/中文/doc.shtml?a=1") == "https://finance.sina.com.cn/%E4%B8%AD%E6%96%87/doc.shtml?a=1"
    assert textsafe.safe_url("https://x.com/a\u200b<b> c") == "https://x.com/a%3Cb%3Ec"
    assert textsafe.safe_url("ftp://x") == "" and textsafe.safe_url("javascript:alert(1)") == "" and textsafe.safe_url(None) == ""
    assert len(textsafe.safe_url("https://x.com/" + "a" * 1000)) == 300


def test_gate_words_cover_action_phrases():
    # 红线词表在垂类包里(textsafe);与已删除的 Core 侧 gate.ts / gate_rules.ts 的同步校验随退役移除。
    assert "增持" not in textsafe.GATE_WORDS and "建议增持" in textsafe.GATE_WORDS


def test_record_key_hash_no_tail_collision():
    a = mappers_cn._url_key("u:", "https://a.example.com/" + "p" * 200 + "/same-tail")
    b = mappers_cn._url_key("u:", "https://b.example.com/" + "q" * 200 + "/same-tail")
    assert a != b and a.startswith("u:") and len(a) == 26


def test_sep_chars_and_marks():
    M = textsafe.ACTION_MARK
    for bad in ["建/仓", "目／标／价", "建议+买入", "建́仓", "建―仓", "建＋仓", "目 ／ 标 ／ 价"]:
        assert textsafe.sanitize_untrusted(bad).startswith(M), bad
    assert textsafe.sanitize_untrusted("Việt Nam tiến lên") == "Việt Nam tiến lên", "输出文本不剥正常组合附加符"


def test_safe_url_markdown_metachars_encoded():
    u = textsafe.safe_url("https://evil.example/a)![x](https://tracker.example/p)")
    assert "(" not in u and ")" not in u and "!" not in u and "[" not in u and u.startswith("https://evil.example/a%29%21%5Bx%5D%28https")
