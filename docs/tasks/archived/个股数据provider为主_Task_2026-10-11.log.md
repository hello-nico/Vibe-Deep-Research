# T7.1c 过程记录

## 2026-10-11 · codex1 实施与真实验证

结论：范围内代码实施完成；真实 provider、快照写入及只读数据包验证通过，保留明确冲突和缺口，待 Claude 审阅。原工作台和 8700 服务未更新代码；未提交、未 push、未重建容器、未重启服务。

### 执行边界与依据

- 完整阅读 Task §1–§9、两仓 AGENTS、共享 task-protocol、相关 README/Checklist；核对 T7.1/T7.1b 过程、原 provider 客户端、ProviderSnapshots 身份与哈希校验、现有 coverage/ensure 和行情保存路径。
- Stock 主目录实施，修改仅在 §4 范围内。codex2 的删除、wiki.py、其他 Backend 路由、DSH、bench、citation_*、pyproject.toml、uv.lock 等现有改动未修改、暂存或回退。最终 10 个源码/测试文件哈希与运行冻结版本一致，未发现同文件重叠。
- Vibe 仅回填本 Task 与同名过程记录。未读取或打印凭据、认证文件、个人配置或 .env；现有容器进程内部沿用数据库环境，产出不包含连接串或模型配置。
- 技能：沿用 task-driven-dev 的 Task/过程/交接流程；人类裁决依据为本 Task 的冻结决定，无新增产品决定。

### 实现与选择理由

1. `get_packet_statement_history` 新增 packet 历史契约；现有 get_hithink_statements、get_sina_statements、get_hithink_statement_history 的输出不变。同花顺三表 quarterly、limit=16，保存所需年份的累计值；空表、失败或空格启用新浪同表补缺。新浪资产负债表始终读取，因为同花顺没有 D2 的归母权益列。
2. 每格沿用 ProviderSnapshots.save_many 校验与存储；携带 source/provider/symbol、期末、cumulative、consolidated、观察时间、原始列名和原值。不新建表。只在 coverage/ensure 写入，同行逐家使用同一流程，并刷新现有估值与行情序列。
3. 新 `company_data_financials.py` 只读已存快照并验证哈希；按 provider 留每格最新值，不把自身旧快照当跨源冲突。跨源同格不等保留两值；报告核对只用同期合并读数和原文披露精度半单位。只有 provider 为 sourced；报告不作为通用字段回退。
4. TTM、Q1–Q4、毛利率、ROE、PE/PB 复算从快照计算，`basis=provider_latest`、`input_field_ids` 指向实际输入。TTM/单季要求同一 provider；报告 original_reading 旧计算路径删除。非正利润/净资产、银行/电信毛利口径走缺口。PE/PB 偏差分母为复算值；≤5% verified，否则 conflict/value=null、并列两值。
5. 同行逐指标给状态，只允许 verified/sourced 且同期同口径进入中位数与排名；不足 3 家留缺口。使用原申万二级固定选择，不新增行业来源。
6. 报告通用行只供核对；字段产出保留扣非、分红方案与实施、合并股本行及行业驱动。未采用新浪股本金钱值当股数，未采用 DIVIPROFPAYCASH 当普通股分红，未用含少数股东权益的总权益替代归母权益。
7. 母公司段持续排除；支持表内标题、跨页段落、现金流项目标签断行。真实华能国际解析页把母公司利润表标题放在数字表后，补了“该页仅有母公司标题”的保守排除；不编辑原文。宁德时代夹具保留原行文字及合并/母公司两种金额。
8. 缓存键覆盖本公司及同行的资料版本和 provider ref。报告按页预索引，避免逐块全量扫描；快照行情按 metric/provider 取最新，避免此前 LIMIT 100 被多次 PE/PB 刷新挤掉市值。缓存版本查询把成果身份一次性提取，免去每个同行对大图表 JSON 重复 LIKE 扫描；未新增索引、表或旁路缓存。

### 文件与产出

源码共 7 个文件：

- Stock `backend/app/providers/company_statements.py`
- Stock `backend/app/api/v1/company_data.py`
- Stock `backend/app/services/company_data_coverage.py`
- Stock `backend/app/services/company_data_lenses.py`
- Stock `backend/app/services/company_data_packet.py`
- Stock `backend/app/services/company_data_financials.py`（新增）
- Stock `backend/app/services/company_packet_extract.py`

