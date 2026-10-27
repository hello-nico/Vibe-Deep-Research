/** Product read/upload facade. Research validation and persistence stay in Backend. */
import { backendHeaders, readCompatibility, resolveBackend, TOKEN_REJECTED } from './backend-connection.mjs';
const TOPIC_ID = /^\/wiki\/research-topics\/(?:topic:|topic%3A)[0-9a-f]{12}$/i;
const TOPIC_WALL = /^\/wiki\/research-topics\/(?:topic:|topic%3A)[0-9a-f]{12}\/wall$/i;
const TOPIC_BASIS = /^\/wiki\/research-topics\/(?:topic:|topic%3A)[0-9a-f]{12}\/basis-changes$/i;
const TOPIC_SNAPSHOT = /^\/wiki\/research-topics\/(?:topic:|topic%3A)[0-9a-f]{12}\/snapshot$/i;
const TOPIC_POOL = /^\/wiki\/research-topics\/(?:topic:|topic%3A)[0-9a-f]{12}\/(?:archive|restore)$/i;
const WIKI_SLUG = /^\/wiki\/pages\/read$/;
const NBS_INDUSTRY = /^\/wiki\/industries\/nbs$/;
const DRAFT_TOKEN = /^\/wiki\/page-drafts\/[A-Za-z0-9_-]{32,64}$/;
const DRAFT_ID_DISCARD = /^\/wiki\/page-drafts\/draft-[a-f0-9]{24}\/discard$/;
const BLOCK = /^\/wiki\/documents\/[a-f0-9]+\/blocks\/[A-Za-z0-9_%:.-]+$/;
const DOCUMENT = /^\/documents\/[a-f0-9]+(?:\/(?:raw|parsed|revisions|evidence-index|reparse))?$/;
const PROFILE = /^\/industries\/profiles\/[A-Za-z0-9.]+$/;
/** T7.3：撤回对话写回的关键变量，恢复个股页研究上一版。写入由 Backend 校验，这里加授权头。 */
const COMPANY_REVERT = /^\/wiki\/companies\/\d{6}\.(SH|SZ|BJ)\/page-research\/revert$/;
/** 对话里提到的因素改状态。 */
const DRIVER_CANDIDATE = /^\/wiki\/companies\/\d{6}\.(SH|SZ|BJ)\/driver-candidates\/[A-Za-z0-9_-]{1,64}$/;
const USER_CHAIN = /^\/wiki\/user-chains\/(?:uchain:|uchain%3A)[0-9a-f]{12}$/i;
/** 跟踪清单：不再盯 / 恢复、改观察信号类型。编号带冒号，浏览器会编码成 %3A。 */
const TRACKING_ITEM = /^\/tracking\/items\/[A-Za-z0-9._~%-]+(?:\/signals\/[A-Za-z0-9._~%-]+)?$/;
const USER_CHAIN_ACTION = /^\/wiki\/user-chains\/(?:uchain:|uchain%3A)[0-9a-f]{12}\/(?:revert|candidates)$/i;

