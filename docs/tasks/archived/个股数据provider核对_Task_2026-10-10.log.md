# 个股数据 provider 核对 · 过程记录

## 2026-10-10 · codex1 只读验证与交接

结论：有条件成立。营业收入、归母净利、经营现金流符合 P6 的主来源建议规则；三表直接列不能覆盖全部十五字段。购建资产付现按冻结基线只有 91.67% 一致，保留为核对来源。P5 原定独立估值复算缺原料，停止该子项，不用其他列推算。

实施只在 Stock `artifacts/t7-provider/`；另回填本 Task。完整报告在 [summary.md](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/summary.md)，没有改产品、配置、测试或任何旧 T7/T7.1 文件。未调用模型、未提交、未 push、未重建容器或重启工作台。

### 读取与取数方式

先完整读取本 Task、两仓 AGENTS、Vibe `docs/task-protocol.md`、T7.1 当前交接及过程记录的「Claude 审阅与修订 1」「codex1 修订 1 实施与自动核对」，以及三表适配、同花顺客户端、限速器、估值 provider 与服务。应用 task-driven-dev skill；以仓内现行协议优先。

用户提到的 `backend/app/providers/company_market.py` 实际位于 `backend/app/services/company_market.py`。该服务会落缓存和保存快照，本轮绕开服务，直接使用现有 `HithinkClient` 和 `RateLimiter` 调用已经登记的 URL。容器内既有环境由客户端自行使用，没有读取、打印凭据、环境文件或连接串，也不连接数据库。

固定 17 家：000034、000807、000933、300308、300750、600011、600176、600309、600585、600795、600863、600900、600941、601288、601811、601899、603799（市场后缀保留在原始响应与 CSV）。同花顺每家三表 annual(limit=4)、quarterly(limit=12) 各一次，加估值一次；新浪三表各一次 num=12；腾讯报价各一次。均经 `rate_limit`，最小间隔至少 0.8 秒且保留各源更严配置，限流/鉴权会降速重试一次并停止对应源。本轮没有触发鉴权或限流停止。

执行命令（Stock 主目录）：

```sh
python3 artifacts/t7-provider/baseline.py > artifacts/t7-provider/before-hashes.json
docker exec -i stock-research-backend python - --source hithink < artifacts/t7-provider/fetch.py > artifacts/t7-provider/hithink.jsonl 2> artifacts/t7-provider/hithink.log
docker exec -i stock-research-backend python - --source sina < artifacts/t7-provider/fetch.py > artifacts/t7-provider/sina.jsonl 2> artifacts/t7-provider/sina.log
docker exec -i stock-research-backend python - --source tencent < artifacts/t7-provider/fetch.py > artifacts/t7-provider/tencent.jsonl 2> artifacts/t7-provider/tencent.log
python3 artifacts/t7-provider/read-reference.py
python3 artifacts/t7-provider/analyze.py > artifacts/t7-provider/analyze.log
python3 artifacts/t7-provider/baseline.py > artifacts/t7-provider/after-hashes.json
```

|源|逻辑请求|收到 HTTP 响应|成功|失败|该进程总耗时|
|---|---:|---:|---:|---:|---:|
|同花顺|119|118|118|1|111.6616 秒|
|新浪|51|51|51|0|66.3446 秒|
|腾讯|17|17|17|0|21.8010 秒|
|合计|187|186|186|1|三进程耗时之和 199.8072 秒|

耗时包含限速和网络等待；进程有重叠，199.8072 秒不是整体墙钟耗时。唯一失败为 000034.SZ annual income-statements，无 HTTP 响应，客户端报 provider_unavailable，未重复请求；该公司的 quarterly 响应包含 FY2025/FY2024，仍能比较对应期间。备源作为 P1 授权的独立核对，没有为鉴权失败换源。

### P2 列清单与对应

全列及样例见 [columns.md](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/columns.md)。[column-inventory.json](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/column-inventory.json) 按 187 个请求分别保存列清单、返回行数、元数据字段；不是只看一家样例。[columns.json](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/columns.json) 保存每列非空数和样例。原始 envelope、request_id、timestamp、全部行仍在三份 JSONL 中。

实际同花顺行字段数：利润表 21 列、资产负债表 15 列、现金流量表 14 列、估值 8 列（含身份、期间、货币等元数据）。新浪三表的 item_field/title 去重为 121/210/132 列；有列不等于有非空值。金额以现有适配契约 CNY 元解释，并用原文不同披露单位核对；股本金额不冒充股数。

