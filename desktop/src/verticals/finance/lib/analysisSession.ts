/** 页面分析、记录反思是独立请求，不续写全局聊天历史。 */
export function newAnalysisSession(scope: "page-analysis" | "note-reflection"): string {
  return `${scope}-${crypto.randomUUID()}`;
}
