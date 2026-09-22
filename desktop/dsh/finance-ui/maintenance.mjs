import { randomUUID } from 'node:crypto';

const COMPANY = /^companies\/\d{6}-(?:sh|sz|bj)$/;

async function backend(route, payload, signal) {
  const token = process.env.STOCK_RESEARCH_HOOK_TOKEN?.trim();
  if (!token) throw Object.assign(new Error('资料维护服务未配置'), { status: 503 });
  const base = (process.env.STOCK_RESEARCH_BACKEND_URL || 'http://127.0.0.1:8700/api/v1').replace(/\/$/, '');
  const response = await fetch(base + route, {
    method: payload ? 'POST' : 'GET', signal,
    headers: { 'content-type': 'application/json', 'x-stock-research-hook-token': token },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const messages = {
      stale_version: '提案已变化，请回查最新记录后再操作',
      stale_target: '公司资料已更新，请重新读取并准备刷新',
      execution_unknown: '执行结果仍待核实，请回查记录，不要重复提交',
      binding_mismatch: '确认与原提案不匹配，请重新准备刷新',
      not_found: '未找到这条刷新记录，请重新准备',
    };
    throw Object.assign(new Error(messages[result.detail?.code] || '维护请求未通过校验，请重新读取后确认'), { status: response.status });
  }
  return result;
}

// Only the explicit company refresh button uses this facade. Agent proposals and
// their native question answers never pass through this browser endpoint.
export async function companyRefreshRequest(input, signal, request = backend) {
  if (input.operation === 'prepare') {
    if (!COMPANY.test(input.slug || '') || !/^[a-f0-9]{64}$/.test(input.version || ''))
      throw Object.assign(new Error('请先读取当前公司资料，再发起刷新'), { status: 422 });
    const identity = randomUUID();
    return request('/wiki/maintenance-proposals', {
      origin: 'refresh_button', role: 'company_wiki',
      source_session: `refresh-button:${identity}`, source_turn: identity,
      items: [{ item_id: 'refresh-company', action: 'timeline_refresh',
        label: '更新这家公司的接口资料', description: '重新获取财务与估值接口数据；保留研究判断和原文资料。',
        target: { kind: 'wiki', id: input.slug, version: input.version }, args: { slug: input.slug, scope: 'api' } }],
    }, signal);
  }
  if (!['read', 'confirm'].includes(input.operation) || typeof input.proposal_id !== 'string' || !/^[A-Za-z0-9:_-]{1,100}$/.test(input.proposal_id))
    throw Object.assign(new Error('无效的刷新请求'), { status: 422 });
  const route = `/wiki/maintenance-proposals/${encodeURIComponent(input.proposal_id)}`;
  const proposal = await request(route, undefined, signal);
  if (proposal.origin !== 'refresh_button' || proposal.role !== 'company_wiki'
    || proposal.items?.length !== 1 || proposal.items[0].action !== 'timeline_refresh'
    || proposal.items[0].args?.scope !== 'api')
    throw Object.assign(new Error('此入口只能处理公司刷新按钮的请求'), { status: 403 });
  if (input.operation === 'read') return proposal;
  if (typeof input.approve !== 'boolean' || input.version !== proposal.version)
    throw Object.assign(new Error('刷新提案已变化，请重新查看并确认'), { status: 409 });
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
      catch { throw Object.assign(new Error('无效的刷新请求'), { status: 400 }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('无效的刷新请求'), { status: 400 });
      res.end(JSON.stringify(await companyRefreshRequest(input, controller.signal)));
    } catch (error) {
      res.writeHead(error.status || 502);
      res.end(JSON.stringify({ detail: error.status ? error.message : '未能确认执行结果，请回查此项维护记录，不要重复提交刷新。' }));
    } finally { res.off('close', close); }
  } });
}