测试共 3 个文件：`backend/tests/test_company_data_packet.py`、`test_company_data_revision.py`、`test_company_data_provider.py`（新增）。config 未修改。

Stock `artifacts/t7-provider-primary/`：

- `run_live.py`：容器内独立进程，加载冻结源码、调用真实接口、计 provider HTTP 尝试和 GET SQL 写入；不输出参数或凭据。
- `source-bundle.json` / `live.json` / `live.log`：首轮真实 ensure 与 GET，不作为最终耗时结论。
- `final-source-bundle.json` / `final-live.json` / `final-live.log`：第二轮 17 家 ensure（最终财务/provider/ensure 代码），含最终 ensure 结果。
- `final-read-source-bundle.json` / `final-read.json` / `final-read.log`：最终只读 17 家冷/热 GET，加载最后源码，复用第二轮 ensure 已保存快照。
- `final-scoped-hashes.json`：最后 10 个源码/测试文件校验哈希；`profile-cache.log`：真实缓存查询耗时定位。
- `summarize.py`、`matrix.csv`、`gold-comparison.json`、`calculations.json`、`summary.json`、`summary.md`：矩阵、逐格金标、实际计算输入与并列值、四家公司对照。

### 命令、结果与证据等级

以下路径以 Stock 主目录为基准；pytest 在 backend/ 下执行。没有运行 DSH 测试，因为没有 DSH 修改。

```sh
uv run pytest tests/test_company_data_packet.py tests/test_company_data_revision.py tests/test_company_data_provider.py tests/test_company_financials.py tests/test_wiki_company_facts.py tests/test_research_results.py -q
```

最终：**143 passed，4.66 秒**；一个现有 Starlette TestClient/httpx 弃用警告。包含现有 company_statements 与 fetch-data 测试、71 格固定报告回归，以及新增四种状态、每个公式与失效域、TTM/单季来源一致性、同行筛选、5%边界、宁德时代真实片段、标题在表后、行情历史不能挤掉市值、保存/只读快照、ensure 本公司与同行等测试。夹具和 SQLite 只证明确定性契约，不代替真实 provider/PostgreSQL 证据。

迭代记录：初次 apply_patch 从 backend/ 工作目录使用 backend/ 前缀，文件不存在、未修改任何文件；改回主目录后继续。初轮公式测试 138 passed/1 failed：测试错误地要求派生的 TTM 节点本身有 source=provider，改为递归验证叶子输入；之后 139 passed。增加真实发现的母公司标题与市值读数回归后分别 141、143 passed。未放宽公式或金标验收。

真实运行的完整调用形式（两个 ensure 批次使用相同 runner；仅输入/输出文件名不同）：

```sh
python3 - <<'PY'
import subprocess
from pathlib import Path
root = Path('artifacts/t7-provider-primary')
with (root/'final-source-bundle.json').open() as source, (root/'final-live.json').open('w') as output, (root/'final-live.log').open('w') as log:
    result = subprocess.run(['docker', 'exec', '-i', 'stock-research-backend', 'python', '-c', (root/'run_live.py').read_text()], stdin=source, stdout=output, stderr=log)
print('exit_code', result.returncode)
PY
```

结果 exit_code=0，17 家 ensure 与随后 GET 均 200，未出现 provider 诊断、跨源同格冲突或停止条件。第二轮保存财务快照 5,098 条（已插入）；包含本公司与同行的 85 次公司处理，600 次 provider HTTP 尝试。第一轮也实际保存了快照，保留初次轨迹以便审阅，无迁移、无回填写入、未清除旧快照。

最终只读复测：

