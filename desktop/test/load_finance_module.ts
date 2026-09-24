import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export async function loadFinanceModule<T>(relativePath: string): Promise<T> {
  const entry = fileURLToPath(new URL(`../src/verticals/finance/${relativePath}`, import.meta.url));
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', write: false });
  const code = result.outputFiles[0]?.text || '';
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as Promise<T>;
}
