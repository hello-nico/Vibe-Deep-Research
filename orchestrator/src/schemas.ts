import AjvModule, { type ValidateFunction } from "ajv";

import { applyCoreFormats } from "./formats.ts";


type AjvCtor = (typeof import("ajv"))["default"];
const Ajv = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as AjvCtor;

const ajv = applyCoreFormats(new Ajv({ allErrors: true, strict: false }));

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
