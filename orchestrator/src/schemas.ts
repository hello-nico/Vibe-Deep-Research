import AjvModule, { type ValidateFunction } from "ajv";

import { applyCoreFormats } from "./formats.ts";


import { currentPlugin } from "./plugin.ts";


type AjvCtor = (typeof import("ajv"))["default"];
const Ajv = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as AjvCtor;

const ajv = applyCoreFormats(new Ajv({ allErrors: true, strict: false }));

const ISO_TS = "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2})?([.+\\-Z].*)?$";

const DATE = "^\\d{4}-\\d{2}-\\d{2}$";

export const evidenceItemSchema = () => ({
  type: "object",
  additionalProperties: false,
  required: ["id", "symbol", "market", "field", "value", "unit", "currency", "period", "as_of", "source", "endpoint",
    "fetched_at", "adjustment", "raw_ref"],
  properties: {
    id: { type: "string", pattern: "^ev-[0-9a-f]{6,}$" },
    symbol: { type: "string", minLength: 1 },
    market: { type: "string", enum: [...currentPlugin().evidence.markets] },
    field: { type: "string", minLength: 1 },
    value: { type: ["number", "string", "boolean", "null"] },
    unit: { type: "string" },
    currency: { type: "string" },
    period: { type: "string", minLength: 1 },
    as_of: { type: "string", pattern: DATE },
    source: { type: "string", minLength: 1 },
    endpoint: { type: "string", minLength: 1 },
    fetched_at: { type: "string", pattern: ISO_TS },
    adjustment: { type: "string", enum: [...currentPlugin().evidence.adjustments] },
    raw_ref: { type: ["string", "null"] },
    note: { type: "string" },
    record_key: { type: "string" },
  },
} as const);

export const fetchEnvelopeSchema = () => ({
  type: "object",
  additionalProperties: false,
  required: ["script", "symbol", "market", "status", "fetched_at", "used_sources", "evidence", "extra", "errors"],
  properties: {
    script: { type: "string", minLength: 1 },
    symbol: { type: "string" },
    market: { type: "string", enum: [...currentPlugin().evidence.markets, ""] },
    status: { type: "string", enum: ["ok", "partial", "failed"] },
    fetched_at: { type: "string", pattern: ISO_TS },
    primary_source: { type: ["string", "null"] },
    used_sources: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: evidenceItemSchema() },
    extra: { type: "object" },
    errors: { type: "array" },
    missing: { type: "array" },
  },
} as const);

export const calcRecordSchema = {
  type: "object",
  additionalProperties: false,
  required: ["calculation_id", "function", "calc_version", "inputs", "inputs_resolved", "inputs_refs", "output"],
  properties: {
    calculation_id: { type: ["string", "null"], pattern: "^calc-[0-9a-f]{16}$" },
    function: { type: "string", minLength: 1 },
    calc_version: { type: "string" },
    inputs: { type: ["object", "null"] },
    inputs_resolved: { type: "object" },
    inputs_refs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref_type", "ref_id"],
        properties: { ref_type: { type: "string", enum: ["evidence", "calculation"] }, ref_id: { type: "string" } },
        oneOf: [
          { properties: { ref_type: { const: "evidence" }, ref_id: { pattern: "^ev-[0-9a-f]{6,}$" } } },
          { properties: { ref_type: { const: "calculation" }, ref_id: { pattern: "^calc-[0-9a-f]{16}$" } } },
        ],
      },
    },
    output: {
      type: "object",
      additionalProperties: false,
      required: ["status", "value", "unit", "reason", "details"],
      properties: {
        status: { type: "string", enum: ["ok", "not_meaningful", "error"] },
        value: { type: ["number", "null"] },
        unit: { type: "string" },
        reason: { type: "string" },
        details: { type: "object" },
        // calc 0.3.2:展示层字符串(cli 层附加;旧记录可无)
        display: { type: ["string", "null"] },
      },
    },
  },
} as const;

const compiled = new Map<string, ValidateFunction>();

function compile(key: string, schema: object): ValidateFunction {
  const cached = compiled.get(key);
  if (cached) return cached;
  const v: ValidateFunction = ajv.compile(schema);
  compiled.set(key, v);
  return v;
}

export function validateWith(key: string, schema: object, data: unknown): string[] {
  const v = compile(key, schema);
  if (v(data)) return [];
  return (v.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? ""}${e.params ? " " + JSON.stringify(e.params) : ""}`);
}

export const validateFetchEnvelope = (d: unknown) => validateWith("fetch", fetchEnvelopeSchema(), d);

export const validateEvidenceItem = (d: unknown) => validateWith("evidence", evidenceItemSchema(), d);

export const validateCalcRecord = (d: unknown) => validateWith("calc", calcRecordSchema, d);
