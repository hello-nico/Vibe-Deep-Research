// 打开设置不依赖按钮顺序：走 DSH 的 settings.launcher 插槽（openSettings 入参），再按分段名称选中「模型」。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { openModelSettings, setSettingsOpener } from '../src/verticals/finance/dsh/settings-entry.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

function stubDom(buttons: Array<{ text: string; current?: boolean }>) {
  const clicks: string[] = [];
  const nodes = buttons.map(b => ({
    textContent: b.text,
    getAttribute: (name: string) => name === 'aria-current' && b.current ? 'true' : null,
    click: () => clicks.push(b.text),
  }));
  const g = globalThis as Record<string, unknown>;
  g.document = { querySelectorAll: () => nodes };
  g.requestAnimationFrame = (fn: () => void) => { queueMicrotask(fn); return 0; };
  return clicks;
}

test('没有启动器时不假装已打开；有启动器时先 openSettings 再按名称选「模型」，与分段顺序无关', async () => {
  setSettingsOpener(null);
  assert.equal(openModelSettings(), false);
  for (const order of [['通用设置', '模型'], ['模型', '通用设置'], ['账号', '通用设置', '模型']]) {
    const clicks = stubDom(order.map(text => ({ text })));
    let opened = 0;
    setSettingsOpener(() => { opened += 1; });
    assert.equal(openModelSettings(), true);
    await new Promise(r => setTimeout(r, 5));
    assert.equal(opened, 1);
    assert.deepEqual(clicks, ['模型']);
  }
  // 已经在模型分段时不重复点击。
  const clicks = stubDom([{ text: '通用设置' }, { text: '模型', current: true }]);
  setSettingsOpener(() => {});
  openModelSettings();
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(clicks, []);
  setSettingsOpener(null);
});

test('产品不再点侧栏第一个按钮；启动器占位遮蔽账号菜单；隐藏座位不显示', () => {
  const native = read('../src/verticals/finance/dsh/NativeDsh.tsx');
  assert.doesNotMatch(native, /querySelector[^\n]*sidebar\.settings/);
  const client = read('../src/verticals/finance/dsh/client.tsx');
  assert.match(client, /name: 'settings\.launcher', priority: -1 \}, SettingsLauncher/);
  assert.match(client, /setSettingsOpener\(openSettings\)/);
  assert.match(read('../src/index.css'), /\.workspace-dsh-seat \{ display: none; \}/);
});
