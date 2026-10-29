export function ReadFailure({ retry }: { retry: () => void }) {
  return <p role="alert" className="py-3 text-sm text-[var(--text-3)]">暂时读取不到 · <button type="button" className="btn btn-text btn-sm" onClick={retry}>重试</button></p>;
}
