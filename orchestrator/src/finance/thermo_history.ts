
import fs from "node:fs";

import path from "node:path";









export const THERMO_DIR_REL = path.join("knowledge", "thermometers");

export const THERMO_MAX_OBS = 3000;

export const THERMO_SCHEMA_VERSION = 1;

export interface ThermoObservation {
  run_id: string;
  /** 运行日期(Asia/Shanghai,按 fetched_at) */
  run_date: string;
  /** 观测日期 = 证据 as_of */
  as_of: string;
  fetched_at: string;
  record_key: string;
  field: string;
  value: number;
  unit: string;
  period: string;
  /** 那次运行里的原始响应路径(相对那次 run 目录;只作溯源,不在本次 raw/) */
  raw_ref: string | null;
  source: string;
}

export interface ThermoReadResult { obs: ThermoObservation[]; dropped: number; unreadable: boolean; exists: boolean }
interface ThermoLedgerFile { schema_version: number; endpoint: string; observations: ThermoObservation[] }

const RUN_ID_RE = /^[A-Za-z0-9_.-]{1,80}$/;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_RE = /^[a-z0-9_]{1,80}$/;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const RECORD_KEY_RE = /^[A-Za-z0-9:._x-]{1,32}$/;

const PERIOD_RE = /^\d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?$/;

const UNIT_RE = /^[\p{L}\p{N}%/·._ -]{1,16}$/u;

const SOURCE_RE = /^[A-Za-z0-9+:._ -]{1,32}$/;

export const THERMO_MAX_FILE_BYTES = 16 * 1024 * 1024;

export const THERMO_MAX_PARSE_OBS = THERMO_MAX_OBS * 4;

export function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidPeriod(p: string): boolean {
  if (!PERIOD_RE.test(p)) return false;
  const [a, b] = p.split("..");
  return isRealDate(a) && (b === undefined || (isRealDate(b) && b >= a));
}

export function thermoDir(cfg: { dataRoot: string }): string {
  return path.join(cfg.dataRoot, THERMO_DIR_REL);
}

export function thermoLedgerPath(cfg: { dataRoot: string }, endpoint: string): string {
  if (!/^[a-z0-9_]{1,80}$/.test(endpoint)) throw new Error(`端点 id 非法:${endpoint}`);
  return path.join(thermoDir(cfg), `${endpoint}.json`);
}

export function validateObservation(o: unknown): ThermoObservation | null {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const str = (k: string, re: RegExp) => typeof r[k] === "string" && re.test(r[k] as string) ? (r[k] as string) : null;
  const run_id = str("run_id", RUN_ID_RE), run_date = str("run_date", DATE_RE), as_of = str("as_of", DATE_RE), fetched_at = str("fetched_at", ISO_RE);
  const record_key = str("record_key", RECORD_KEY_RE), field = str("field", FIELD_RE), unit = str("unit", UNIT_RE), period = str("period", PERIOD_RE), source = str("source", SOURCE_RE);
  const value = typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
  // raw_ref 只认平铺的 raw/<文件名>(不含任何斜杠 → 没有 raw/../x 这种别名;Codex thermo-r2)
  const raw_ref = r.raw_ref === null || r.raw_ref === undefined ? null : typeof r.raw_ref === "string" && /^raw\/[^\/\\\x00-\x1f\x7f]{1,200}$/.test(r.raw_ref) ? r.raw_ref : undefined;
  if (!run_id || !run_date || !as_of || !fetched_at || !record_key || !field || !unit || !period || !source || value === null || raw_ref === undefined) return null;
  if (!isRealDate(run_date) || !isRealDate(as_of) || !isValidPeriod(period)) return null;
  return { run_id, run_date, as_of, fetched_at, record_key, field, value, unit, period, raw_ref, source };
}

export function readThermoLedger(file: string): ThermoReadResult {
  if (!fs.existsSync(file)) return { obs: [], dropped: 0, unreadable: false, exists: false };
  let parsed: unknown;
  try {
    if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > THERMO_MAX_FILE_BYTES) return { obs: [], dropped: 0, unreadable: true, exists: true };
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return { obs: [], dropped: 0, unreadable: true, exists: true }; }
  const p = parsed as Partial<ThermoLedgerFile> | null;
  if (!p || typeof p !== "object" || Array.isArray(p) || p.schema_version !== THERMO_SCHEMA_VERSION || !Array.isArray(p.observations) || p.observations.length > THERMO_MAX_PARSE_OBS) return { obs: [], dropped: 0, unreadable: true, exists: true };
  const obs: ThermoObservation[] = [];
  let dropped = 0;
  for (const o of p.observations) { const v = validateObservation(o); if (v) obs.push(v); else dropped++; }
  return { obs, dropped, unreadable: false, exists: true };
}
