import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, isValidElement } from 'react';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { INLINE_RESULT_RENDERER, inlineResultReferences, registerInlineResultRenderer, resultReference } from '../src/verticals/finance/dsh/inline-result.ts';

const id = 'result:' + 'a'.repeat(32);
test('inline renderer validates references and unregisters with its owner', () => {
  const host = globalThis as typeof globalThis & { [INLINE_RESULT_RENDERER]?: (id: string) => unknown };
  const release = registerInlineResultRenderer(reference => createElement('section', { 'data-result': reference }));
  const registered = host[INLINE_RESULT_RENDERER]!;
  assert.ok(isValidElement(registered(id)));
  for (const invalid of ['a'.repeat(32), 'result:abc', 'result:' + 'A'.repeat(32), id + '/extra', 'https://example.org']) {
    assert.equal(resultReference(invalid), false);
    assert.equal(registered(invalid), null);
  }
  const releaseNext = registerInlineResultRenderer(() => createElement('section'));
  release();
  assert.ok(host[INLINE_RESULT_RENDERER]);
  releaseNext();
  assert.equal(host[INLINE_RESULT_RENDERER], undefined);
});

test('marker parsing uses Markdown image paragraphs and excludes examples', () => {
  const marker = `![图标题](${id})`;
  for (const text of [marker, `说明\n\n${marker}\n\n后续`, ` ![图\\]标题](${id}) `, `> ${marker}`, `- ${marker}`])
    assert.deepEqual([...inlineResultReferences(text)], [id]);
  for (const text of [id, marker.slice(0, -1), `正文 ${marker}`, `\`${marker}\``, `\\${marker}`,
    `\`\`\`md\n${marker}\n\`\`\``, `    ${marker}`, `<div>\n${marker}\n</div>`, `![图](result:invalid)`,
    `[图](${id})`, `${marker} ![第二图](${id})`])
    assert.equal(inlineResultReferences(text).size, 0, text);
});

test('finance activation registers the real ResearchResult component and disposal removes it', async () => {
  // klinecharts reads the browser platform once on import. This test does not
  // mount a chart or simulate its DOM, Backend request or hover interactions.
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { navigator: { userAgent: 'inline-result-test' } } });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const releases: (() => void)[] = [];
  try {
    const { installResultNode } = await server.ssrLoadModule('/src/verticals/finance/dsh/result-node.tsx');
    const { ResearchResult } = await server.ssrLoadModule('/src/verticals/finance/components/ResearchResult.tsx');
    installResultNode({ effect: (effect: () => () => void) => { releases.push(effect()); },
      uiConversation: { events: { register() {} } }, slots: { inject() {} } });
    const host = globalThis as typeof globalThis & { [INLINE_RESULT_RENDERER]?: (id: string) => ReturnType<typeof createElement> | null };
    const element = host[INLINE_RESULT_RENDERER]!(id)!;
    assert.ok(isValidElement(element));
    assert.equal(element.type, ResearchResult);
    assert.equal((element.props as { resultId: string }).resultId, id);
    assert.equal(host[INLINE_RESULT_RENDERER]!('result:invalid'), null);
  } finally {
    releases.forEach(release => release());
    await server.close();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
  assert.equal((globalThis as Record<symbol, unknown>)[INLINE_RESULT_RENDERER], undefined);
});
