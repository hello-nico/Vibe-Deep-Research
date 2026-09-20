export interface AssistantObject {
  kind: 'document';
  id: string;
  label: string;
  version?: string;
  ready?: boolean;
  detail?: string;
}

/** Identity-only document chip for 就此追问. Never serializes excerpt text as a page snapshot. */
export function documentObject(input: {
  documentId: string; title: string; parseRevisionId?: string; parsedContentSha256?: string; ready?: boolean;
}): AssistantObject {
  const version = input.parseRevisionId && input.parsedContentSha256
    ? `${input.parseRevisionId}/${input.parsedContentSha256}`
    : undefined;
  return {
    kind: 'document',
    id: version ? `document:${input.documentId}/${version}` : `document:${input.documentId}`,
    label: input.title,
    version,
    ready: input.ready !== false && Boolean(version),
    detail: version ? undefined : '原件已保存，正文尚未解析，不能按正文引用',
  };
}
