import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Exercise the shipped shell's own parser, React and Markdown functions. A hash
// or minifier change must fail closed, rather than silently test copied logic.
const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'node_modules/@deepseek-ai/dsh-web-frontend/dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const entry = html.match(/src="([^"]+\/index-[^"]+\.js)"/)?.[1];
assert.ok(entry, 'Cannot locate the loaded web shell');
const filename = path.join(dist, entry.replace(/^\//, ''));
const source = fs.readFileSync(filename, 'utf8');
function region(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Shipped Markdown boundary changed: ${start}`);
  return source.slice(first, last);
}
const vendorImport = source.match(/import\{([^}]+)\}from"(\.\/vendor-[^"]+\.js)"/);
assert.ok(vendorImport, 'Cannot locate the shipped parser vendor');
// The browser vendor allocates one inert entity-decoder element at import time.
// Entity decoding and DOM/KaTeX rendering are outside these fixtures; fail if
// either is accidentally exercised, rather than supply a fake parser result.
const previousDocument = globalThis.document;
globalThis.document = { compatMode: 'CSS1Compat', createElement(name) {
  assert.equal(name, 'i');
  return { set innerHTML(_value) { throw new Error('DOM entity decoding is outside this check'); } };
} };
let vendor;
try { vendor = await import(pathToFileURL(path.join(path.dirname(filename), vendorImport[2])).href); }
finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
const bindings = Object.fromEntries(vendorImport[1].split(',').map(item => {
  const [exported, local = exported] = item.trim().split(/\s+as\s+/);
  return [local, vendor[exported]];
}));
const context = vm.createContext({ ...bindings, URL, console });
const code = [
  region('function Zi(', '(function(){'),
  region('function so(', 'var s0='),
  region('const F_=2;', 'const oj='),
  region('function sj(', 'function lj('),
  region('function Z6(', 'function W0('),
  region('function W0(', 'const t8='),
  region('async function er(', 'const cu='),
  '({ S, l, Bd, qd, jj, _j, _2, X6, Cj, Z6, er })',
].join('\n');
// Only style names and unrelated link icon rendering need bindings. No parser,
// streaming, paragraph, image or protocol behavior is mocked.
Object.assign(context, { wt: { imageAlt: 'imageAlt', image: 'image' }, ao: () => null, V6: function CodeViewBoundary() {} });
const api = vm.runInContext(code, context, { filename });
assert.ok(source.includes('return{react:Bd,"react/jsx-runtime":qd,'), 'React module identity changed');
assert.ok(source.includes('MarkdownText:t8,') && source.includes('writeClipboard:er}'), 'Native Markdown/copy exports changed');
assert.equal(api.Bd.default, api.S);
assert.equal(api.qd.jsx, api.l.jsx);
const ref = 'result:' + 'a'.repeat(32);
const marker = `![走势图](${ref})`;
const labels = { code: {}, footnotes: '注释' };
function text(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).join('');
  return text(value.props?.children);
}
function elements(value, found = []) {
  if (Array.isArray(value)) value.forEach(item => elements(item, found));
  else if (value && typeof value === 'object' && value.props) {
    found.push(value); elements(value.props.children, found);
  }
  return found;
}
const renderer = new api.jj(labels);
const prefixes = [marker, `正文\n\n${marker}`, `前段\n\n中段\n\n${marker}`];
for (const full of prefixes) {
  for (let end = full.indexOf('result:') + 7; end < full.length; end++) {
    const prefix = full.slice(0, end);
    assert.ok(!text(renderer.render(prefix)).includes('result:'), `Streaming reference leaked: ${prefix}`);
    assert.ok(!text(renderer.render(prefix + '\n')).includes('result:'), 'Newline prefix leaked');
  }
}
const key = Symbol.for('vibe.finance.inline-result');
context[key] = id => api.Bd.default.createElement('section', { 'data-result': id }, '交互图');
assert.ok(api.S.isValidElement(context[key](ref)), 'Plugin element rejected by shell React');
for (const output of [api._j(marker, labels), renderer.render(marker), api._j(`> ${marker}`, labels),
  api._j(`- ${marker}\n\n  说明`, labels)]) {
  assert.ok(elements(output).some(item => item.type === 'section'), 'Inline result missing');
  assert.ok(!elements(output).some(item => item.type === 'p' && elements(item.props.children).some(child => child.type === 'section')),
    'Result was wrapped in a paragraph');
}
delete context[key];
assert.equal(text(api._j(marker, labels)), '走势图', 'Unregistered image must fall back to alt');
context[key] = () => null;
assert.equal(text(api._j(marker, labels)), '走势图', 'Null renderer must fall back to alt');
assert.equal(text(api._j(marker.slice(0, -1), labels)), marker.slice(0, -1), 'Finished messages must stay unchanged');
assert.equal(api.Z6('stock-ref:abc'), 'stock-ref:abc');
assert.equal(api.Z6('javascript:alert(1)'), '');
const paragraph = api._j('普通段落', labels);
assert.equal(paragraph[0].type, 'p');
assert.equal(text(paragraph), '普通段落');
const image = elements(api._j('![普通图](https://example.org/image.png)', labels)).find(item => item.type === api.Cj);
assert.equal(image.props.src, 'https://example.org/image.png');
assert.equal(image.props.alt, '普通图');
assert.equal(elements(api._j('[引用](stock-ref:abc)', labels)).find(item => item.props.href)?.props.href, 'stock-ref:abc');
const componentKey = Symbol.for('vibe.finance.components');
const sample = '正文\n\n```vibe\n<chart ref="' + ref + '"/>\n```\n\n尾段';
const before = api._j('```js\nconst x=1\n```', labels);
context[componentKey] = (code, options) => api.S.createElement('section', { 'data-vibe': options.pending ? 'pending' : 'ready', code, options }, options.pending ? '准备中' : '组件');
for (const rendered of [api._j(sample, labels), new api.jj(labels).render(sample)]) {
  const block = elements(rendered).find(item => item.props['data-vibe'] === 'ready');
  assert.ok(block, 'vibe code was not delegated');
  assert.equal(block.props.code, `<chart ref="${ref}"/>`);
  assert.equal(block.props.options.source, sample);
  assert.equal(block.props.options.offset, 4);
  assert.ok(text(rendered).includes('正文') && text(rendered).includes('尾段'));
  assert.ok(!elements(rendered).some(item => item.type === 'p' && elements(item.props.children).some(child => child.type === 'section')));
}
const open = sample.slice(0, sample.indexOf('\n```\n\n尾段'));
for (let end = open.indexOf('<chart'); end <= open.length; end++) {
  const result = new api.jj(labels).render(open.slice(0, end));
  assert.ok(elements(result).some(item => item.props['data-vibe'] === 'pending'), `Open vibe fence leaked at ${end}`);
  assert.ok(!text(result).includes('result:'));
}
const two = sample + '\n\n~~~vibe\n<row>';
const twoElements = elements(new api.jj(labels).render(two));
assert.equal(twoElements.filter(item => item.props['data-vibe'] === 'ready').length, 1);
assert.equal(twoElements.filter(item => item.props['data-vibe'] === 'pending').length, 1);
assert.deepEqual(api._j('```js\nconst x=1\n```', labels), before, 'Ordinary code changed');
delete context[componentKey];
assert.ok(elements(api._j(sample, labels)).some(item => item.props.lang === 'vibe'));
context[componentKey] = () => null;
assert.ok(elements(api._j(sample, labels)).some(item => item.props.lang === 'vibe'));
let copied;
context.navigator = { clipboard: { writeText: async value => { copied = value; } } };
context[Symbol.for('vibe.finance.component-summary')] = value => value === sample ? '正文\n研究图表。\n尾段' : value;
assert.equal(await api.er(sample), true);
assert.equal(copied, '正文\n研究图表。\n尾段');
await api.er('普通原文');
assert.equal(copied, '普通原文');
delete context[Symbol.for('vibe.finance.component-summary')];
await api.er(sample);
assert.equal(copied, sample);
console.log(`PASS: ${path.relative(root, filename)} — shipped vibe delegation, pending fences, copy summary, ordinary code, inline images, fallback, stock-ref and React identity checks`);