```sh
python3 - <<'PY'
from pathlib import Path
import json, hashlib, subprocess
root = Path('artifacts/t7-provider-primary')
bundle = json.loads((root/'final-source-bundle.json').read_text())
updated, hashes = [], {}
for name, _ in bundle['sources']:
    path = Path('backend') / Path(*name.split('.')).with_suffix('.py')
    source = path.read_text()
    updated.append([name, source])
    hashes[str(path)] = hashlib.sha256(source.encode()).hexdigest()
bundle.update(sources=updated, source_sha256=hashes, read_only=True, previous_runs=json.loads((root/'final-live.json').read_text())['runs'])
(root/'final-read-source-bundle.json').write_text(json.dumps(bundle, ensure_ascii=False))
paths = list(hashes) + ['backend/tests/test_company_data_packet.py', 'backend/tests/test_company_data_revision.py', 'backend/tests/test_company_data_provider.py']
(root/'final-scoped-hashes.json').write_text(json.dumps({p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}, indent=2))
with (root/'final-read-source-bundle.json').open() as source, (root/'final-read.json').open('w') as output, (root/'final-read.log').open('w') as log:
    result = subprocess.run(['docker', 'exec', '-i', 'stock-research-backend', 'python', '-c', (root/'run_live.py').read_text()], stdin=source, stdout=output, stderr=log)
print('exit_code', result.returncode)
PY
```

结果 exit_code=0，17 家 × 冷/热 GET 全 200、错误清单为空，provider 请求/GET SQL 写入/快照数增量全 0。写入监测使用请求 ContextVar 和 SQLAlchemy before_cursor_execute，仅计当前 GET 的写语句，避免把其他进程全库快照增长误判为 GET 写入。

证据等级：现有 Backend 容器内独立 ASGI HTTP 进程、真实同花顺/新浪及现有行情源、现有 PostgreSQL；传输为 TestClient，不是部署到 8700 的端到端服务验证。因用户禁止重建/重启，沿用 T7.1 独立进程方式。模型未调用。ensure 接口选择当日 2026-10-11；与前轮 2026-10-10 相同财务期间，行情时点为最新交易日 2026-10-09。

```sh
PYTHONPATH=. uv run python ../artifacts/t7-provider-primary/summarize.py
```

结果 exit_code=0；输出 17 公司、255 格状态、71 格金标与计算/同行统计，见下表与产出。

```sh
# Stock 主目录
node scripts/verify-protocol.mjs
git diff --check
# Vibe 主目录
node scripts/verify-protocol.mjs
git diff --check
```

回填前两仓均 verify-protocol: ok、diff --check 无输出退出 0；回填后结果见本文末尾。未使用报告模式、未运行全量测试或格式化无关文件。

### 真正失败的耗时试验与最后结论

首轮 GET 冷读最高 6.44 秒、热读最高 2.20 秒，未达 D8。第二轮缓存查询合并后，冷最高 6.31 秒、热最高 3.05 秒，仍不达标；未以这两轮宣称完成。

真实 profile：cache_versions 共 2.657 秒，其中文档 0.004 秒、provider refs 0.024 秒、多个 object_id LIKE 2.591 秒。JSON 强制解析实测 3.158 秒；单次正则提取身份并 materialize 实测 0.962 秒，因此在原服务模块里改为一次提取。最后一轮 17 家 GET 冷 3.90–4.65 秒、热 1.05–1.32 秒，均满足 ≤5/≤1.5 秒；这是本轮样本性能，未做长期数据量压力测试。

### 字段 × 状态（17 家 × 15 通用字段）

|字段|verified|sourced|conflict|gap|
|---|---:|---:|---:|---:|
|revenue|16|1|0|0|
|gross_margin|0|15|0|2|
|net_profit_attributable|14|3|0|0|
|net_profit_ex_nonrecurring|13|0|0|4|
|operating_cash_flow|14|3|0|0|
|capex_cash|7|10|0|0|
|dividend_paid|0|0|0|17|
|residual_cash|0|0|0|17|
|shares|1|0|0|16|
|dividend_per_share|13|0|0|4|
|price|0|17|0|0|
|pe|17|0|0|0|
|pb|15|0|1|1|
|dividend_yield|0|13|0|4|
|peers|0|17|0|0|
|合计|110|79|1|65|

### 最终 ensure 与 GET 耗时、请求数

冷读指清空本模块所有 packet/readings 缓存后读取；数据库/OS 缓存不清。热读为紧随其后的同条件 GET。最后一轮只读复测没有再次 ensure，其 ensure 耗时/请求数来自第二轮已保存的对应行。