|字段|同花顺|新浪/腾讯|结果/边界|
|---|---|---|---|
|营业收入|operating_income|BIZINCO|六期间均 102/102 有值|
|营业成本|operating_costs|BIZCOST|96/102；农业银行六期间为空；不是营业总成本|
|归母净利|parent_holder_net_profit|PARENETP、银行 NETPARECOMPPROF|六期间均 102/102|
|经营现金流|act_cash_flow_net|MANANETR|六期间均 102/102|
|购建长期资产付现|pay_fixed_assets_etc_cash|ACQUASSETCASH|六期间均 102/102；不是投资现金流净额|
|股本/股数|无|PAIDINCAPI、CAPISTOCK|新浪股本金额 102/102；没有已确认普通股数，不假设 1 元面值|
|归母净资产|无|PARESHARRIGH、银行 PARECOMPSHARRIGHT|新浪 102/102；同花顺 holder_equity_total 含少数股东，不映射归母|
|普通股实付分红|无独立列|无独立列|两源混合付现均包括股利/利润/利息；应付、拟分配不等于实付|
|扣非归母、每股分红|无|无对应直接列|按 §7 停止，不从其他列推算|
|毛利率、剩余现金、股息率、同行|无|无对应直接列|按 §7 停止，不在本验证计算|
|PE/PB|pe_ttm、pb_mrq|腾讯下标 39、46|当前 17/17；没有历史六期间估值|
|现价|三表/估值无|腾讯下标 3，时间 30|17/17，报价 2026-10-09；仅同源行情核对|
|TTM 利润金额|无|三表无|基本 EPS 为报告期数据，TTM 倍数不等于提供 TTM 利润|

### P3 六期间与口径

两三表源的收入、归母、经营现金流、购建资产付现，在 FY2025、FY2024、2026H1、2026Q1、2025H1、2025Q3 各为 17/17。资产负债表取期末时点；利润表与现金流量表是年初累计。quarterly 的 Q2 表示累计 H1，Q3 表示 1–9 月，Q4 表示全年，不是单季。没有返回原值/调整值双列、独立单季金额或 TTM 利润金额。

证据：[periods.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/periods.csv) 保存真实 fiscal_period、期末、披露日期与口径标志；[period-evidence.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/period-evidence.csv) 对照 T7.1 保存的 original/comparison 读数，仅服务 P3，不扩充 P4 冻结参考。

中国移动收入六期间示例，两源相等：FY2025 1,050,187,000,000 元，FY2024 1,040,759,000,000 元，2026H1 538,035,000,000 元，2026Q1 266,478,000,000 元，2025H1 543,769,000,000 元，2025Q3 794,666,000,000 元。Q3、Q1、H1 的数值与 T7.1 对应期间读数相等，H1 是累计半年，不是单季。

华能蒙电 FY2024 收入：两源 annual/quarterly 返回 23,855,078,445.19 元，与 FY2025 合并表比较列相等；FY2024 自身原报告为 22,293,633,145.08 元。说明 provider 可给调整后值，且不同时给原值，不能统一将所有期间声明为原披露。该格不在 71+110 冻结参考中，未伪装为 P4 的新增错值。

### P4 比较、去重与不一致分类

输入 181 条参考：71 金标、110 verified。110 中只有 73 条报告/摘要原值；其余 20 条计算值、17 条行情值。按公司/字段/期间合并为 165 格（重复 16 格），其中 128 格有独立报告参考。每个重复格都核对各个原参考的披露精度，未挑选有利参考。

Decimal 保留响应和原文精度；货币单位统一后，容差为原披露精度的半单位。例如宁德时代千元整数容差 500 元，中国移动百万元整数容差 500,000 元，元小数两位容差 0.005 元；每十股转每股相应换算容差。

|参考组|同花顺|新浪|腾讯|
|---|---|---|---|
|金标 71 格|32 一致 /39 无对应列 /0 不一致|同左|71 无对应列|
|T7.1 110 格|44 一致 /65 无对应列 /1 口径差异|同左|17 行情同源一致 /93 无对应列|
|合并 165 格|66 一致 /98 无对应列 /1 口径差异|同左|17 行情同源一致 /148 无对应列|
|独立报告 128 格|66 一致 /61 无对应列 /1 口径差异|同左|128 无独立报告比较|

逐格详情：[comparison.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/comparison.csv)，495 行为 165 格×3 源。原参考值、容差、版本与块号在 [references.json](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/references.json)。没有把两个 provider 相互一致当成报告独立正确，也没有把缺列当成错值。

