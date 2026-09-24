// DSH's @ menu opens upward from the composer and lives inside the conversation
// scroll body, which clips it. The room above the composer changes with the window
// and the conversation phase, so a fixed CSS cap cannot fit; measure it instead.
const MENU = '[data-trigger-menu]';
const MAX_PX = 352;
const GAP_PX = 8;

function clipTop(node: Element): number {
  // DSH's conversation scroll body is the clipping box; its data attribute is stable across builds.
  const scroll = node.closest('[data-conversation-scroll]');
  if (scroll) return scroll.getBoundingClientRect().top;
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY !== 'visible') return parent.getBoundingClientRect().top;
  }
  return 0;
}

export function fitTriggerMenu(menu: HTMLElement) {
  // The menu is bottom-anchored above the composer and grows upward, so its bottom edge is the anchor.
  const room = Math.floor(menu.getBoundingClientRect().bottom - clipTop(menu) - GAP_PX);
  menu.style.maxHeight = `${Math.max(120, Math.min(MAX_PX, room))}px`;
  menu.style.overflowY = 'auto';
}

/** Fit every @ menu as it appears and when the window resizes; returns a disposer. */
export function installTriggerMenuFit(root: ParentNode = document): () => void {
  const fitAll = () => root.querySelectorAll<HTMLElement>(MENU).forEach(fitTriggerMenu);
  // Measure after layout settles: at insertion time the composer may not be in place yet.
  const fitSoon = () => requestAnimationFrame(() => requestAnimationFrame(fitAll));
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node instanceof Element && (node.matches(MENU) || node.querySelector(MENU))))) fitSoon();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', fitAll);
  return () => { observer.disconnect(); window.removeEventListener('resize', fitAll); };
}
