/** Product read/upload facade. Research validation and persistence stay in Backend. */
const TOPIC_ID = /^\/wiki\/research-topics\/(?:topic:|topic%3A)[0-9a-f]{12}$/i;
const WIKI_SLUG = /^\/wiki\/pages\/read$/;
const NBS_INDUSTRY = /^\/wiki\/industries\/nbs$/;
const DRAFT_TOKEN = /^\/wiki\/page-drafts\/[A-Za-z0-9_-]{32,64}$/;
const BLOCK = /^\/wiki\/documents\/[a-f0-9]+\/blocks\/[A-Za-z0-9_%:.-]+$/;
const DOCUMENT = /^\/documents\/[a-f0-9]+(?:\/(?:raw|parsed|revisions|evidence-index))?$/;
const PROFILE = /^\/industries\/profiles\/[A-Za-z0-9.]+$/;

export function researchRoute(method, pathname) {
  if (method === 'GET' && [
    '/wiki/pages', '/wiki/pages/read', '/wiki/pages/related', '/wiki/research-topics', '/wiki/research-links',
    '/wiki/research-links/proposals', '/wiki/page-drafts/pending', '/wiki/industries/nbs',
    '/industries/profiles', '/documents/uploads',
  ].includes(pathname)) return true;
  if (method === 'GET' && (TOPIC_ID.test(pathname) || PROFILE.test(pathname) || BLOCK.test(pathname) || DOCUMENT.test(pathname) || DRAFT_TOKEN.test(pathname) || NBS_INDUSTRY.test(pathname) || WIKI_SLUG.test(pathname))) return true;
  if (method === 'POST' && [
    '/wiki/refs/resolve', '/wiki/pages/refresh-api', '/documents/uploads',
    '/wiki/research-topics/route', '/wiki/research-links/propose',
    '/wiki/research-links/confirm', '/wiki/research-links/reject',
  ].includes(pathname)) return true;
  if (method === 'POST' && TOPIC_ID.test(pathname)) return true;
  return false;
}

function backendBase() {
  return (process.env.STOCK_RESEARCH_BACKEND_URL || 'http://127.0.0.1:8700/api/v1').replace(/\/$/, '');
}

async function proxyResearch(req, res, { route, search, injectHook = false }) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', close);
  try {
    const limit = route === '/documents/uploads' ? 32 * 1024 * 1024 : 256_000;
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
    if (injectHook) {
      const token = (process.env.STOCK_RESEARCH_HOOK_TOKEN || '').trim();
      if (!token) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ detail: '研究发布未配置' })); return; }
      headers['x-stock-research-hook-token'] = token;
    }
    const response = await fetch(backendBase() + route + search, {
      method: req.method, signal: controller.signal, headers,
      ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
    });
    const reader = response.body?.getReader();
    const prefix = [];
    let prefixSize = 0;
    if (reader && response.ok && route.endsWith('/raw')) {
      while (prefixSize < 5) {
        const part = await reader.read();
        if (part.done) break;
        prefix.push(part.value); prefixSize += part.value.length;
      }
    }
    const isPdf = Buffer.concat(prefix).subarray(0, 5).toString('ascii') === '%PDF-';
    res.writeHead(response.status, { 'Content-Type': isPdf ? 'application/pdf' : response.headers.get('content-type') || 'application/json', ...(isPdf ? { 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } : {}) });
    for (const chunk of prefix) res.write(chunk);
    if (reader) while (true) {
      const part = await reader.read();
      if (part.done) break;
      res.write(part.value);
    }
    res.end();
  } catch {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: '研究服务连接失败，请检查 Stock-Research Backend' }));
  } finally { res.off('close', close); }
}

export function installResearchApi(ctx) {
  ctx.webServer.register({ kind: 'prefix', path: '/finance-research', async handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.slice('/finance-research'.length);
    res.setHeader('Cache-Control', 'no-store');
    if (!researchRoute(req.method, route)) { res.writeHead(404); res.end(); return; }
    await proxyResearch(req, res, { route, search: url.search });
  } });
}

export function installWikiPublish(ctx) {
  ctx.webServer.register({ kind: 'exact', path: '/finance-wiki-publish', async handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    await proxyResearch(req, res, { route: '/wiki/page-drafts/publish', search: '', injectHook: true });
  } });
}
