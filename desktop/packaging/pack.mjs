#!/usr/bin/env node
/** Local unsigned macOS packaging. Only generated cache and new deliveries are mutated. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';

const repository = resolve(import.meta.dirname, '../..');
const revision = '687f282e8625c6b8d11ff58211a90524be2e4317';
const patch = join(import.meta.dirname, 'desktop.patch');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const redact = line => line.replace(/([?&]token=)[^&\s"'<>]+/gu, '$1[redacted]');

export function selectMode(full, current, cached, ready) {
  if (full) return { mode: 'full', reason: '--full' };
  if (!cached || !ready) return { mode: 'full', reason: '完整缓存不存在或不完整' };
  if (current !== cached) return { mode: 'full', reason: '运行环境锁文件或补丁指纹变化' };
  return { mode: 'incremental', reason: '运行环境与补丁指纹一致' };
}

function fingerprint(vibe, dsh) {
  const patches = readdirSync(join(vibe, 'desktop/dsh/runtime/patches')).filter(f => f.endsWith('.patch')).sort();
  if (patches.length !== 10) throw new Error('Expected exactly 10 runtime patches');
  const inputs = [
    ['desktop.patch', patch],
    ['runtime/package-lock.json', join(vibe, 'desktop/dsh/runtime/package-lock.json')],
    ['dsh/pnpm-lock.yaml', join(dsh, 'pnpm-lock.yaml')],
    ...patches.map(f => ['patches/' + f, join(vibe, 'desktop/dsh/runtime/patches', f)]),
  ].map(([path, source]) => ({ path, sha256: hash(readFileSync(source)) }));
  return { sha256: hash(JSON.stringify(inputs)), inputs };
}

function productContract(manifest) {
  return JSON.stringify(Object.fromEntries(['name', 'version', 'dependencies', 'optionalDependencies', 'peerDependencies']
    .map(key => [key, manifest[key] ?? null])));
}

async function main() {
  const { values } = parseArgs({ options: {
    full: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'self-test': { type: 'boolean' },
    'vibe-source': { type: 'string', default: repository },
    'stock-source': { type: 'string', default: resolve(repository, '../Stock-Research') },
    'dsh-source': { type: 'string', default: resolve(repository, '../deepseek-harness') },
    cache: { type: 'string', default: join(repository, '.local/desktop-rc2') },
    downloads: { type: 'string', default: join(homedir(), 'Downloads') },
  } });
  if (values['self-test']) {
    assert.equal(selectMode(false, 'new', 'old', true).mode, 'full');
    assert.equal(selectMode(false, 'same', 'same', true).mode, 'incremental');
    assert.equal(selectMode(false, 'same', 'same', false).mode, 'full');
    assert.equal(selectMode(true, 'same', 'same', true).mode, 'full');
    console.log('PASS: fingerprint change, unchanged cache, incomplete cache, explicit full');
    return;
  }
  const started = Date.now();
  const cache = resolve(values.cache), vibe = resolve(values['vibe-source']), stock = resolve(values['stock-source']);
  const dsh = join(cache, 'dsh-worktree'), desktop = join(dsh, 'apps/desktop');
  const target = join(desktop, '.desktop-build/targets/mac-arm64');
  const statePath = join(cache, 'pack/cache.json');
  const previous = existsSync(statePath) ? json(statePath) : undefined;
  const current = existsSync(join(dsh, 'pnpm-lock.yaml')) ? fingerprint(vibe, dsh) : undefined;
  const ready = ['dsh/desktop-runtime.json', 'runtime/versions.json', 'electron/Electron.app',
    'unsigned-artifacts/mac-arm64/Vibe Finance.app'].every(p => existsSync(join(target, p)));
  let selection = selectMode(values.full, current?.sha256, previous?.fingerprint.sha256, ready);
  if (values['dry-run']) {
    console.log(JSON.stringify({ ...selection, fingerprint: current, cached: previous?.fingerprint.sha256 }, null, 2));
    return;
  }
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Requires Apple Silicon macOS');
  mkdirSync(join(cache, 'pack'), { recursive: true });
  // An exclusive lock prevents two runs from changing the same assembled runtime or delivery label.
  const lock = join(cache, 'pack/running');
  mkdirSync(lock);
  const run = mkdtempSync(join(cache, 'pack/run-'));
  save(join(lock, 'owner.json'), { pid: process.pid, run });
  const log = join(run, 'stages.log');
  const env = {
    PATH: process.env.PATH, TMPDIR: process.env.TMPDIR ?? '/tmp', LANG: 'zh_CN.UTF-8', CI: '1',
    HOME: join(cache, 'build-home'), XDG_CACHE_HOME: join(cache, 'cache'),
    XDG_CONFIG_HOME: join(cache, 'config'), XDG_DATA_HOME: join(cache, 'data'),
    npm_config_userconfig: join(cache, 'npm-user.conf'), npm_config_globalconfig: join(cache, 'npm-global.conf'),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    DSH_DESKTOP_UNSIGNED: '1', DSH_DESKTOP_APP_ID: 'com.vibefinance.desktop',
    DSH_DESKTOP_BRANDING: join(desktop, 'branding.vibe-finance.json'),
    DSH_DESKTOP_TARGET_PLATFORM: 'darwin', DSH_DESKTOP_TARGET_ARCH: 'arm64',
    ELECTRON_CACHE: join(cache, 'electron-cache'), ELECTRON_BUILDER_CACHE: join(cache, 'electron-builder-cache'),
    CSC_IDENTITY_AUTO_DISCOVERY: 'false', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    DSH_DESKTOP_PRODUCT_SOURCE_MODE: 'worktree', DSH_DESKTOP_VIBE_SOURCE: vibe, DSH_DESKTOP_STOCK_SOURCE: stock,
  };
  for (const p of [env.HOME, env.XDG_CONFIG_HOME]) mkdirSync(p, { recursive: true });
  for (const p of [env.npm_config_userconfig, env.npm_config_globalconfig]) writeFileSync(p, '');
  const execute = (command, args, cwd = dsh, environment = env) => new Promise((accept, reject) => {
    console.log(`[pack] ${command === process.execPath ? 'node' : command} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', line => {
      const text = redact(line) + '\n';
      writeFileSync(log, text, { flag: 'a' });
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? accept() : reject(new Error(`${args.join(' ')} exited ${code}; ${log}`)));
  });
  const git = args => execFileSync('git', args, { env, encoding: 'utf8' }).trim();
  try {
    if (!existsSync(dsh)) {
      await execute('git', ['clone', '--no-checkout', '--', resolve(values['dsh-source']), dsh], cache);
      await execute('git', ['checkout', '--detach', revision]);
      await execute('git', ['apply', patch]);
    } else {
      if (git(['-C', dsh, 'rev-parse', 'HEAD']) !== revision) throw new Error('DSH cache must be pinned rc.2');
      try { execFileSync('git', ['apply', '--reverse', '--check', patch], { cwd: dsh, env, stdio: 'pipe' }); }
      catch {
        if (!previous || hash(readFileSync(patch)) === previous.desktopPatchSha256) throw new Error('DSH cache differs from desktop.patch; preserve cache and inspect');
        // Never overwrite unknown dirty source. Update only the exact previous, recorded overlay.
        await execute('git', ['apply', '--reverse', '--check', join(cache, 'pack/applied.patch')]);
        await execute('git', ['apply', '--reverse', join(cache, 'pack/applied.patch')]);
        await execute('git', ['apply', patch]);
      }
    }
    const boot = join(cache, 'bootstrap');
    const pnpm = join(boot, 'package/bin/pnpm.mjs');
    if (!existsSync(pnpm)) {
      mkdirSync(boot, { recursive: true });
      save(join(boot, 'package.json'), { name: 'vibe-packaging-bootstrap', private: true });
      await execute('npm', ['pack', 'pnpm@11.28.5', '--ignore-scripts', '--pack-destination', boot], boot);
      await execute('tar', ['-xzf', join(boot, 'pnpm-11.28.5.tgz'), '-C', boot], boot);
    }
    const pn = (args, environment = env) => execute(process.execPath, [pnpm, ...args], dsh, environment);
    const appCommand = args => pn(['--dir', 'apps/desktop', ...args]);
    const fp = fingerprint(vibe, dsh);
    selection = selectMode(values.full, fp.sha256, previous?.fingerprint.sha256, ready);
    console.log(`[pack] ${selection.mode}: ${selection.reason}`);
    save(join(run, 'fingerprint.json'), fp);
    // Invalidating before mutation also makes interrupted runs fall back to a complete assembly.
    if (existsSync(statePath)) renameSync(statePath, join(run, 'previous-cache.json'));
    if (selection.mode === 'full' || !existsSync(join(dsh, 'node_modules/.modules.yaml'))) {
      await pn(['--config.manage-package-manager-versions=false', 'install', '--frozen-lockfile']);
    }
    await appCommand(['exec', 'node', 'scripts/prepare-product-bundles.mjs']);
    const products = join(target, 'products');
    if (fingerprint(join(products, 'vibe'), dsh).sha256 !== fp.sha256) throw new Error('Runtime inputs changed while snapshotting');
    for (const f of ['worktree-sources.json', 'revisions.json', 'vibe-source-manifest.json', 'stock-source-manifest.json',
      'vibe-worktree.patch', 'stock-worktree.patch', 'vibe-source-snapshot.tar', 'stock-source-snapshot.tar']) copyFileSync(join(products, f), join(run, f));
    const packages = ['vibe-finance-ui', 'stock-research-dsh'].map(name => {
      const filename = readdirSync(join(products, 'packed')).find(f => f.startsWith(name + '-'));
      const tar = join(run, filename);
      copyFileSync(join(products, 'packed', filename), tar);
      const manifest = JSON.parse(execFileSync('tar', ['-xOf', tar, 'package/package.json'], { encoding: 'utf8', env }));
      return { name, tar, sha256: hash(readFileSync(tar)), contract: productContract(manifest) };
    });
    save(join(run, 'products.json'), packages);
    if (selection.mode === 'incremental' && packages.some(p => previous.products.find(old => old.name === p.name)?.contract !== p.contract)) {
      selection = { mode: 'full', reason: '产品版本或生产/peer 依赖变化，需要重新装配闭包' };
      console.log(`[pack] full: ${selection.reason}`);
    }
    if (selection.mode === 'full') {
      await appCommand(['exec', 'tsx', 'scripts/build-product-runtime.ts']);
      await pn(['run', 'release:pack', '--family', 'dsh', '--out', join(target, 'packed/dsh'), '--concurrency', '4']);
      await appCommand(['exec', 'node', 'scripts/prepare-product-patches.mjs']);
      await pn(['--dir', 'apps/desktop-host', 'pack', '--pack-destination', join(target, 'packed/dsh')]);
      await pn(['run', 'release:pack', '--family', 'vendor', '--out', join(target, 'packed/vendor'), '--concurrency', '4']);
      await pn(['--dir', 'native/system', 'run', 'build:ts']);
      mkdirSync(join(target, 'packed/landlock'), { recursive: true });
      await pn(['--dir', 'native/system/packages/entry', 'pack', '--pack-destination', join(target, 'packed/landlock')]);
      await appCommand(['run', 'build']);
      const testEnv = { ...env }; delete testEnv.DSH_DESKTOP_BRANDING;
      await pn(['exec', 'vitest', 'run', ...['desktop-branding', 'project-manager', 'main-startup', 'welcome-startup',
        'welcome-renderer.client', 'welcome-window', 'locale'].map(n => `apps/desktop/tests/${n}.spec.${n.includes('client') ? 'tsx' : 'ts'}`)], testEnv);
      await pn(['exec', 'vitest', 'run', 'apps/desktop/tests/profile-mcp.spec.ts', '-t', 'restores product bundles'], testEnv);
      for (const stage of ['runtime', 'packages', 'dsh']) await appCommand(['run', 'prepare:' + stage]);
    } else {
      // Reuse upstream manifest normalization, descriptor sealing and verification, never relax integrity checks.
      const replacement = join(run, 'replace.mts');
      writeFileSync(replacement, `import {readDesktopRuntime,verifyDesktopRuntime,writeDesktopRuntime} from ${JSON.stringify(pathToFileURL(join(desktop, 'src/runtime-tree.ts')).href)};
import {prepareRuntimeManifests,prepareProductInstallationScope} from ${JSON.stringify(pathToFileURL(join(desktop, 'scripts/prepare-runtime-manifests.ts')).href)};
import {rmSync,mkdirSync} from 'node:fs'; import {execFileSync} from 'node:child_process';
const root=${JSON.stringify(join(target, 'dsh'))}; const old=readDesktopRuntime(root);
await verifyDesktopRuntime(root,old.release.version,old);
for(const p of ${JSON.stringify(packages)}) {const dest=root+'/node_modules/'+p.name; rmSync(dest,{recursive:true,force:true}); mkdirSync(dest,{recursive:true}); execFileSync('tar',['-xzf',p.tar,'--strip-components=1','-C',dest]);}
await prepareProductInstallationScope(root); await prepareRuntimeManifests(root);
writeDesktopRuntime(root,old.release,old.sharedPackages.map(p=>p.name),old); await verifyDesktopRuntime(root,old.release.version,old);
`);
      await pn(['exec', 'tsx', replacement]);
    }
    await appCommand(['exec', 'electron-builder', '--config', 'electron-builder.config.mjs', '--mac', '--arm64', '--dir', '--publish', 'never']);
    await appCommand(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', '--unsigned']);
    const assembled = join(target, 'unsigned-artifacts/mac-arm64/Vibe Finance.app');
    const downloads = resolve(values.downloads);
    mkdirSync(downloads, { recursive: true });
    const labels = readdirSync(downloads).flatMap(file => {
      const match = file.match(/^Vibe Finance r(\d+)\.app$|^Vibe-Finance-0\.2\.1-rc\.2-mac-arm64-unsigned-r(\d+)\.zip$/);
      return match ? [Number(match[1] ?? match[2])] : [];
    });
    let label, zip, delivered;
    for (let n = Math.max(9, ...labels) + 1; ; n++) {
      label = 'r' + n;
      zip = join(downloads, `Vibe-Finance-0.2.1-rc.2-mac-arm64-unsigned-${label}.zip`);
      delivered = join(downloads, `Vibe Finance ${label}.app`);
      if (!existsSync(zip) && !existsSync(delivered)) break;
    }
    const localZip = join(run, 'Vibe-Finance-' + label + '.zip');
    await execute('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', assembled, localZip]);
    copyFileSync(localZip, zip, constants.COPYFILE_EXCL);
    const unpacked = join(run, 'delivery'); mkdirSync(unpacked);
    await execute('ditto', ['-x', '-k', zip, unpacked]);
    mkdirSync(delivered); // Exclusive reservation: rename may only replace our empty directory.
    renameSync(join(unpacked, 'Vibe Finance.app'), delivered);
    const screenshot = await nativeSmoke({ app: delivered, run, dsh, env, full: selection.mode === 'full', execute });
    const receipt = { ...selection, seconds: +( (Date.now() - started) / 1000).toFixed(1), label,
      zip, app: delivered, sha256: hash(readFileSync(zip)), screenshot, products: packages, fingerprint: fp };
    save(join(run, 'result.json'), receipt);
    copyFileSync(patch, join(cache, 'pack/applied.patch'));
    save(statePath, { fingerprint: fp, desktopPatchSha256: hash(readFileSync(patch)), products: packages, run });
    console.log(`PACK mode=${receipt.mode} elapsed=${receipt.seconds}s ZIP=${zip} SHA256=${receipt.sha256} screenshot=${screenshot}`);
    if (selection.mode === 'incremental' && receipt.seconds > 900) throw new Error('STOP: incremental exceeded 15 minutes');
  } catch (error) {
    save(join(run, 'failure.json'), { ...selection, seconds: (Date.now() - started) / 1000,
      error: redact(error.stack ?? String(error)) });
    throw error;
  } finally { rmSync(lock, { recursive: true, force: true }); }
}

export async function nativeSmoke({ app, run, dsh, env, full, execute }) {
  const require = createRequire(join(dsh, 'apps/web/package.json'));
  const { _electron } = require('playwright');
  const yaml = createRequire(join(dsh, 'apps/desktop/package.json'))('js-yaml');
  const home = join(run, 'native-home'); mkdirSync(home);
  const official = join(home, '.dsh/profiles/desktop'); mkdirSync(official, { recursive: true });
  const officialData = join(home, 'Library/Application Support/@deepseek-ai/dsh-desktop'); mkdirSync(officialData, { recursive: true });
  const synthetic = [
    [join(official, 'package.json'), JSON.stringify({ name: 'dsh-profile-desktop', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } })],
    [join(official, 'cordis.patch.yml'), '[]\n'], [join(official, 'cordis.yml'), '# synthetic official\n[]\n'],
    [join(officialData, 'Preferences'), '{}\n'], [join(officialData, 'desktop-settings.json'), '{}\n'],
  ];
  for (const [file, body] of synthetic) writeFileSync(file, body);
  const before = synthetic.map(([file]) => ({ file, sha256: hash(readFileSync(file)) }));
  const officialEntries = () => [join(home, '.dsh'), officialData].flatMap(root =>
    readdirSync(root, { recursive: true }).map(path => join(root, path))).sort();
  const beforeEntries = officialEntries();
  const runtimeEnv = { ...env, HOME: home, USERPROFILE: home, DSH_HOME: join(home, '.dsh'),
    XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_STATE_HOME: join(home, '.state'),
    STOCK_RESEARCH_WORKSPACE: join(home, 'workspace'), STOCK_RESEARCH_BACKEND_URL: 'http://127.0.0.1:8700/api/v1',
    DSH_TELEMETRY_DISABLED: '1', NARB_NATIVE_CACHE_DIR: join(home, 'native-cache') };
  // The packaged brand, rather than a launch override, must own profile/userData isolation.
  for (const key of Object.keys(runtimeEnv)) if (key.startsWith('DSH_DESKTOP_')) delete runtimeEnv[key];
  const screenshots = [];
  const record = { full, officialBefore: before, launches: [] };
  for (let attempt = 0; attempt < (full ? 2 : 1); attempt++) {
    const application = await _electron.launch({ executablePath: join(app, 'Contents/MacOS/Vibe Finance'),
      cwd: run, env: runtimeEnv, timeout: 120_000 });
    const child = application.process();
    const launch = { pid: child.pid, attempt, app, home };
    record.launches.push(launch); save(join(run, 'native.json'), record);
    try {
      // Electron resolves Documents through macOS; set it before onboarding can create its default workspace.
      const documents = join(home, 'Documents'); mkdirSync(documents, { recursive: true });
      await application.evaluate(({ app }, documents) => app.setPath('documents', documents), documents);
      const capture = async (page, name) => {
        await page.bringToFront();
        const mediaSource = await (await application.browserWindow(page)).evaluate(w => {
          w.show(); w.focus(); return w.getMediaSourceId();
        });
        const bounds = await (await application.browserWindow(page)).evaluate(w => w.getBounds());
        // Electron documents the middle component as this BrowserWindow's CGWindowID on macOS.
        const windowId = mediaSource.match(/^window:(\d+):\d+$/)?.[1];
        if (!windowId || windowId === '0') throw new Error('Owned BrowserWindow has no CGWindowID');
        const path = join(run, name + '.png');
        // A rendered page can precede WindowServer's surface after welcome → main or fullscreen transitions.
        await new Promise(r => setTimeout(r, 750));
        await execute('screencapture', ['-x', '-l', windowId, path], run, runtimeEnv);
        screenshots.push({ path, pid: child.pid, windowId, bounds });
        return path;
      };
      let welcome;
      if (attempt === 0) {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          welcome = application.windows().find(p => p.url().includes('welcome'));
          if (welcome) break;
          await new Promise(r => setTimeout(r, 200));
        }
        if (!welcome) throw new Error('Welcome window missing');
        await welcome.getByRole('button', { name: '连接 DeepSeek 开始使用', exact: true }).waitFor({ timeout: 120_000 });
        launch.welcome = await (await application.browserWindow(welcome)).evaluate(w => ({ focused: w.isFocused(), visible: w.isVisible(), alwaysOnTop: w.isAlwaysOnTop() }));
        assert.equal(launch.welcome.visible, true);
        assert.equal(launch.welcome.alwaysOnTop, true);
        if (full) await capture(welcome, 'welcome-entry');
        await welcome.getByRole('button', { name: '连接 DeepSeek 开始使用', exact: true }).click();
        await welcome.getByText('粘贴你的 DeepSeek 密钥', { exact: true }).waitFor();
        if (full) await capture(welcome, 'welcome-key');
        await welcome.getByRole('button', { name: '稍后配置', exact: true }).click();
      }
      const deadline = Date.now() + 120_000;
      let main;
      while (Date.now() < deadline) {
        main = application.windows().find(p => p.url().startsWith('dsh-app://app/'));
        if (main && await main.getByRole('heading', { name: '对话', exact: true }).isVisible()) break;
        await new Promise(r => setTimeout(r, 300));
      }
      if (!main || !await main.getByRole('heading', { name: '对话', exact: true }).isVisible()) throw new Error('Product homepage missing');
      launch.homepage = true;
      await capture(main, attempt ? 'homepage-restart' : 'homepage');
      const band = main.locator('.workspace-window-band');
      launch.windowBand = await band.boundingBox();
      if (full && attempt === 0) {
        assert.equal(launch.windowBand?.height, 36);
        await (await application.browserWindow(main)).evaluate(w => w.setFullScreen(true));
        await main.waitForFunction(() => document.documentElement.dataset.fullscreen === 'true');
        await new Promise(r => setTimeout(r, 1000)); // Native fullscreen animation must finish before window capture.
        assert.equal((await band.boundingBox())?.height ?? 0, 0);
        await capture(main, 'homepage-fullscreen');
        await (await application.browserWindow(main)).evaluate(w => w.setFullScreen(false));
        await main.waitForFunction(() => document.documentElement.dataset.fullscreen !== 'true');
        await main.getByRole('link', { name: '设置', exact: true }).click();
        await main.getByText('连接', { exact: true }).first().waitFor();
        launch.connectionVisible = true;
        await capture(main, 'settings');
      }
      launch.paths = await application.evaluate(({ app }) => ({ userData: app.getPath('userData'), home: process.env.DSH_HOME }));
      assert.ok(launch.paths.userData.startsWith(join(home, '.dsh-products/')));
      assert.ok(launch.paths.home.startsWith(join(home, '.dsh-products/')));
      const product = json(join(home, '.dsh-products/com.vibefinance.desktop/profiles/desktop/package.json'));
      for (const name of ['vibe-finance-ui', 'stock-research-dsh']) assert.ok(product.dsh.profile.bundles.includes(name));
      const preference = join(home, '.dsh-products/com.vibefinance.desktop/profiles/desktop/cordis.patch.yml');
      // Only this credential-free fixture's ui-chat preference is examined; never read a credential store.
      const section = yaml.load(readFileSync(preference, 'utf8')).find(p => p.id === 'ui-chat');
      launch.transcriptView = section?.config?.transcriptView;
      assert.equal(launch.transcriptView, attempt === 0 ? 'compact' : 'detailed');
    } finally {
      // Own Electron process only; use its real quit flow and confirm its owned modal.
      const closed = child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve({ code: child.exitCode, signal: child.signalCode })
        : new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
      // Cleanup fixture: accept this process's quit confirmation without interacting with other apps.
      launch.quitConfirmation = 'test fixture accepts own confirmation';
      await application.evaluate(({ app, dialog }) => {
        dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
        setTimeout(() => app.quit(), 0);
      });
      const deadline = Date.now() + 30_000;
      while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
        for (const page of application.windows()) {
          const button = page.getByRole('button', { name: '退出', exact: true });
          if (await button.isVisible().catch(() => false)) await button.click().catch(() => {});
        }
        await new Promise(r => setTimeout(r, 200));
      }
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); throw new Error('Owned application did not quit normally'); }
      launch.exit = await closed;
      assert.equal(launch.exit.code, 0, 'Owned application must exit normally');
      save(join(run, 'native.json'), record);
    }
    assert.deepEqual(officialEntries(), beforeEntries, 'Official synthetic directory entries changed');
    for (const file of before) assert.equal(hash(readFileSync(file.file)), file.sha256, 'Official synthetic file changed');
    if (full && attempt === 0) {
      const preference = join(home, '.dsh-products/com.vibefinance.desktop/profiles/desktop/cordis.patch.yml');
      const entries = yaml.load(readFileSync(preference, 'utf8'));
      entries.find(p => p.id === 'ui-chat').config.transcriptView = 'detailed';
      writeFileSync(preference, yaml.dump(entries));
    }
  }
  record.officialUnchanged = true; record.screenshots = screenshots;
  save(join(run, 'native.json'), record);
  return screenshots.find(s => s.path.endsWith('/homepage.png')).path;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await main().catch(error => { console.error(redact(error.stack ?? String(error))); process.exitCode = 1; });
}
