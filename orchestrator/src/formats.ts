/**
 * Core 认识的 JSON Schema `format`。
 *
 * 为什么单独一个文件:`plugin.ts` 与 `schemas.ts` 都要用它,而 `schemas.ts` import `plugin.ts` ——
 * 放任一边都成环。
 *
 * 🔴 **只放通用格式,不放任何垂类概念**。日期、时间戳这类是"数据长什么样",与做哪一门生意无关;
 *    主体代码、市场枚举那种一律留在垂类包里(它们是 `pattern` / `enum`,不需要 format)。
 *
 * 🔴 自己实现而不是装 `ajv-formats`:少一个依赖。⚠️ 未知 format 会被 ajv 静默忽略,新增 format 时要在这里注册。
 */

/** 真实存在的日历日:`2026-02-31` / `2026-99-99` 这种"长得像"的一律不算 */
export function isCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // 回读三个分量:JS 的 Date 会把 2 月 31 日**滚**到 3 月 3 日,不回读就发现不了
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const CORE_FORMATS: Record<string, (s: string) => boolean> = { date: isCalendarDate };

interface FormatSink {
  addFormat: (name: string, def: { type: "string"; validate: (s: string) => boolean }) => unknown;
}

/** 把 Core 的 format 装到一个 Ajv 实例上。**所有编译垂类字段 schema 的地方都要调它** */
export function applyCoreFormats<T extends FormatSink>(ajv: T): T {
  for (const [name, validate] of Object.entries(CORE_FORMATS)) ajv.addFormat(name, { type: "string", validate });
  return ajv;
}
