export async function bindTopicSession(topicId: string, sessionId: string, title: string) {
  const response = await fetch("/finance-topic-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic_id: topicId, session_id: sessionId, title }),
  });
  if (!response.ok) throw new Error("议题会话未能保存，请重试");
  return response.json() as Promise<{ session_ids: string[]; active_session_id: string }>;
}

export async function loadTopicSessions() {
  const response = await fetch("/finance-topic-sessions");
  if (!response.ok) throw new Error("议题会话读取失败");
  return response.json() as Promise<{
    sessions: Record<string, { topic_id: string }>;
    topics: Record<string, { session_ids: string[]; active_session_id: string; title?: string }>;
  }>;
}
