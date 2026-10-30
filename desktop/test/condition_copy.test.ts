import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

test('产品源码的界面和提示词字面量统一使用改判断的条件；注释与历史资料不在扫描范围', () => {
  const root = new URL('../src/', import.meta.url);
  const hits: string[] = [];
  for (const name of readdirSync(root, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(name)) continue;
    const path = fileURLToPath(new URL(name, root));
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if ((ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && node.text.includes('证伪')) hits.push(`${name}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(hits, []);
  assert.doesNotMatch(readFileSync(new URL('../../docs/design.md', import.meta.url), 'utf8'), /证伪/);
});
