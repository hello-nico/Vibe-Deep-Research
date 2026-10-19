import assert from 'node:assert/strict';
import test from 'node:test';
import { startTaskActivation } from '../dsh/finance-ui/host-state.mjs';

test('rc.2 创建窗口隔离并发子任务的身份与全局工具权限，结束后释放监听', async () => {
  const listeners = new Set<Function>();
  const captured: any[] = [];
  const ctx = {
    on(_event: string, handler: Function) { listeners.add(handler); return () => listeners.delete(handler); },
    subagents: { async startActivation(spec: any) {
      await new Promise(resolve => setTimeout(resolve, spec.delay));
      const record: any = { id: spec.id, restrictions: [], sections: [] };
      const agent = { ctx: {
        tools: { restrict(value: any) { record.restrictions.push(value); } },
        systemPrompt: { getSectionOrder(name: string) { assert.equal(name, 'DEPLOYMENT_PERSONA_PREFIX'); return 10; },
          section(value: any) { record.sections.push(value); } },
      } };
      for (const listener of listeners) listener({ agent });
      captured.push(record);
      if (spec.fail) throw new Error('controlled failure');
      return spec.id;
    } },
  };
  const results = await Promise.allSettled([
    startTaskActivation(ctx, { id: 'research', delay: 5 }, '研究身份'),
    startTaskActivation(ctx, { id: 'report', delay: 0, fail: true }, '报告身份'),
  ]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']);
  assert.equal(listeners.size, 0);
  for (const record of captured) {
    assert.deepEqual(record.restrictions, [{ allow: [] }]);
    assert.deepEqual(record.sections, [{ name: 'deployment:persona-prefix', order: 10,
      text: record.id === 'research' ? '研究身份' : '报告身份' }]);
  }
});
