// D8：桌面包 macOS 的窗口按钮带——只在 data-platform='darwin' 下出现，Web 外观不变。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/verticals/finance/components/layout/Layout.tsx', import.meta.url), 'utf8');

test('窗口按钮带：默认不显示；只在 darwin 且非全屏时下移外壳并显示可拖动带', () => {
  assert.match(css, /\.workspace-window-band \{ display: none; \}/);
  assert.match(css, /html\[data-platform='darwin'\]:not\(\[data-fullscreen='true'\]\) \.workspace-shell \{[^}]*padding-top: var\(--vibe-window-band, 36px\)/);
  assert.match(css, /html\[data-platform='darwin'\]:not\(\[data-fullscreen='true'\]\) \.workspace-window-band \{[^}]*display: block/);
  // 没有 data-platform 的选择器不得改外壳几何：所有 padding-top 调整都挂在 darwin 条件下。
  for (const line of css.split('\n').filter(item => /workspace-shell|workspace-window-band/.test(item) && /padding-top|display: block/.test(item))) {
    assert.match(line, /data-platform='darwin'/);
  }
});

test('带本身标 data-window-drag（拖动由上游规则声明），不放控件', () => {
  assert.match(layout, /<div className="workspace-window-band" data-window-drag="" aria-hidden="true" \/>/);
  assert.doesNotMatch(css, /workspace-window-band[^{]*\{[^}]*-webkit-app-region/);
});
