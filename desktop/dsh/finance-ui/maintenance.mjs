const COMPANY = /^companies\/\d{6}-(?:sh|sz|bj)$/;
const INDUSTRY = /^industries\/nbs-.+$/;

async function backend(route, payload, signal) {
  const token = process.env.STOCK_RESEARCH_HOOK_TOKEN?.trim();
  if (!token) throw Object.assign(new Error('资料刷新服务未启用'), { status: 503 });
  const base = (process.env.STOCK_RESEARCH_BACKEND_URL || 'http://127.0.0.1:8700/api/v1').replace(/\/$/, '');
  const response = await fetch(base + route, {
    method: payload ? 'POST' : 'GET', signal,
    headers: { 'content-type': 'application/json', 'x-stock-research-hook-token': token },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const messages = {
      stale_version: '内容有更新，请重新打开后确认',
      stale_target: '页面资料有更新，请刷新页面后再试',
      stale_source: '统计局来源有更新，请重新点击刷新',
      source_unavailable: '国家统计局表3资料暂时不可用，请稍后重试',
      execution_unknown: '结果还在确认中，请稍后查看，先不要重复刷新',
      binding_mismatch: '内容有更新，请重新打开后确认',
      not_found: '没找到这次刷新，请重新点击刷新',
    };
    throw Object.assign(new Error(messages[result.detail?.code] || result.detail?.message || '请求没有通过，请刷新页面后再试'),
      { status: response.status, code: result.detail?.code || 'request_failed' });
  }
  return result;
}

// Only explicit Wiki refresh buttons use this facade. Agent proposals and
// their native question answers never pass through this browser endpoint.
export async function companyRefreshRequest(input, signal, request = backend) {
  const industry = input.page === 'industry';
  if (input.operation === 'current') {
    if (!(industry ? INDUSTRY : COMPANY).test(input.slug || ''))
      throw Object.assign(new Error('页面身份无效'), { status: 422 });
    return request(`/wiki/refresh-checks/current?page=${industry ? 'industry' : 'company'}&slug=${encodeURIComponent(input.slug)}`, undefined, signal);
  }
  if (input.operation === 'read_check') {
    if (!/^check-[a-f0-9]{32}$/.test(input.check_id || ''))
      throw Object.assign(new Error('检查记录无效'), { status: 422 });
    return request(`/wiki/refresh-checks/${input.check_id}`, undefined, signal);
  }
  if (input.operation === 'prepare') {
    if (!(industry ? INDUSTRY : COMPANY).test(input.slug || '') || !/^[a-f0-9]{64}$/.test(input.version || ''))
      throw Object.assign(new Error('页面还没加载完，请稍后再刷新'), { status: 422 });
    return request('/wiki/refresh-checks', { page: industry ? 'industry' : 'company', slug: input.slug, version: input.version }, signal);
  }
  if (!['read', 'confirm'].includes(input.operation) || typeof input.proposal_id !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(input.proposal_id))
    throw Object.assign(new Error('刷新请求无效，请刷新页面后重试'), { status: 422 });
  const route = `/wiki/maintenance-proposals/${encodeURIComponent(input.proposal_id)}`;
  const proposal = await request(route, undefined, signal);
  if (proposal.origin !== 'refresh_button' || proposal.role !== (industry ? 'industry_wiki' : 'company_wiki')
    || proposal.items?.length !== 1 || proposal.items[0].action !== 'timeline_refresh'
    || proposal.items[0].args?.scope !== (industry ? 'industry_sources' : 'api'))
    throw Object.assign(new Error('此处只能处理当前页面的刷新，请刷新页面后重试'), { status: 403 });
  if (input.operation === 'read') return proposal;
  if (typeof input.approve !== 'boolean' || input.version !== proposal.version)
    throw Object.assign(new Error('内容有更新，请重新打开后确认'), { status: 409 });
  return request(`${route}/confirm`, {
    expected_version: input.version, source_session: proposal.source_session, source_turn: proposal.source_turn,
    selections: [{ item_id: proposal.items[0].item_id, decision: input.approve ? 'approve' : 'reject' }],
  }, signal);
}

export function installCompanyRefresh(ctx) {
  return ctx.webServer.register({ kind: 'exact', path: '/finance-maintenance-refresh', async handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    const controller = new AbortController();
    const close = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', close);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) throw Object.assign(new Error('刷新请求过大'), { status: 413 });
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw Object.assign(new Error('刷新请求无效，请刷新页面后重试'), { status: 400 }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('刷新请求无效，请刷新页面后重试'), { status: 400 });
      res.end(JSON.stringify(await companyRefreshRequest(input, controller.signal)));
    } catch (error) {
      res.writeHead(error.status || 502);
      res.end(JSON.stringify({ detail: error.status ? error.message : '结果还在确认中，请稍后查看，先不要重复刷新。',
        code: error.code || 'request_failed' }));
    } finally { res.off('close', close); }
  } });
}