唯一不一致为 300750.SZ FY2025 capex_cash：两源 42,344,558,000 元，T7.1 verified 2,056,300,000 元。通过只读 GET 读取已入库固定解析版本，SHA-256 与原参考一致；原文合并现金流量表明确为 42,344,558 千元，母公司现金流量表为 2,056,300 千元。归类「合并 / 母公司口径」，provider 获同报告合并表支持，而原 T7.1 参考标注合并有误。本 Task 不修基线或产品，统计仍保留 X。

报告：document_id `7facbbe90e5c4558a6b229ba1f2d34bb`，revision `r-521d8f08c6744c66`，SHA-256 `ddeae5252007f5982ae9a2aeaf5c29d37ec08e1db42be1c0bbf2a38cdc1ab221`。GET 路径为 `/api/v1/documents/{document_id}/parsed?parse_revision_id={revision}&parsed_content_sha256={hash}`；脚本的完整 URL 和参数在 `read-reference.py`。原文与定位证据在 `discrepancy-reference.md`、`discrepancy-evidence.json`。

其余五类（追溯重述、单位、期间错位、provider 错值、无法判断）在冻结 P4 比较中均为 0；P3 的 FY2024 重述另列，不混入 P4。

### P6 逐字段结论与期间统计

全部源的逐字段及字段×期间表见 [field-summary.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/field-summary.csv)、[field-period-summary.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/field-period-summary.csv)。无报告可比的一致率写 N/A，不写 100%。主来源仍由 Claude 裁决。

|十五字段|有效源与覆盖|独立报告一致率|按 P6 建议|
|---|---|---|---|
|营业收入|同花顺/新浪各 102/102|19/19，100%|主来源，限已核对口径|
|毛利率|0/102|N/A|直接列不可用|
|归母净利|同花顺/新浪各 102/102|18/18，100%|主来源，限已核对口径|
|扣非归母|0/102|N/A|不可用|
|经营现金流|同花顺/新浪各 102/102|18/18，100%|主来源，限已核对口径|
|购建长期资产付现|同花顺/新浪各 102/102|11/12，91.67%|只作核对；唯一差异已解释|
|普通股实付分红|0/102|N/A|不可用|
|剩余现金|0/102|N/A|直接列不可用|
|普通股总股数|0/102|N/A|不可用；新浪有股本金额，不是总股数|
|每股分红|0/102|N/A|不可用|
|股息率|0/102|N/A|直接列不可用|
|现价|腾讯 17/17|N/A；17 个同源行情匹配|只作核对，非独立报告验证|
|PE|同花顺/腾讯各 17/17|N/A；独立复算 0 样本|只作核对|
|PB|同花顺/腾讯各 17/17|N/A；仅备源交叉比较|只作核对|
|同行|0/102|N/A|本接口不可用|

额外列：营业成本覆盖 96/102、无 P4 独立参考；新浪股本金额和归母净资产各 102/102、无 P4 同字段独立参考，建议只作核对，不能仅凭覆盖升为主来源。

|期间|四个直接财务字段各覆盖|收入一致/不一致|归母一致/不一致|CFO 一致/不一致|capex 一致/不一致|
|---|---|---|---|---|---|
|FY2025|17/17|15/0|14/0|14/0|7/1|
|FY2024|17/17|0/0（无参考）|0/0（无参考）|0/0（无参考）|0/0（无参考）|
|2026H1|17/17|4/0|4/0|4/0|4/0|
|2026Q1|17/17|0/0（无参考）|0/0（无参考）|0/0（无参考）|0/0（无参考）|
|2025H1|17/17|0/0（无参考）|0/0（无参考）|0/0（无参考）|0/0（无参考）|
|2025Q3|17/17|0/0（无参考）|0/0（无参考）|0/0（无参考）|0/0（无参考）|

上表同花顺与新浪相同。后一类 0/0 不能解释为 100% 一致；P3 的补充读数不加入冻结参考分母。PE/PB 与价格只取当前快照，不伪造六个历史期间。

### 17 家 ×15 字段矩阵

详细来源和数值：[matrix-detail.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/matrix-detail.csv)。P=provider 与独立报告一致；p=有值但无独立报告可比；X=不一致；G=provider 和参考都无值。增加 R=只有参考有值、provider 没有直接列；原四码无法表达这种情况，不能将原文已找到的格子标成“都没有”。

字段顺序：收入、毛利率、归母、扣非、CFO、capex、实付、剩余、股数、每股分红、股息率、价格、PE、PB、同行。财务 FY2025，股数 2026H1，价格 2026-10-09，估值当前 TTM/MRQ。同花顺→新浪→腾讯选择可用直接列，完整分源比较不合并隐藏差异。

