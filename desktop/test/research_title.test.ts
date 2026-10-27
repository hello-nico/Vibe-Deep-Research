import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveResearchTitle, titleNeedsName, researchTitleOf } from '../dsh/finance-ui/research-title.mjs';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';

let server: ViteDevServer;
let tasks: { withCompanyName: (r: any, names: Record<string, string>) => any; needsCompanyName: (r: any) => boolean; companyNameOf: (r: any) => string };
test.before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  tasks = await server.ssrLoadModule('/src/verticals/finance/lib/researchTasks.ts') as never;
});
test.after(async () => { await server.close(); });

test('建任务：标题没有公司名（空、只是代码）时查名称，查不到才写代码；已有名称原样保留', async () => {
  const lookup = async (symbol: string) => symbol === '300750.SZ' ? '宁德时代' : '';
  assert.equal(await resolveResearchTitle('300750.SZ', '300750.SZ', lookup), '公司研究 · 宁德时代');
  assert.equal(await resolveResearchTitle(undefined, '300750.SZ', lookup), '公司研究 · 宁德时代');
  assert.equal(await resolveResearchTitle('公司研究 · 002379', '002379.SZ', async () => '宏桥控股'), '公司研究 · 宏桥控股');
  assert.equal(await resolveResearchTitle('公司研究 · 神火股份', '000933.SZ', lookup), '公司研究 · 神火股份');
  assert.equal(await resolveResearchTitle('300750.SZ', '300750.SZ', async () => { throw new Error('offline'); }), '公司研究 · 300750');
  assert.equal(titleNeedsName('公司研究 · 神火股份'), false);
  assert.equal(researchTitleOf('', '600900.SH'), '公司研究 · 600900');
});

test('显示：旧任务名称是代码就就地补名，查不到仍显示代码，已有名称不动', () => {
  const rec = (title: string, symbol = '300750.SZ') => ({ title, symbol });
  assert.equal(tasks.companyNameOf(tasks.withCompanyName(rec('300750.SZ'), { '300750': '宁德时代' })), '宁德时代');
  assert.equal(tasks.companyNameOf(tasks.withCompanyName(rec('公司研究 · 002379', '002379.SZ'), { '002379': '宏桥控股' })), '宏桥控股');
  assert.equal(tasks.companyNameOf(tasks.withCompanyName(rec('300750.SZ'), {})), '300750.SZ');
  assert.equal(tasks.companyNameOf(tasks.withCompanyName(rec('公司研究 · 神火股份', '000933.SZ'), { '000933': '别的' })), '神火股份');
  assert.equal(tasks.needsCompanyName(rec('公司研究 · 神火股份')), false);
});