|公司|ensure 秒|GET 冷秒|GET 热秒|provider HTTP尝试|GET请求/SQL写入/快照增量|
|---|---:|---:|---:|---:|---|
|000034.SZ|21.815|4.563|1.212|35|0/0/0|
|000807.SZ|20.824|4.130|1.091|35|0/0/0|
|000933.SZ|23.210|4.214|1.142|35|0/0/0|
|300308.SZ|21.130|4.337|1.319|35|0/0/0|
|300750.SZ|21.110|4.456|1.312|35|0/0/0|
|600011.SH|20.684|4.652|1.182|35|0/0/0|
|600176.SH|20.303|4.121|1.099|35|0/0/0|
|600309.SH|19.822|3.903|1.144|35|0/0/0|
|600585.SH|20.664|4.111|1.110|35|0/0/0|
|600795.SH|21.028|4.381|1.123|35|0/0/0|
|600863.SH|21.720|4.647|1.111|35|0/0/0|
|600900.SH|20.194|4.285|1.116|35|0/0/0|
|600941.SH|20.873|4.071|1.107|35|0/0/0|
|601288.SH|24.855|4.406|1.102|40|0/0/0|
|601811.SH|20.966|4.150|1.062|35|0/0/0|
|601899.SH|21.030|4.027|1.071|35|0/0/0|
|603799.SH|20.219|4.237|1.053|35|0/0/0|

### 计算与同行

TTM 17/17、PE 复算 17/17、PB 复算 16/17、ROE 16/17。17 家均有 4 家固定候选同行，17 家均至少一个指标有 ≥3 家同期间同口径 usable 值；**不等于每家每个指标都能比较**。PE 可算的 17 家都 ≤5%；PB 16 家中 15 家 ≤5%、1 家 conflict；农业银行缺归母净资产输入。

|公司|TTM归母净利 元|PE复算/provider/相对偏差|PB复算/provider/相对偏差|有≥3家可比同行的指标|
|---|---:|---|---|---|
|000034.SZ|592613132.38|38.173302/38.174074/0.002023%|1.979467/1.979507/0.002025%|PE、PB、ROE、营收、归母净利|
|000807.SZ|10970613441.85|8.408646/8.408615/0.000363%|2.417333/2.417324/0.000368%|PE、PB、ROE、营收、归母净利|
|000933.SZ|6882279656.56|8.878599/8.878664/0.000734%|2.207612/2.207628/0.000735%|PE、PB、ROE、营收、归母净利|
|300308.SZ|20453288609.02|44.649152/44.649131/0.000048%|22.911219/22.911209/0.000046%|PB、ROE、营收、归母净利|
|300750.SZ|85000145000|16.208961/16.208956/0.000028%|3.631872/3.631871/0.000019%|PB、ROE、营收、归母净利|
|600011.SH|11733398184|9.806792/9.806794/0.000016%|0.833941/1.783839/113.904795%（conflict）|PE、ROE、营收、归母净利|
|600176.SH|4531715907.24|34.071200/34.071197/0.000009%|4.656945/4.656945/0.000006%|PB、ROE、营收、归母净利|
|600309.SH|16467435026.00|13.345066/13.345072/0.000048%|1.934563/1.934563/0.000024%|PE、PB、ROE、营收、归母净利|
|600585.SH|6225460491|14.740757/14.740769/0.000082%|0.479876/0.479876/0.000007%|PB、ROE、营收、归母净利|
|600795.SH|6488797579.16|14.952847/14.952812/0.000237%|1.610404/1.610400/0.000263%|PE、ROE、营收、归母净利|
|600863.SH|2064779123.16|19.656340/19.656476/0.000693%|1.947064/2.040299/4.788506%|PE、ROE、营收、归母净利|
|600900.SH|36202151477.37|19.593697/19.593687/0.000053%|3.281958/3.281956/0.000057%|PE、ROE、营收、归母净利|
|600941.SH|131794000000|16.129437/16.129439/0.000013%|1.495391/1.495392/0.000048%|PB、ROE、营收、归母净利|
|601288.SH|297912000000|8.200012/8.200011/0.000013%|缺口/provider 0.854748|PE、营收、归母净利|
|601811.SH|1366375624.27|18.882070/18.881788/0.001493%|1.684327/1.684302/0.001502%|PB、ROE、营收、归母净利|
|601899.SH|67655382557|12.105423/12.105417/0.000047%|3.978281/4.055082/1.930511%|PE、PB、ROE、营收、归母净利|
|603799.SH|6906848067.22|9.759879/9.759818/0.000623%|1.325123/1.325114/0.000642%|PE、PB、ROE、营收、归母净利|

