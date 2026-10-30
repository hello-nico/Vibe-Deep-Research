# 公司专项公告可检索性（2026-10-26）

## 1. 问题

「计提资产减值准备」这类专项公告，资料库有没有、Agent 能不能查到；对话为何说「减值明细未披露」。对应 [公司专项公告可检索性摸底](../../tasks/archived/公司专项公告可检索性摸底_Task_2026-10-26.md)。不提方案。

## 2. 方法与数据集

华友 10-20–10-26；已研究 11 家近 30 天（2026-09-26 起）。公开列表：东财 `np-anotice-stock`（巨潮 hisAnnouncement 本轮 0 条，用东财替代，与产品 `eastmoney.announcement` 同源）。我们：8700 只读 wiki/stocks `documents`、`feed/announcements`。Agent：`source_list_documents`（只列已 ingest）。专项口径：标题含减值、经营数据、产销、电量完成、投产、重大合同。

## 3. 环境

2026-10-26。Backend 127.0.0.1:8700。未 ensure、未碰 5930。

## 4. 结果

**华友：** 东财 10-24 有「关于计提资产减值准备的公告」。资料库 `announcement` **0 条**。动态 `feed/announcements` **能列出该标题**，`document_id` 为 null（直播补缺，未入库）。`source_list_documents(documentType: announcement)` **空**，无法 `source_get_index` / 读原文。对话只用了 `quarterly_report`，库内有三季报、无该公告。

卡点：专项公告**未入库**；Agent 工具只扫已 ingest 文档，没有公告列表工具。动态页能看到标题，对话读不到正文。

feed 补缺规则：该公司库内 announcement 为空才直播。华友为空故 feed 有减值；长江电力库内已有「增持」2 条，feed 只有这 2 条，**10-13 发电量完成情况公告东财有、feed 无、库无**。

近 30 天 11 家专项见 [results.csv](results.csv)：减值 1（华友）、电量/经营 2（长电、华能国际）。投产、重大合同 0。11 家里 Agent 能 `list` 到的专项：**无一条在近 30 天窗口内**（万华半年经营数据已入库但不在这 30 天东财列表）。

## 5. 结论与适用边界

「减值明细未披露」不是季报没写附注这么简单：公开专项公告在，资料库和 Agent 检索链上都没有。不能推出抓取已覆盖公告。巨潮本轮列表 0，日期与标题以东财为准。

## 6. 重跑

东财公告列表 + GET 8700 上述三个接口。原始 `.local/announcement-probe/`。
