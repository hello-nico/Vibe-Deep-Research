/**
 * Product entry into the DSH settings dialog.
 *
 * Public API used (DSH 0.2.1-alpha.2): the `settings.launcher` slot of `@deepseek-ai/dsh-client-ui-settings-general`
 * (`lib/client.js`, SettingsRoot -> renderSlot("settings.launcher", { openSettings: actions.open, ... })). The product
 * registers its own launcher at priority -1, which shadows the account menu of `dsh-client-ui-settings-account`, and
 * keeps the `openSettings` prop it receives. The dialog's section list is the public `settings.section` ledger
 * (ids `general`, `models`), so the model section is selected by its registered label, not by button position.
 */
let opener: (() => void) | null = null;

export function setSettingsOpener(next: (() => void) | null) { opener = next; }

const MODEL_SECTION_LABEL = "模型";

export function openModelSettings(): boolean {
  if (!opener) return false;
  opener();
  const started = Date.now();
  const select = () => {
    const nav = [...document.querySelectorAll<HTMLElement>('[role="dialog"] nav button')]
      .find(button => button.textContent?.trim() === MODEL_SECTION_LABEL);
    if (nav) { if (nav.getAttribute("aria-current") !== "true") nav.click(); return; }
    if (Date.now() - started < 1500) requestAnimationFrame(select);
  };
  requestAnimationFrame(select);
  return true;
}