本表四舍五入仅供阅读；JSON 保留 Decimal 原精度及每个实际输入 ref。

### 四家公司逐字段对照

金额单位元，price/DPS 为元/股，毛利率/ROE/股息率为 %；PE/PB 为倍，行业无关措辞未新增。年度通用财务为 FY2025，price 是 2026-10-09，PE/PB 是当日 2026-10-11，股本尝试期末为 2026H1。未给数的格保持 null。

|公司|字段|状态|结果|核对或缺口|
|---|---|---|---:|---|
|宁德时代|revenue|verified|423701834000|provider 与同期报告一致|
|宁德时代|gross_margin|sourced|26.27284757|provider 收入/营业成本复算|
|宁德时代|net_profit_attributable|verified|72201282000|provider 与同期报告一致|
|宁德时代|net_profit_ex_nonrecurring|verified|64507864000|报告原文|
|宁德时代|operating_cash_flow|verified|133219982000|provider 与同期报告一致|
|宁德时代|capex_cash|verified|42344558000|合并 42,344,558 千元；母公司 2,056,300 千元排除|
|宁德时代|dividend_paid|gap|null|缺上一年度方案、基数和年内实施/明确无中期分红证据|
|宁德时代|residual_cash|gap|null|实付分红输入缺口|
|宁德时代|shares|gap|null|未定位合并股本行及 1 元面值|
|宁德时代|dividend_per_share|verified|6.957|报告方案|
|宁德时代|price|sourced|297.75|保存的最新交易日收盘|
|宁德时代|pe|verified|16.20896058|provider 16.208956，≤5%|
|宁德时代|pb|verified|3.63187169|provider 3.631871，≤5%|
|宁德时代|dividend_yield|sourced|2.33652393|方案 DPS/当前价格|
|宁德时代|peers|sourced|4家|PB、ROE、营收、归母净利可比；PE不足3家|
|宁德时代|roe|sourced|24.72486694|年度归母利润/平均归母权益|
|华友钴业|revenue|sourced|81018674069.68|没有符合契约的 FY2025 报告核对读数|
|华友钴业|gross_margin|sourced|17.46951236|provider 复算|
|华友钴业|net_profit_attributable|sourced|6110378757.84|provider 主来源|
|华友钴业|net_profit_ex_nonrecurring|gap|null|报告行列缺口|
|华友钴业|operating_cash_flow|sourced|4011961997.48|provider 主来源|
|华友钴业|capex_cash|sourced|10757625082.43|provider 主来源|
|华友钴业|dividend_paid|gap|null|付款方案/基数/实施证据缺口|
|华友钴业|residual_cash|gap|null|实付分红输入缺口|
|华友钴业|shares|gap|null|未定位合并股本行及 1 元面值|
|华友钴业|dividend_per_share|verified|0.50|报告方案|
|华友钴业|price|sourced|35.6|保存的最新交易日收盘|
|华友钴业|pe|verified|9.75987880|provider 9.759818，≤5%|
|华友钴业|pb|verified|1.32512250|provider 1.325114，≤5%|
|华友钴业|dividend_yield|sourced|1.40449438|方案 DPS/当前价格|
|华友钴业|peers|sourced|4家|五项均可比|
|华友钴业|roe|sourced|14.33670025|年度归母利润/平均归母权益|
|华能蒙电|revenue|verified|21050468832.2|provider 与同期报告一致|
|华能蒙电|gross_margin|sourced|23.15676149|provider 复算|
|华能蒙电|net_profit_attributable|verified|2493439065.89|provider 与同期报告一致|
|华能蒙电|net_profit_ex_nonrecurring|verified|1858282854.91|报告原文|
|华能蒙电|operating_cash_flow|verified|6731988052.2|provider 与同期报告一致|
|华能蒙电|capex_cash|verified|3771344604.19|provider 与同期报告一致|
|华能蒙电|dividend_paid|gap|null|付款方案/基数/实施证据缺口|
|华能蒙电|residual_cash|gap|null|实付分红输入缺口|
|华能蒙电|shares|gap|null|未定位合并股本行及 1 元面值|
|华能蒙电|dividend_per_share|verified|0.22|报告方案|
|华能蒙电|price|sourced|5.18|保存的最新交易日收盘|
|华能蒙电|pe|verified|19.65633977|provider 19.656476，≤5%|
|华能蒙电|pb|verified|1.94706373|provider 2.040299，偏差4.788506%，≤5%|
|华能蒙电|dividend_yield|sourced|4.24710425|方案 DPS/当前价格|
|华能蒙电|peers|sourced|4家|PE、ROE、营收、归母净利可比；PB不足3家|
|华能蒙电|roe|sourced|13.62214717|年度归母利润/平均归母权益|
|农业银行|revenue|verified|725306000000|同花顺/新浪同值，报告一致|
|农业银行|gross_margin|gap|null|银行不套工业毛利率|
|农业银行|net_profit_attributable|verified|291041000000|同花顺/新浪同值，报告一致|
|农业银行|net_profit_ex_nonrecurring|gap|null|报告行列缺口|
|农业银行|operating_cash_flow|sourced|2112907000000|provider 主来源|
|农业银行|capex_cash|verified|27348000000|provider 与同期报告一致|
|农业银行|dividend_paid|gap|null|付款方案/基数/实施证据缺口|
|农业银行|residual_cash|gap|null|银行不套工业自由现金口径|
|农业银行|shares|gap|null|未定位合并股本行及 1 元面值|
|农业银行|dividend_per_share|verified|0.2495|报告方案|
|农业银行|price|sourced|6.98|保存的最新交易日收盘|
|农业银行|pe|verified|8.20001208|provider 8.200011，≤5%|
|农业银行|pb|gap|null|provider 0.854748；D2 归母净资产输入缺口|
|农业银行|dividend_yield|sourced|3.57449857|方案 DPS/当前价格|
|农业银行|peers|sourced|4家|PE、营收、归母净利可比；PB/ROE缺口|
|农业银行|roe|gap|null|D2 归母净资产输入缺口|

