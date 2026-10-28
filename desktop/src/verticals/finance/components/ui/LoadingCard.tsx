import type { ReactNode } from 'react';

// 全站统一的加载占位：个股页的样子，先出标题，下面两条闪动灰条。bare 用在已有卡片里。
export function LoadingCard({ title, bare = false, label = '加载中' }: { title?: ReactNode; bare?: boolean; label?: string }) {
  return <div className={bare ? 'loading-card is-bare' : 'card loading-card'} role="status" aria-busy="true" aria-label={label} data-loading="">
    {title ? <strong className="loading-card-title">{title}</strong> : null}
    <span className="skeleton" /><span className="skeleton" />
  </div>;
}
