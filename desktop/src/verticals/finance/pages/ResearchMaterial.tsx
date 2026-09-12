import { Link, useSearchParams } from 'react-router-dom';
import { WikiReader } from '../components/ResearchKnowledge';
import { researchTarget } from '../dsh/research-input';

export function ResearchMaterial() {
  const [params] = useSearchParams();
  const slug = params.get('slug') || '';
  const from = params.get('from') || '/my-research';
  const back = from.startsWith('/') && !from.startsWith('//') ? from : '/my-research';
  return <section className="mx-auto max-w-6xl p-6">
    <Link className="workspace-action mb-5 inline-flex" to={back}>返回研究</Link>
    {researchTarget(slug)?.kind === 'wiki' ? <WikiReader slug={slug} /> : <p role="alert">这份研究材料暂时无法打开。</p>}
  </section>;
}
