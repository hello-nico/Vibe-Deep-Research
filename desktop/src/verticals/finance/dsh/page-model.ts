import type { AiSend } from '../../../core/ai/useAiChat';

export const sendPageModel: AiSend = async ({ message, history, signal }) => {
  const response = await fetch('/finance-model', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ message, history }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '模型请求失败');
  return result.reply;
};
