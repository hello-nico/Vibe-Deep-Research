/** 对话 / 问助手上屏错误：按失败类别转成中文，不转发供应商或运行时原文。 */

function rawText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message || '');
  return '';
}

function stripPrefix(text: string): string {
  return text.replace(/^(?:error|exception|typeerror|aborterror)\s*:\s*/i, '').trim();
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

const warned = new Set<string>();

function classifyRuntimeError(error: unknown, fallback: string): { text: string; warn: boolean } {
  if (error instanceof Error && error.name === 'TimeoutError') return { text: '请求超时，请重试', warn: true };
  if (error instanceof Error && error.name === 'AbortError') return { text: '已停止', warn: true };
  const text = stripPrefix(rawText(error));
  if (!text) return { text: fallback, warn: true };
  if (/\b(aborted|cancell?ed)\b/i.test(text)) return { text: '已停止', warn: true };
  if (/timeout|timed?\s*out|etimedout/i.test(text)) return { text: '请求超时，请重试', warn: true };
  if (/quota|insufficient balance|rate[- ]?limit|too many requests/i.test(text)) return { text: '模型额度不足，请稍后再试', warn: true };
  if (/unauthorized|invalid api key|authentication|\b401\b/i.test(text)) return { text: '模型还没配置好', warn: true };
  if (/econnrefused|enotfound|fetch failed|networkerror|socket/i.test(text)) return { text: '网络暂时连不上，请重试', warn: true };
  if (/context window|too many tokens|max.?tokens/i.test(text)) return { text: '内容太长，这一轮没法继续', warn: true };
  if (hasChinese(text)) return { text, warn: false };
  return { text: fallback, warn: true };
}

export function userFacingRuntimeError(error: unknown, fallback = '这一步没有完成，请重试'): string {
  const mapped = classifyRuntimeError(error, fallback);
  if (mapped.warn) {
    const key = stripPrefix(rawText(error)) || mapped.text;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn('[runtime-error]', error);
    }
  }
  return mapped.text;
}