### 金标与缺口、停止条件

- T7-G 71 格：**42 一致、29 缺口、0 不一致**。通用财务逐格用目标期末快照+报告核对；专属字段用符合报告契约的读数，股数要求合并股本行，实付分红只接受方案计算。未把 conflict 作为一致，未用 provider 通用值覆盖行业/股数金标。
- 逐格原值、单位、期末、选择/缺口、引用在 `gold-comparison.json`，缺口清单在 `summary.md`。主要仍缺报告里的扣非、实付分红方案、股本行/面值与行业行列；新增 provider 不应填这些格。宁德时代并非 T7-G 71 格内公司，另外用真实原文片段及真实快照单独回归。
- 农业银行原始列名为 PARECOMPSHARRIGHT；D2 冻结仅允许 PARESHARRIGH，本轮没有自行将前者映射，也没有借报告归母权益充当 D1 输入，因此 PB/ROE 留缺口，交 Claude 决定是否修订。
- 华能国际（600011.SH）PB：provider 1.783839，复算 0.8339406330950167668946199964，相对偏差 113.9047948%；标 conflict，主 value=null，两值、市值与归母权益输入均保留。尚未证实差异具体来源，不能擅自用优先股/永续债扣减改变 D4 分母。
- 同花顺/新浪同格冲突数为 0；没有鉴权/限流诊断，没有超过90秒，没有新来源、凭据或表结构需求，也没有发现改动范围重叠，未触发 §7 的停止条件。失败/限流分支没有真实覆盖；沿用现有 provider 客户端与限流器，不改范围外 rate_limit 配置。
- 手工审阅范围内实际 diff，核对报表分工、只读路径、输入引用和缓存依赖；无第三方 diff 审阅，Claude 审阅待进行。两仓其他并行变动不在本轮结论范围。

### 收尾三问

冻结决定的长期“为什么”已由原 Task/Checklist 承接，没有新增长期设计决定；重复验收已补进相关测试（四状态、公式、母公司段与缓存依赖）；没有改范围外不变量或产品工具。待 Claude 审阅后再决定部署与银行映射补充，本轮到此停止。

### 回填后门禁与冻结校验

