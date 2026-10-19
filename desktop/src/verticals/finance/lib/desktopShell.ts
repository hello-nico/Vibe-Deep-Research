/** Desktop-shell macOS window marker. The browser workspace has no traffic lights and stays unmarked. */

export const DESKTOP_SHELL_MACOS_CLASS = 'desktop-shell-macos'

export interface DesktopShellSignals {
  platform?: string
  fullscreen?: string
  desktopGlobal: boolean
  userAgent: string
}

/** True only while the Desktop shell is showing macOS traffic lights over this document. */
export function desktopShellShowsTrafficLights(signals: DesktopShellSignals): boolean {
  if (signals.fullscreen === 'true') return false
  if (signals.platform === 'darwin') return true
  return signals.desktopGlobal && /Electron/i.test(signals.userAgent) && /Mac OS X|Macintosh/i.test(signals.userAgent)
}

/** Read the shell preload mark, with the preload global and Electron user agent as the fallback. */
export function readDesktopShellSignals(root: Pick<HTMLElement, 'dataset'> = document.documentElement, userAgent = navigator.userAgent): DesktopShellSignals {
  return {
    platform: root.dataset.platform,
    fullscreen: root.dataset.fullscreen,
    desktopGlobal: 'dshDesktop' in globalThis,
    userAgent,
  }
}

/** Add or remove the marker class. Fullscreen hides the traffic lights, so the class comes off. */
export function syncDesktopShellMarker(root: HTMLElement = document.documentElement, userAgent = navigator.userAgent): boolean {
  const marked = desktopShellShowsTrafficLights(readDesktopShellSignals(root, userAgent))
  root.classList.toggle(DESKTOP_SHELL_MACOS_CLASS, marked)
  return marked
}

/** Keep the marker aligned with the shell's platform and fullscreen attributes. */
export function installDesktopShellMarker(root: HTMLElement = document.documentElement): () => void {
  if (typeof MutationObserver === 'undefined') {
    syncDesktopShellMarker(root)
    return () => {}
  }
  const sync = (): void => { syncDesktopShellMarker(root) }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(root, { attributes: true, attributeFilter: ['data-platform', 'data-fullscreen'] })
  return () => observer.disconnect()
}
