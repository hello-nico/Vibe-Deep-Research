import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DESKTOP_SHELL_MACOS_CLASS, desktopShellShowsTrafficLights } from '../src/verticals/finance/lib/desktopShell.ts'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/verticals/finance/dsh/client.tsx', import.meta.url), 'utf8')

test('浏览器和全屏不标记，桌面壳 macOS 窗口才标记', () => {
  assert.equal(desktopShellShowsTrafficLights({ desktopGlobal: false, userAgent: 'Mozilla/5.0' }), false)
  assert.equal(desktopShellShowsTrafficLights({ platform: 'win32', desktopGlobal: true, userAgent: 'Electron' }), false)
  assert.equal(desktopShellShowsTrafficLights({ platform: 'darwin', fullscreen: 'true', desktopGlobal: true, userAgent: 'Electron' }), false)
  assert.equal(desktopShellShowsTrafficLights({ platform: 'darwin', desktopGlobal: false, userAgent: 'Mozilla/5.0' }), true)
  assert.equal(desktopShellShowsTrafficLights({
    desktopGlobal: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Electron/44.0.0',
  }), true)
  assert.equal(desktopShellShowsTrafficLights({
    desktopGlobal: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Electron/44.0.0',
  }), false)
})

test('标记类只加在根元素上，浏览器侧栏仍从 14px 起', () => {
  assert.match(client, /installDesktopShellMarker/)
  assert.match(css, /html\.desktop-shell-macos \.workspace-rail \{ padding-top: var\(--dsh-frame-top-clearance, 48px\)/)
  assert.match(css, /\.workspace-rail \{[\s\S]*padding: 14px 0 12px/)
  assert.equal(DESKTOP_SHELL_MACOS_CLASS, 'desktop-shell-macos')
  assert.doesNotMatch(css, /html:not\(\.desktop-shell-macos\) \.workspace-rail/)
})
