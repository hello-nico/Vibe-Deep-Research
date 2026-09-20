/**
 * 产品本地选择：自选、加入研究名单、持久界面偏好。
 * 路径由 dataRoot 派生，不用临时目录、仓库源码路径或浏览器存储当权威。
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { ServiceError, safePath, type ServiceContext } from "./service.ts";

const SCHEMA_VERSION = "1";
const PREF_KEYS = new Set(["vr-sidebar", "vr-intel-open2", "vr-signals-open2", "vr-theme", "vr-watchlist-live", "vr-company-roster-view", "vr-library-view"]);
const SYMBOL_RE = /^(?:\d{6}|\d{5}\.HK|[A-Z][A-Z0-9]{0,9}(?:[.-][A-Z0-9]{1,4})?)$/;

const dbs = new Map<string, DatabaseSync>();

function nowIso(): string {
  return new Date().toISOString();
}

function openDb(ctx: Pick<ServiceContext, "dataRoot">): DatabaseSync {
  const file = safePath(ctx, "client", "choices.sqlite");
  const hit = dbs.get(file);
  if (hit) return hit;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS watchlist (symbol TEXT PRIMARY KEY, added_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS research_roster (symbol TEXT PRIMARY KEY, added_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
  `);
  const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value?: string } | undefined;
  if (!version) {
    db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
  }
  migrateWatch(ctx, db);
  markRosterInitialized(db);
  migrateRosterOpened(db);
  dbs.set(file, db);
  return db;
}

function migrateWatch(ctx: Pick<ServiceContext, "dataRoot">, db: DatabaseSync): void {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'watch_migrated'").get() as { value?: string } | undefined;
  if (done?.value === "1") return;
  const ledger = path.join(path.resolve(ctx.dataRoot), "ledger", "watch.json");
  if (fs.existsSync(ledger) && fs.lstatSync(ledger).isFile()) {
    let payload: unknown;
    try { payload = JSON.parse(fs.readFileSync(ledger, "utf8")); }
    catch { throw new ServiceError("watch_migrate", "旧自选台账不是合法 JSON，已停止迁移"); }
    const records = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { records?: unknown }).records : undefined;
    if (!Array.isArray(records)) {
      throw new ServiceError("watch_migrate", "旧自选台账缺少 records");
    }
    const insert = db.prepare("INSERT OR IGNORE INTO watchlist(symbol, added_at) VALUES (?, ?)");
    db.exec("BEGIN");
    try {
      for (const row of records) {
        if (!row || typeof row !== "object") continue;
        const symbol = String((row as { symbol?: unknown }).symbol ?? "").trim();
        if (!SYMBOL_RE.test(symbol)) continue;
        const added = String((row as { created_at?: unknown }).created_at ?? nowIso());
        insert.run(symbol, added);
      }
      db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('watch_migrated', '1')").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else {
    db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('watch_migrated', '1')").run();
  }
}

function migrateRosterOpened(db: DatabaseSync): void {
  const cols = db.prepare("PRAGMA table_info(research_roster)").all() as { name: string }[];
  if (cols.some(col => col.name === "last_opened_at")) return;
  db.exec("ALTER TABLE research_roster ADD COLUMN last_opened_at TEXT");
}

function markRosterInitialized(db: DatabaseSync): void {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'roster_initialized'").get() as { value?: string } | undefined;
  if (done?.value === "1") return;
  // 没有历史「显式加入研究」证据：空名单开始，不从 Wiki/自选回填。
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('roster_initialized', '1')").run();
}

function normalizeSymbol(value: unknown): string {
  const symbol = String(value ?? "").trim();
  if (!SYMBOL_RE.test(symbol)) throw new ServiceError("bad_symbol", `无法识别的代码 ${JSON.stringify(String(value ?? "")).slice(0, 40)}`);
  return symbol;
}

export function listWatch(ctx: Pick<ServiceContext, "dataRoot">): { symbols: string[] } {
  const rows = openDb(ctx).prepare("SELECT symbol FROM watchlist ORDER BY added_at ASC, symbol ASC").all() as { symbol: string }[];
  return { symbols: rows.map((row) => row.symbol) };
}

export function addWatch(ctx: Pick<ServiceContext, "dataRoot">, symbol: unknown): { symbols: string[]; added: boolean } {
  const code = normalizeSymbol(symbol);
  const result = openDb(ctx).prepare("INSERT OR IGNORE INTO watchlist(symbol, added_at) VALUES (?, ?)").run(code, nowIso());
  return { ...listWatch(ctx), added: Number(result.changes) > 0 };
}

export function removeWatch(ctx: Pick<ServiceContext, "dataRoot">, symbol: unknown): { symbols: string[]; removed: boolean } {
  const code = normalizeSymbol(symbol);
  const result = openDb(ctx).prepare("DELETE FROM watchlist WHERE symbol = ?").run(code);
  return { ...listWatch(ctx), removed: Number(result.changes) > 0 };
}

export function listResearchRoster(ctx: Pick<ServiceContext, "dataRoot">): { symbols: string[] } {
  const rows = openDb(ctx).prepare("SELECT symbol FROM research_roster ORDER BY COALESCE(last_opened_at, added_at) DESC, symbol ASC").all() as { symbol: string }[];
  return { symbols: rows.map((row) => row.symbol) };
}

export function addResearchSymbol(ctx: Pick<ServiceContext, "dataRoot">, symbol: unknown): { symbols: string[]; added: boolean } {
  const code = normalizeSymbol(symbol);
  const now = nextRosterTime(ctx);
  const result = openDb(ctx).prepare("INSERT OR IGNORE INTO research_roster(symbol, added_at, last_opened_at) VALUES (?, ?, ?)").run(code, now, now);
  return { ...listResearchRoster(ctx), added: Number(result.changes) > 0 };
}

export function touchResearchSymbol(ctx: Pick<ServiceContext, "dataRoot">, symbol: unknown): { symbols: string[]; touched: boolean } {
  const code = normalizeSymbol(symbol);
  const result = openDb(ctx).prepare("UPDATE research_roster SET last_opened_at = ? WHERE symbol = ?").run(nextRosterTime(ctx), code);
  return { ...listResearchRoster(ctx), touched: Number(result.changes) > 0 };
}

function nextRosterTime(ctx: Pick<ServiceContext, "dataRoot">): string {
  const row = openDb(ctx).prepare("SELECT MAX(COALESCE(last_opened_at, added_at)) AS latest FROM research_roster").get() as { latest: string | null };
  // Keep successive opens ordered even when the clock has not advanced a millisecond.
  return new Date(Math.max(Date.now(), (Date.parse(row.latest || "") || 0) + 1)).toISOString();
}

export function removeResearchSymbol(ctx: Pick<ServiceContext, "dataRoot">, symbol: unknown): { symbols: string[]; removed: boolean } {
  const code = normalizeSymbol(symbol);
  const result = openDb(ctx).prepare("DELETE FROM research_roster WHERE symbol = ?").run(code);
  return { ...listResearchRoster(ctx), removed: Number(result.changes) > 0 };
}

export function listPrefs(ctx: Pick<ServiceContext, "dataRoot">): Record<string, string> {
  const rows = openDb(ctx).prepare("SELECT key, value FROM prefs").all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (PREF_KEYS.has(row.key)) out[row.key] = row.value;
  }
  return out;
}

export function setPref(ctx: Pick<ServiceContext, "dataRoot">, key: unknown, value: unknown): Record<string, string> {
  const name = String(key ?? "").trim();
  if (!PREF_KEYS.has(name)) throw new ServiceError("bad_pref", `不是可持久化的界面偏好：${name}`);
  if (typeof value !== "string") throw new ServiceError("bad_pref", "偏好值必须是字符串");
  if (value.length > 64) throw new ServiceError("bad_pref", "偏好值过长");
  openDb(ctx).prepare("INSERT OR REPLACE INTO prefs(key, value, updated_at) VALUES (?, ?, ?)").run(name, value, nowIso());
  return listPrefs(ctx);
}

export function closeClientStores(): void {
  for (const db of dbs.values()) db.close();
  dbs.clear();
}
