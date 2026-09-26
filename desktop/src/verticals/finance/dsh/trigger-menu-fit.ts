// DSH's @ and / menus open upward from the composer and live inside the conversation
// scroll body, which clips them. The room above the composer changes with the window
// and the conversation phase, so a fixed CSS cap cannot fit; measure it instead.
// On a new conversation (hero phase) the composer sits at the top of the scroll body
// with almost no room above; then the menu opens below the composer instead.
const MENU = '[data-trigger-menu]';
const MAX_PX = 352;
const MIN_PX = 160;
const GAP_PX = 8;

function clipBox(node: Element): { top: number; bottom: number } {
  // DSH's conversation scroll body is the clipping box; its data attribute is stable across builds.
  const scroll = node.closest('[data-conversation-scroll]');
  if (scroll) return scroll.getBoundingClientRect();
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowY !== 'visible') return parent.getBoundingClientRect();
  }
  return { top: 0, bottom: window.innerHeight };
}

export function fitTriggerMenu(menu: HTMLElement) {
  menu.style.top = ''; menu.style.bottom = '';
  menu.style.overflowY = 'auto';
  const clip = clipBox(menu);
  // The menu is bottom-anchored above the composer and grows upward, so its bottom edge is the anchor.
  const above = Math.floor(menu.getBoundingClientRect().bottom - clip.top - GAP_PX);
  // The positioning anchor is a zero-height box at the composer card's top edge; the card is its parent.
  const anchor = menu.offsetParent as HTMLElement | null;
  const card = anchor?.parentElement;
  const below = anchor && card ? Math.floor(clip.bottom - card.getBoundingClientRect().bottom - GAP_PX) : 0;
  if (above < MIN_PX && below > above) {
    menu.style.top = `${Math.round(card!.getBoundingClientRect().bottom - anchor!.getBoundingClientRect().top + GAP_PX / 2)}px`;
    menu.style.bottom = 'auto';
    menu.style.maxHeight = `${Math.min(MAX_PX, below)}px`;
    return;
  }
  menu.style.maxHeight = `${Math.max(120, Math.min(MAX_PX, above))}px`;
}

/** Fit every @ and / menu as it appears and when the window resizes; returns a disposer. */
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
