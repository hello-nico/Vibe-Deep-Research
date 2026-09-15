import type { Plugin } from "../plugin.ts";
import { FINANCE_ENUM_LABELS,FINANCE_FIELD_LABELS,FINANCE_LEDGER_KINDS } from "./ledger_kinds.ts";
import { FINANCE_PAGE_CONTEXT,FINANCE_PAGE_QUERIES } from "./page_queries.ts";
import { readThermoLedger,thermoLedgerPath } from "./thermo_history.ts";
export const FINANCE_PLUGIN: Plugin = {
id: "finance",
evidence: {
    /** 证券市场代码 */
    markets: ["SH", "SZ", "BJ", "CN", "US", "HK", "TW"],
    /** 复权口径:前复权 / 后复权 / 不复权 / 不适用 */
    adjustments: ["none", "qfq", "hfq", "not_applicable"],
    /** 这些区域码**可以**带全市场读数(大宗、DRAM 现货这类) */
    marketWideCodes: ["CN", "US", "HK"],
    /** CN **只**用于全市场读数:A 股个股用 SH / SZ / BJ,美股港股则是个股与全市场共用同一代码 */
    marketWideOnlyCodes: ["CN"],
  },
seriesFor: (dataRoot, endpoint) => {
    const r = readThermoLedger(thermoLedgerPath({ dataRoot }, endpoint));
    return { observations: r.obs, exists: r.exists, unreadable: r.unreadable, dropped: r.dropped };
  },
marketRegion: (market: string): string => {
    const m = (market || "").toUpperCase();
    if (m === "US") return "US";
    if (m === "HK") return "HK";
    if (m === "" || m === "SH" || m === "SZ" || m === "BJ" || m === "CN") return "CN";
    throw new Error(`未知市场 ${market}(只接受 SH/SZ/BJ/CN/US/HK 或空)`);
  },
pageQueries: FINANCE_PAGE_QUERIES,
pageContext: FINANCE_PAGE_CONTEXT,
ledger: { kinds: FINANCE_LEDGER_KINDS, fieldLabels: FINANCE_FIELD_LABELS, enumLabels: FINANCE_ENUM_LABELS }
};
