/** 一条证据引用的固定版本定位（不含正文）。结构同 lib/evidence 的 SourceBlock 元组四项，避免本模块被测试加载时连带请求层。 */
export type RefTuple = {
  document_id: string; parse_revision_id: string; parsed_content_sha256: string; block_id: string;
};

/**
 * 按"当前解析请求"管理引用解析状态：pending / resolved / failed。
 * 状态只属于发起解析的那次请求；引用切换立即进入 pending，旧元组不再生效，
 * 迟到或过期响应按引用名拒绝写入 —— 失败后返回旧引用也不会复活旧元组。
 */
export type RefResolution =
  | { status: 'pending'; ref: string }
  | { status: 'resolved'; ref: string; tuple: RefTuple }
  | { status: 'failed'; ref: string };

export type RefResolutionEvent =
  | { type: 'start'; ref: string }
  | { type: 'resolved'; ref: string; tuple: RefTuple }
  | { type: 'failed'; ref: string };

export function reduceRefResolution(state: RefResolution | null, event: RefResolutionEvent): RefResolution | null {
  if (event.type === 'start') return { status: 'pending', ref: event.ref };
  // 只有"当前正在 pending 的同一引用"的响应才生效：迟到、过期、换了引用的响应一律忽略。
  if (!state || state.status !== 'pending' || state.ref !== event.ref) return state;
  return event.type === 'resolved'
    ? { status: 'resolved', ref: event.ref, tuple: event.tuple }
    : { status: 'failed', ref: event.ref };
}

/** evidence 记录 → 固定元组；block_id 允许在 location 嵌套里（与 loadEvidence 同一读取规则）。 */
export function refTupleFromRecord(data: Record<string, unknown>): RefTuple {
  const location = data.location as Record<string, unknown> | undefined;
  return {
    document_id: String(data.document_id ?? ''),
    parse_revision_id: String(data.parse_revision_id ?? ''),
    parsed_content_sha256: String(data.parsed_content_sha256 ?? ''),
    block_id: String(data.block_id ?? location?.block_id ?? ''),
  };
}

/** 当前引用生效的元组：仅 resolved 且引用名与当前一致。 */
export function activeRefTuple(state: RefResolution | null, refParam: string): RefTuple | null {
  return state?.status === 'resolved' && state.ref === refParam ? state.tuple : null;
}
