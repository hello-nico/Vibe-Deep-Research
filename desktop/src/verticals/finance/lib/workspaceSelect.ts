export interface WorkspaceSelectOption<T extends string = string> {
  value: T;
  label: string;
  detail?: string;
}

export function workspaceSelectMatches(option: Pick<WorkspaceSelectOption, "label" | "detail">, query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return `${option.label} ${option.detail ?? ""}`.toLowerCase().includes(text);
}

export function workspaceSelectMenuBox(
  trigger: { top: number; left: number; bottom: number; width: number },
  viewport: { width: number; height: number },
  menu: { height: number; width: number },
  gap = 6,
) {
  const maxHeight = Math.min(420, Math.max(96, viewport.height - 24));
  const height = Math.min(Math.max(menu.height, 1), maxHeight);
  const below = viewport.height - trigger.bottom - gap;
  const above = trigger.top - gap;
  const placeBelow = below >= Math.min(height, 120) || below >= above;
  const top = placeBelow
    ? Math.min(trigger.bottom + gap, Math.max(12, viewport.height - height - 12))
    : Math.max(12, trigger.top - gap - height);
  const minWidth = Math.max(trigger.width, Math.min(menu.width || trigger.width, viewport.width - 24));
  const left = Math.max(12, Math.min(trigger.left, viewport.width - minWidth - 12));
  return { top, left, minWidth, maxHeight };
}
