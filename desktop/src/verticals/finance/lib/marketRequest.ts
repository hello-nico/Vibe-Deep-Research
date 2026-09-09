// 只限制看板等待时间；底层请求迟到后不能再更新本轮页面状态。
export function marketRequest<T>(request: Promise<T>, timeoutMs = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("行情加载超时，请点击刷新重试")), timeoutMs);
    request.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
