// 界面用语门禁：用户可见字符串里不得出现内部用语。清单只增不减；命中即失败。
// 只扫字符串字面量、模板文字片段、JSX 文本与 JSX 属性字符串；注释与 import 路径不算。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript') as typeof import('typescript');
const ROOT = fileURLToPath(new URL('../src/verticals/finance/', import.meta.url));

/** 内部用语 → 界面上应该怎么说。 */
export const BANNED_WORDS: Record<string, string> = {
  关键变量: '价格 / 影响利润的价格',
  更稳: '写清楚这条判断靠什么成立',
  打折扣: '写清楚这条判断靠什么成立',
  警戒线: '「保持在 X 以上 / 以下」',
  基数期: '对比期',
  经营均价代理: '去掉内部口径，放进「查看数据」',
  按请求口径: '去掉内部口径，放进「查看数据」',
  基数: '对比期利润 / 比对比期',
  整条: '删去',
  归母: '净利润',
  年内累计: '今年以来',
};

export function visibleStrings(source: string, fileName = 'x.tsx'): { text: string; line: number }[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const add = (node: import('typescript').Node, text: string) => {
    if (text.trim()) out.push({ text, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
  };
  const walk = (node: import('typescript').Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node, node.text);
    else if (ts.isJsxText(node)) add(node, node.text);
    ts.forEachChild(node, walk);
  };
  walk(file);
  return out;
}

export function bannedHits(source: string, fileName?: string) {
  return visibleStrings(source, fileName).flatMap(item => Object.keys(BANNED_WORDS).filter(word => item.text.includes(word)).map(word => ({ word, line: item.line, text: item.text.slice(0, 40) })));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test('界面用语门禁：finance 源码里用户可见字符串不含内部用语', () => {
  const hits = sourceFiles(ROOT).flatMap(path => bannedHits(readFileSync(path, 'utf8'), path).map(hit => `${path.slice(ROOT.length)}:${hit.line} 「${hit.word}」→ 改用 ${BANNED_WORDS[hit.word]}（${hit.text}）`));
  assert.deepEqual(hits, []);
});

test('门禁能拦住：字符串、模板文字、JSX 文本与属性里的禁用词都命中；注释与 import 不误报', () => {
  assert.deepEqual(bannedHits(`const a = '关键变量动一下';`).map(item => item.word), ['关键变量']);
  assert.deepEqual(bannedHits('const a = `按${x}请求口径调整`;').map(item => item.word), []);
  assert.deepEqual(bannedHits('const a = `按请求口径调整${x}警戒线`;').map(item => item.word).sort(), ['按请求口径', '警戒线'].sort());
  assert.deepEqual(bannedHits('const a = <p title="基数期均价">更稳</p>;').map(item => item.word).sort(), ['基数', '基数期', '更稳'].sort());
  // D6 新词：基数、整条、归母、年内累计。
  const fresh = ["const a = '相对基数';", "const b = '（整条）';", 'const c = <i>年化归母净利</i>;', 'const d = `年内累计${x}`;'].join('\n');
  assert.deepEqual(bannedHits(fresh).map(item => item.word).sort(), ['基数', '整条', '归母', '年内累计'].sort());
  assert.deepEqual(bannedHits(`// 基数 整条 归母 年内累计\nconst ok = '对比期利润、净利润、今年以来';`), []);
  assert.deepEqual(bannedHits(`// 关键变量\n/** 警戒线 */\nimport x from './关键变量';\nconst ok = '价格';`), []);
});
