/** Product read/upload facade. Research validation and persistence stay in Backend. */
export function researchRoute(method, pathname) {
  if (method === 'GET' && [
    '/wiki/pages', '/wiki/pages/read', '/wiki/research-topics', '/industries/profiles', '/documents/uploads',
  ].includes(pathname)) return true;
  if (method === 'GET' && /^\/industries\/profiles\/[A-Za-z0-9.]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/wiki\/research-topics\/[A-Za-z0-9_/-]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/documents\/[a-f0-9]+(?:\/(?:raw|parsed|revisions|evidence-index))?$/.test(pathname)) return true;
  return method === 'POST' && ['/wiki/refs/resolve', '/documents/uploads'].includes(pathname);
}

export function installResearchApi(ctx) {
  ctx.webServer.register({ kind: 'prefix', path: '/finance-research', async handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.slice('/finance-research'.length);
    res.setHeader('Cache-Control', 'no-store');
    if (!researchRoute(req.method, route)) { res.writeHead(404); res.end(); return; }
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
      const base = (process.env.STOCK_RESEARCH_BACKEND_URL || 'http://127.0.0.1:8700/api/v1').replace(/\/$/, '');
      const response = await fetch(base + route + url.search, {
        method: req.method, signal: controller.signal,
        headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
        ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      });
      // No cookies, credentials, hook token or arbitrary upstream headers cross this boundary.
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
      if (response.body) for await (const chunk of response.body) res.write(chunk);
      res.end();
    } catch {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: '研究服务连接失败，请检查 Stock-Research Backend' }));
    } finally { res.off('close', close); }
  } });
}