export function researchRoute(method, pathname) {
  if (method === 'GET' && [
    '/wiki/pages', '/wiki/pages/read', '/wiki/pages/related', '/wiki/research-topics', '/wiki/research-links',
    '/wiki/research-links/proposals', '/wiki/page-drafts/pending', '/wiki/page-drafts', '/wiki/industries/nbs',
    '/wiki/research-memory', '/wiki/research-candidates', '/wiki/reports', '/wiki/pages/diff',
    '/industries/profiles', '/documents/uploads', '/notes', '/research-results',
    '/tracking/variables', '/tracking/items', '/tracking/next-reports', '/tracking/catalog',
    '/market/quotes', '/market/report-calendar', '/feed/announcements', '/feed/news', '/feed/research-events',
    '/wiki/chains', '/wiki/user-chains', '/wiki/user-chains/recommendations',
  ].includes(pathname)) return true;
  if (method === 'GET' && /^\/wiki\/chains\/[A-Za-z0-9._-]+$/.test(pathname)) return true;
  if (method === 'GET' && (USER_CHAIN.test(pathname) || USER_CHAIN_ACTION.test(pathname))) return true;
  if (method === 'GET' && /^\/wiki\/industries\/[^/]+\/valuation-framework$/.test(pathname)) return true;
  if (method === 'GET' && (TOPIC_ID.test(pathname) || TOPIC_WALL.test(pathname) || TOPIC_BASIS.test(pathname) || TOPIC_SNAPSHOT.test(pathname) || PROFILE.test(pathname) || BLOCK.test(pathname) || DOCUMENT.test(pathname) || DRAFT_TOKEN.test(pathname) || NBS_INDUSTRY.test(pathname) || WIKI_SLUG.test(pathname))) return true;
  if (method === 'POST' && /^\/documents\/[a-f0-9]{32}\/(?:reparse|hide-from-library)$/.test(pathname)) return true;
  if (method === 'POST' && DRAFT_ID_DISCARD.test(pathname)) return true;
  if (method === 'PATCH' && /^\/documents\/[a-f0-9]{32}$/.test(pathname)) return true;
  if (method === 'GET' && /^\/notes\/[^/]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/research-results\/result(?::|%3A)[0-9a-f]{32}$/i.test(pathname)) return true;
  if (method === 'GET' && /^\/wiki\/reports\/report(?::|%3A)[0-9a-f]{32}$/i.test(pathname)) return true;
  if (method === 'POST' && [
    '/wiki/refs/resolve', '/wiki/pages/refresh-api', '/wiki/pages/ensure', '/documents/uploads',
    '/documents/fetch-url',
    '/wiki/research-topics/route', '/wiki/research-links/propose',
    '/wiki/research-links/confirm', '/wiki/research-links/reject',
    '/wiki/research-links/hypotheses', '/wiki/research-links/hypotheses/withdraw',
    '/wiki/research-candidates', '/notes',
    '/research-results/market/preview',
    '/wiki/objects/status', // read-only batch status (T4-a); POST only for the slug list body
    '/wiki/user-chains', '/tracking/items',
  ].includes(pathname)) return true;
  if (method === 'POST' && USER_CHAIN_ACTION.test(pathname)) return true;
  if ((method === 'PATCH' || method === 'DELETE') && USER_CHAIN.test(pathname)) return true;
  if (method === 'PATCH' && TRACKING_ITEM.test(pathname)) return true;
  if (method === 'PUT' && pathname === '/wiki/research-memory') return true;
  if (method === 'GET' && /^\/wiki\/research-candidates\/[^/]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/wiki\/companies\/\d{6}\.(SH|SZ|BJ)\/(provider-snapshot|facts|documents|page-research|data-packet|quarter-reconciliation|driver-candidates)$/.test(pathname)) return true;
  // 对话里提到的因素：只能改状态（纳入 / 排除 / 观察）；新建候选只有模型带令牌能做。
  if (method === 'PATCH' && DRIVER_CANDIDATE.test(pathname)) return true;
  if (method === 'POST' && /^\/wiki\/companies\/\d{6}\.(SH|SZ|BJ)\/coverage\/ensure$/.test(pathname)) return true;
  if (method === 'POST' && COMPANY_REVERT.test(pathname)) return true;
  if (method === 'POST' && /^\/wiki\/research-candidates\/[^/]+\/(dispose|adopt)$/.test(pathname)) return true;
  if (method === 'POST' && /^\/notes\/[^/]+\/delete$/.test(pathname)) return true;
  if (method === 'POST' && (TOPIC_ID.test(pathname) || TOPIC_POOL.test(pathname))) return true;
  return false;
}

function backendTarget() {
  return resolveBackend();
}

async function proxyResearch(req, res, { route, search, injectHook = false }) {
  const controller = new AbortController();
  const close = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', close);
  try {
    const limit = route === '/documents/uploads' ? 32 * 1024 * 1024 : (req.method === 'POST' && route === '/notes' ? 512_000 : 256_000);
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const target = backendTarget();
    const headers = backendHeaders(target, { 'Content-Type': req.headers['content-type'] || 'application/json' });
    if (injectHook) {
      const token = (process.env.STOCK_RESEARCH_HOOK_TOKEN || '').trim();
      if (!token) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ detail: '研究发布未配置' })); return; }
      headers['x-stock-research-hook-token'] = token;
    }
    const response = await fetch(target.url + route + search, {
      method: req.method, signal: controller.signal, headers,
      ...(['POST', 'PUT', 'PATCH'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
    });
    if (response.status === 401) {
      await response.body?.cancel?.();
      res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ detail: TOKEN_REJECTED }));
      return;
    }
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
    res.end(JSON.stringify({ detail: '研究服务连接失败，请确认研究后台已启动' }));
  } finally { res.off('close', close); }
}

export function installResearchApi(ctx) {
  return ctx.webServer.register({ kind: 'prefix', path: '/finance-research', async handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.slice('/finance-research'.length);
    res.setHeader('Cache-Control', 'no-store');
    if (!researchRoute(req.method, route)) { res.writeHead(404); res.end(); return; }
    const compatible = await readCompatibility();
    if (compatible.result === 'server_outdated' || compatible.result === 'client_outdated') {
      res.writeHead(426, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ detail: compatible.text }));
      return;
    }
    await proxyResearch(req, res, { route, search: url.search, injectHook: req.method === 'POST' && COMPANY_REVERT.test(route) });
  } });
}

export function installWikiPublish(ctx) {
  return ctx.webServer.register({ kind: 'exact', path: '/finance-wiki-publish', async handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    await proxyResearch(req, res, { route: '/wiki/page-drafts/publish', search: '', injectHook: true });
  } });
}
