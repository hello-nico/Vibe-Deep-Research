import { aShareQualified, researchRead } from './research';

/**
 * 对话里提到的因素（Backend 叫候选因子）：`GET /wiki/companies/{symbol}/driver-candidates`，
 * 改状态 `PATCH …/{id}`。「纳入」只标待研究，不自动跑研究；新建只有模型能做，页面不建。
 */
export type FactorStatus = '候选' | '纳入' | '排除' | '观察';
export interface ConversationFactor { id: string; name: string; why: string; status: FactorStatus; recompute?: string | null; excluded_reason?: string }

const STATUSES = new Set<string>(['候选', '纳入', '排除', '观察']);
const idOf = (symbol: string) => aShareQualified(symbol) ?? symbol;

/** 页面上显示的：排除的不再出现。读不到返回空（整组不出现）。 */
export async function loadConversationFactors(symbol: string, signal?: AbortSignal): Promise<ConversationFactor[]> {
  try {
    const body = await researchRead<{ items?: ConversationFactor[] }>(`/wiki/companies/${idOf(symbol)}/driver-candidates`, { signal });
    return (body.items ?? []).filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && STATUSES.has(item.status) && item.status !== '排除');
  } catch { return []; }
}

/** 排除必须带理由（Backend 校验）；页面里理由可以不填，不填时记「暂不需要」。 */
export async function setFactorStatus(symbol: string, id: string, status: Exclude<FactorStatus, '候选'>, reason?: string): Promise<ConversationFactor> {
  const body = status === '排除' ? { status, reason: (reason ?? '').trim().slice(0, 60) || '暂不需要' } : { status };
  return researchRead<ConversationFactor>(`/wiki/companies/${idOf(symbol)}/driver-candidates/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
