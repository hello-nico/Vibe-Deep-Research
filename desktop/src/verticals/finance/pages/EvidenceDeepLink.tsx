import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOpenEvidence } from '../components/EvidenceCard';
import { decodeEvidenceLink } from '../lib/evidence';
import { citationReference } from '../lib/citationMarks';

function deepLinkReference(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  // 接受 stock-ref:// 形式与裸 ref 两种；语法校验交给 citationReference。
  return decodeEvidenceLink(value) ?? citationReference(value);
}

/**
 * 直接打开/刷新 /evidence?ref=…：读回同一依据，不依赖 DOM 点击拦截。
 *
 * 直接调用外层面板 Owner，不依赖父子 effect 的全局事件监听顺序。
 */
export function EvidenceDeepLink() {
  const [params] = useSearchParams();
  const raw = params.get('ref') || '';
  const reference = deepLinkReference(raw);
  const openEvidence = useOpenEvidence();
  useEffect(() => {
    if (!reference) return;
    openEvidence(reference, null);
  }, [reference, openEvidence]);
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-6">
      <h1 className="text-lg font-semibold">查看依据</h1>
      {reference
        ? <p className="text-sm text-muted-foreground">依据面板已打开；关闭面板后可直接关闭本页回到来源。直接访问或刷新本地址都会读回同一份依据。</p>
        : <p role="alert" className="text-sm text-destructive">链接缺少有效的依据引用，无法打开依据。请从回答中的依据链接重新进入；不会改读其他版本。</p>}
    </div>
  );
}
