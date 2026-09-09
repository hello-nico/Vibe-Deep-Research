import fs from 'node:fs';
import path from 'node:path';
import type { ChatRequest, ChatReply } from './direct_transport.ts';

/** DSH owns provider credentials; the stage runner only sends bounded model requests. */
export function dshCompletion(dataRoot: string) {
  let selection: unknown;
  return async (request: ChatRequest): Promise<ChatReply> => {
    const { origin } = JSON.parse(fs.readFileSync(path.join(dataRoot, 'dsh-model.json'), 'utf8'));
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('DSH 模型地址必须是本机服务');
    const token = fs.readFileSync(path.join(dataRoot, 'api.token'), 'utf8').trim();
    const response = await fetch(new URL('/finance-stage-model', url), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: request.messages, tools: request.tools, selection }),
      signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)]) : AbortSignal.timeout(request.timeoutMs),
    });
    if (!response.ok) throw new Error(`DSH 阶段模型调用失败 (${response.status})`);
    const result = await response.json() as ChatReply & { selection: unknown };
    selection = result.selection;
    return result;
  };
}
