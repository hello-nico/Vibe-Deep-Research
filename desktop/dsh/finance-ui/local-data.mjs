import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { disposeLocalDataRuntime, handleLocalDataRequest } from '../../../orchestrator/src/api.ts';
import { serviceContext } from '../../../orchestrator/src/service.ts';

export function productRepoRoot(env = process.env) {
  if (env.VRA_REPO_ROOT) return path.resolve(env.VRA_REPO_ROOT);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function rewriteRequest(req, url) {
  return new Proxy(req, {
    get(target, prop) {
      if (prop === 'url') return url;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function installLocalData(ctx, env = process.env) {
  const data = serviceContext({ repoRoot: productRepoRoot(env),
    env: { ...env, VRA_DATA_ROOT: env.VRA_FINANCE_DATA_ROOT ?? env.VRA_DATA_ROOT } });
  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: '/finance-api',
    async handler(req, res) {
      const admission = ctx.connection?.admit?.(req);
      if (admission && 'rejection' in admission) {
        res.writeHead(admission.rejection, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }
      const url = new URL(req.url || '/', 'http://localhost');
      const rest = url.pathname.slice('/finance-api'.length) || '/';
      await handleLocalDataRequest(rewriteRequest(req, `${rest}${url.search}`), res, data);
    },
  });
  return () => {
    disposeRoute();
    disposeLocalDataRuntime();
  };
}
