/** 过程面板只嵌入可渲染的行情 / 财务图表；其余成果不进卡片。 */

export const RESULT_EMBED_FALLBACK = '这份成果暂时无法显示';

export function embeddableChartResult(kind: unknown): boolean {
  return kind === 'market' || kind === 'financial';
}

export function listOrEmpty<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}