两仓分别在主目录执行 `node scripts/verify-protocol.mjs` 与 `git diff --check`：四条命令均退出 0；两次 verify-protocol 均输出 `verify-protocol: ok`，diff --check 均无输出。

Stock 主目录执行：

```sh
python3 - <<'PY'
from pathlib import Path
import json, hashlib
root = Path('artifacts/t7-provider-primary')
hashes = json.loads((root/'final-scoped-hashes.json').read_text())
print('scoped_source_changed', [p for p,h in hashes.items() if hashlib.sha256(Path(p).read_bytes()).hexdigest() != h])
data = json.loads((root/'final-read.json').read_text())
print('GET_source_hashes_match', all(h == data['source_sha256'].get(p) for p,h in hashes.items() if '/app/' in p))
print('companies', len(data['packets']), 'errors', data['errors'], 'SQL_writes', sum(r['cold_sql_writes'] + r['hot_sql_writes'] for r in data['runs']))
PY
```

退出 0；`scoped_source_changed []`、`GET_source_hashes_match True`、`companies 17 errors [] SQL_writes 0`。交接与产出对应最后源码，未发生范围内重叠编辑。本轮停止，等 Claude 审阅。

另核对第二轮 ensure 与最后只读进程的源码：前者哈希键为模块名、后者为文件路径，直接比两个字典不能判定源码变化；因此改为比较冻结 bundle 内的实际 sources，完整命令如下。

```sh
python3 - <<'PY'
from pathlib import Path
import json
p = Path('artifacts/t7-provider-primary')
a = json.loads((p/'final-source-bundle.json').read_text())
b = json.loads((p/'final-read-source-bundle.json').read_text())
a_sources, b_sources = dict(a['sources']), dict(b['sources'])
print('ensure_vs_read_source_differences', [k for k in b_sources if a_sources[k] != b_sources[k]])
PY
```

结果仅 `app.services.company_packet_extract`、`app.services.company_data_packet` 两个只读构建模块变化（母公司页排除、最新市值读取与缓存查询）；provider 取数、coverage/ensure 写路径、计算与路由源码均相同。最后只读复测不补取、不补写；第二轮 ensure 证据与最后读取证据分别保留。追加记录后再跑两仓 verify-protocol 与 diff --check，均退出 0。

## 2026-10-11 · Claude 审阅

- 结论：通过，待统一重建后用户验收。金标一致 24→42、不一致保持 0；TTM 由 T7.1 的多数缺口变为 17/17；宁德时代购建资产付现改为合并数。
- Claude 修一处：新浪银行资产负债表的归母权益列名为 `PARECOMPSHARRIGHT`（`columns.md` 已登记，12/12 有值），D2 只写了 `PARESHARRIGH` 是规划遗漏；已加入 `SINA_COLUMNS`，相关 120 项测试通过。农业银行 PB/ROE 需重建后 ensure 一次再看。
- 华能国际 PB 冲突（复算 0.83 / provider 1.78，PE 两者一致 9.81）：复算用的归母权益含其他权益工具（永续债），provider 口径大概率为普通股权益。并列显示符合 D3；扣除其他权益工具的口径改进留给 T7.2 定稿时一并决定，不在本 Task 内补。

## 2026-10-12 · 重建后接口抽查（Claude）

- 容器重建后镜像含 `PARECOMPSHARRIGHT` 与 `scenario_price`，`dreaming.py` 已不在镜像中。
- 农业银行 601288.SH 重新补数用时 42s（2025Q3 季报排队中）。数据包冷取 4.5s：verified 5、sourced 7、gap 5、conflict 1。
- 农业银行的归母净资产取到 2026H1 33,280.14 亿元（新浪 `PARECOMPSHARRIGHT`），ROE 9.20%，PE 8.38 已核对。
- PB 冲突：复算 0.750，同花顺 0.873，偏差 16.4%。同花顺口径约等于普通股权益（扣除优先股和永续债），与华能国际同因，方法留 T7.2。
- `scenario_price` 真实接口：三档 5.60 / 7.16 / 8.86 元，basis=forecast，附计算凭据；少一档时返回 400 `insufficient_inputs`。抽查留下 1 条计算记录。
- 小缺口：ensure 接口收到不带市场后缀的代码时返回 500，应返回 422。不阻塞，留 T7.2 处理。