|公司|收入|毛利率|归母|扣非|CFO|capex|实付|剩余|股数|每股分红|股息率|价格|PE|PB|同行|
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|000034|P|R|P|R|P|p|G|G|G|R|R|p|p|p|G|
|000807|P|R|P|R|P|p|G|G|G|R|R|p|p|p|G|
|000933|P|R|p|G|p|p|G|G|G|R|R|p|p|p|G|
|300308|P|R|P|R|P|p|G|G|R|R|R|p|p|p|G|
|300750|P|R|P|R|p|X|G|G|G|R|R|p|p|p|G|
|600011|p|G|P|R|P|P|G|G|G|R|R|p|p|p|G|
|600176|P|G|P|R|P|p|G|G|G|G|G|p|p|p|G|
|600309|P|G|P|R|P|p|G|G|G|R|R|p|p|p|G|
|600585|p|G|p|R|p|P|G|G|R|G|G|p|p|p|G|
|600795|P|G|P|R|P|p|G|G|G|R|R|p|p|p|G|
|600863|P|R|P|R|P|P|R|G|R|R|R|p|p|p|G|
|600900|P|G|P|R|P|P|G|G|R|R|R|p|p|p|G|
|600941|P|G|p|G|P|P|G|G|G|G|G|p|p|p|G|
|601288|P|G|P|R|P|P|G|G|R|R|R|p|p|p|G|
|601811|P|R|P|R|P|p|G|G|G|G|G|p|p|p|G|
|601899|P|G|P|R|P|p|G|G|G|R|R|p|p|p|G|
|603799|P|G|P|R|P|P|G|G|R|R|R|p|p|p|G|

矩阵总数 P50/p68/X1/G81/R55=255。价格17格虽与上一轮同源报价相等，仍为 p；不把其当独立报告核对。

### 三家公司示例

三家全部十五字段的逐格 provider/原文数值见 `summary.md`「三家逐字段示例」及 `matrix-detail.csv`，以下是可直接核对的财务原值。

|公司|字段|FY2025 provider（元）|报告参考（保留单位）|结果|
|---|---|---:|---:|---|
|华友钴业|收入|81,018,674,069.68|81,018,674,069.68|P|
|华友钴业|归母净利|6,110,378,757.84|6,110,378,757.84|P|
|华友钴业|经营现金流|4,011,961,997.48|4,011,961,997.48|P|
|华友钴业|购建资产付现|10,757,625,082.43|10,757,625,082.43 元|P|
|华能蒙电|收入|21,050,468,832.20|21,050,468,832.20|P|
|华能蒙电|归母净利|2,493,439,065.89|2,493,439,065.89|P|
|华能蒙电|经营现金流|6,731,988,052.20|6,731,988,052.20|P|
|华能蒙电|购建资产付现|3,771,344,604.19|3,771,344,604.19|P|
|农业银行|收入|725,306,000,000|725,306 百万元|P|
|农业银行|归母净利|291,041,000,000|291,041 百万元|P|
|农业银行|经营现金流|2,112,907,000,000|2,112,907 百万元（金标）|P|
|农业银行|购建资产付现|27,348,000,000|27,348 百万元|P|

三家的扣非、每股分红虽已有报告值，provider 无对应列，均为 R；毛利率有保存计算值时为 R，银行毛利率为 G。普通股实付只有金标相应期间已找到者为 R。股数有原文但新浪股本金额不可直接当股数，仍为 R。股息率有保存计算值者为 R。价格、PE/PB 是 p，剩余现金与同行是 G。保留缺口，不反推补齐。

### P5 估值复算与停止子项

同花顺三表/估值没有 TTM 利润金额；新浪也是累计三表，无直接 TTM 金额。新浪股本金额虽有值，未完成普通股面值、A/H 等股类总数确认。因此原定股数×价÷TTM 利润的 PE 复算为 0 样本，不能给 0% 偏差，按 §7 停止；原定股数×价的 PB 复算也未通过。

补充只读交叉核对：PB=腾讯报价总市值（亿元）×1e8 /新浪最新 2026H1 归母净资产（元）。这不是完整 P5 通过，更不是两源的独立报告正确率。差异分母为各源返回 PB，17 家的输入与公式都在 [valuation.csv](/Users/apple/ts/src/Stock-Research/artifacts/t7-provider/valuation.csv)。

|对照 PB 来源|样本数|最小绝对偏差|中位绝对偏差|最大绝对偏差|≤5%|
|---|---:|---:|---:|---:|---:|
|同花顺|17|0.0000058%|0.0003679%|53.25023%|15/17|
|腾讯|17|0.0053228%|0.2575771%|53.14940%|14/17|

