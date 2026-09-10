/** Product read/upload facade. Research validation and persistence stay in Backend. */
export function researchRoute(method, pathname) {
  if (method === 'GET' && [
    '/wiki/pages', '/wiki/pages/read', '/wiki/research-topics', '/industries/profiles', '/documents/uploads',
  ].includes(pathname)) return true;
  if (method === 'GET' && /^\/industries\/profiles\/[A-Za-z0-9.]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/wiki\/research-topics\/[A-Za-z0-9_/-]+$/.test(pathname)) return true;
  if (method === 'GET' && /^\/wiki\/documents\/[a-f0-9]+\/blocks\/[A-Za-z0-9_%:.-]+$/.test(pathname)) return true;
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
      // The document store may serve originals as octet-stream. Only real PDF bytes
      // receive an inline PDF type; other attachments retain their upstream type.
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
  } });
}
