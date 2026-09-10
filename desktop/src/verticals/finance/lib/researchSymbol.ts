/** 研报上传：页面可填 6 位或带交易所后缀，请求只发 6 位 A 股代码。 */
export function researchUploadSymbol(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  return /^(\d{6})\.(SH|SZ|BJ)$/.exec(value)?.[1]
    ?? /^(\d{6})$/.exec(value)?.[1]
    ?? /^(?:SH|SZ|BJ)(\d{6})$/.exec(value)?.[1]
    ?? null;
}

export function asResearchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/market suffix|should match pattern|string_pattern_mismatch/i.test(message)) {
    return "公司代码无法识别，请核对 6 位 A 股代码后重试";
  }
  if (/^Error: /.test(message)) return asResearchErrorMessage(message.slice(7));
  return message;
}

export function researchErrorMessage(status: number, value: unknown): string {
  const detail = value && typeof value === "object" && value !== null && "detail" in value
    ? (value as { detail: unknown }).detail
    : undefined;
  if (typeof detail === "string" && detail.trim()) return asResearchErrorMessage(detail);
  if (Array.isArray(detail)) {
    const text = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && item !== null && "msg" in item) return String((item as { msg: unknown }).msg);
      return "";
    }).filter(Boolean).join("；");
    if (text) return asResearchErrorMessage(text);
  }
  if (status === 413) return "研报不能超过 32 MB";
  if (status === 415) return "请上传 PDF 研报";
  return "研报没有保存成功，请稍后重试";
}