超 5%：同花顺为华能国际 53.25%、农业银行 14.12%；腾讯再加紫金矿业 7.27%。不凭这些偏差断言错值：需确认 provider 市值股类、普通股净资产扣除优先股/永续债口径、所用报告时点。PB 的偏差分布只是解释后续验证成本。

### 完整性与门禁

对前后 JSON 哈希清单执行如下核对（Stock 主目录）：

```sh
python3 - <<'PY'
import json,csv
from pathlib import Path
p=Path('artifacts/t7-provider')
before=json.loads((p/'before-hashes.json').read_text());after=json.loads((p/'after-hashes.json').read_text())
changed=[k for k in sorted(set(before)|set(after)) if before.get(k)!=after.get(k)]
summary=json.loads((p/'summary.json').read_text())
refs=json.loads((p/'references.json').read_text());cols=json.loads((p/'column-inventory.json').read_text())
comparison=list(csv.DictReader((p/'comparison.csv').open()));matrix=list(csv.DictReader((p/'matrix.csv').open()))
checks={'protected_files':len(before),'changed_files':changed,'references':len(refs),'comparison_rows':len(comparison),'matrix_rows':len(matrix),'request_inventory':len(cols)}
assert not changed
assert len(refs)==181 and len(matrix)==17 and len(comparison)==165*3 and len(cols)==187
assert summary['reference_input_sets']=={'gold':71,'t7.1r1':110}
assert len([r for r in comparison if r['status']=='X'])==2
assert {r['category'] for r in comparison if r['status']=='X'}=={'合并 / 母公司口径'}
assert summary['matrix']=={'P':50,'R':55,'p':68,'G':81,'X':1}
(p/'integrity.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(checks,ensure_ascii=False))
PY
```

结果：330 个受保护文件、0 变化；181 引用、495 比较行、17 矩阵行、187 请求清单行，所有断言通过。保护范围为 app、tests、backend/config、dsh/src、dsh/test 中列入脚本的源码/JSON/快照及 pyproject/uv.lock；不读取 .env。产物可丢，断言只是统计结构检查，不是产品测试。

两仓各执行：

```sh
node scripts/verify-protocol.mjs
git diff --check
```

首次两仓均 `verify-protocol: ok`、diff 无空白错误。最终文档回填后结果见本记录下节。没有产品改动，未跑 pytest/pnpm test，也未使用替身或固定测试夹具来冒充本轮 provider 运行。

未覆盖：四个非 FY2025/2026H1 期间只有取数覆盖与部分 P3 读数，不具备冻结 P4 的独立报告参考；17 家更全面的原值/调整值、股数面值、TTM与普通股净资产验证未完成。收尾交给 Claude 审阅与写定 T7.1c，codex1 停下。

### 最终门禁结果

回填后执行以下完整命令。第一、三条工作目录为 Vibe 主目录；第二、四条为 Stock 主目录。四条退出码均为 0。

```sh
node scripts/verify-protocol.mjs > /Users/apple/ts/src/Stock-Research/artifacts/t7-provider/verify-vibe.log 2>&1
node scripts/verify-protocol.mjs > artifacts/t7-provider/verify-stock.log 2>&1
git diff --check > /Users/apple/ts/src/Stock-Research/artifacts/t7-provider/diff-vibe.log 2>&1
git diff --check > artifacts/t7-provider/diff-stock.log 2>&1
```

两个协议日志均为 `verify-protocol: ok`；两个 diff 日志为空，无空白错误。另逐行对照本记录与 `matrix.csv` 的 17×15 格，全部相同。前后哈希核对和统计断言通过，结果已保存在 `integrity.json`。本轮未运行产品测试，因为未改产品代码、配置或测试。

验证产物共 36 个文件，均位于 Stock `artifacts/t7-provider/`；四个脚本为 `fetch.py`、`analyze.py`、`read-reference.py`、`baseline.py`，其余为响应、证据、统计及门禁日志。Task §9 已覆盖六字段；留待 Claude 审阅，codex1 停止执行。

## 2026-10-11 · Claude 审阅

- 复核 `summary.md`、`columns.md` 与 `comparison.csv`：营业收入、归母净利、经营现金流结论成立；购建资产付现唯一差异是 T7.1 把宁德时代母公司现金流量表当合并表（2,056,300 千元 vs 合并 42,344,558 千元），错在报告抽取，不在 provider，因此 T7.1c 把它也作主来源并修母公司段排除。
- P5 停止合理：没有股数与 TTM 利润金额。T7.1c 改用「总市值 / TTM 归母净利」「总市值 / 归母净资产（新浪 PARESHARRIGH）」复算，避开股数。
- 用户同意取数思路（2026-10-10）；Checklist 本仓条目已改写，落点 T7.1c。
