import { useEffect, useMemo, useRef } from 'react';
import { PDFViewer, ScrollPlugin, SelectionPlugin, DocumentManagerPlugin, UIPlugin, CommandsPlugin, ZoomMode, type PluginRegistry } from '@embedpdf/react-pdf-viewer';

export interface PdfSelection { text: string; pages: number[] }
export const ASK_COMMAND_ID = 'vibe:ask-assistant';
export const ASK_LABEL = '问助手';
export interface PdfReaderProps {
  src: string;
  initialPage: number;
  onPageChange: (page: number) => void;
  onSelection: (selection: PdfSelection | null) => void;
  /** 浮动工具条里的「问助手」：用户点了才触发；阅读器本身不决定提问去向。 */
  onAsk?: (selection: PdfSelection) => void;
  onError: () => void;
  focusRequest?: number;
}

/** Owns PDF interaction only; source identity and assistant handoff belong to the page. */
export function PdfReader(props: PdfReaderProps) {
  const latest = useRef(props);
  latest.current = props;
  const cleanup = useRef<(() => void)[]>([]);
  const generation = useRef(0);
  const focusDocument = useRef<() => void>(() => {});
  useEffect(() => { if (props.focusRequest) focusDocument.current(); }, [props.focusRequest]);
  useEffect(() => () => { generation.current++; cleanup.current.splice(0).forEach(off => off()); }, []);
  const config = useMemo(() => ({
    src: props.src, wasmUrl: new URL('/finance-pdfium.wasm', window.location.origin).href,
    fontFallback: null, fonts: { ui: null, signature: null }, tabBar: 'never' as const,
    theme: { preference: 'light' as const, light: { accent: { primary: '#ff5722', primaryHover: '#e64a19', primaryActive: '#d84315', primaryLight: '#fff3ed', primaryForeground: '#ffffff' } } },
    zoom: { defaultZoomLevel: ZoomMode.FitWidth }, pan: { defaultMode: 'never' as const },
    disabledCategories: ['panel-comment', 'document-menu', 'annotation', 'redaction', 'form', 'insert', 'signature', 'history', 'document-open', 'document-close', 'document-protect', 'document-capture', 'document-permissions', 'document-export', 'document-print', 'document-fullscreen', 'fullscreen', 'attachment'],
    i18n: { defaultLocale: 'zh-CN' },
  }), [props.src]);

  function ready(registry: PluginRegistry) {
    cleanup.current.splice(0).forEach(off => off());
    const run = ++generation.current;
    let selectionRequest = 0;
    const scroll = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
    const selection = registry.getPlugin<SelectionPlugin>('selection')?.provides();
    const documents = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
    const ui = registry.getPlugin<UIPlugin>('ui')?.provides();
    const commands = registry.getPlugin<CommandsPlugin>('commands')?.provides();
    let picked: PdfSelection | null = null;
    // 选中文字的浮动工具条（复制旁）加「问助手」：走阅读器的命令与界面扩展点，不改阅读器内部。
    if (commands && ui && latest.current.onAsk) {
      commands.registerCommand({
        id: ASK_COMMAND_ID, label: ASK_LABEL, categories: ['selection', 'selection-ask'],
        action: () => { if (picked) latest.current.onAsk?.(picked); },
      });
      const schema = ui.getSchema();
      const menu = schema.selectionMenus?.selection;
      if (menu && !menu.items.some(item => item.id === 'ask-assistant')) {
        ui.mergeSchema({ selectionMenus: { ...schema.selectionMenus, selection: {
          ...menu,
          items: [...menu.items, { type: 'command-button', id: 'ask-assistant', commandId: ASK_COMMAND_ID, variant: 'text', categories: ['selection', 'selection-ask'] }],
          visibilityDependsOn: { itemIds: [...(menu.visibilityDependsOn?.itemIds ?? []), 'ask-assistant'] },
        } } });
      }
    }
    if (!scroll || !selection) { latest.current.onError(); return; }
    cleanup.current.push(scroll.onLayoutReady(event => {
      focusDocument.current = () => ui?.forDocument(event.documentId).closeSidebarSlot('left', 'main');
      if (event.isInitial) scroll.forDocument(event.documentId).scrollToPage({ pageNumber: Math.min(Math.max(1, latest.current.initialPage), event.totalPages), behavior: 'instant' });
    }));
    cleanup.current.push(scroll.onPageChange(event => latest.current.onPageChange(event.pageNumber)));
    cleanup.current.push(selection.onBeginSelection(() => { selectionRequest++; picked = null; latest.current.onSelection(null); }));
    cleanup.current.push(selection.onEndSelection(event => {
      const request = ++selectionRequest;
      const pages = [...new Set(selection.getFormattedSelection(event.documentId).map(item => item.pageIndex + 1))].sort((a, b) => a - b);
      void selection.getSelectedText(event.documentId).toPromise().then(parts => {
        if (generation.current !== run || request !== selectionRequest) return;
        const text = parts.join('\n').trim();
        if (text) ui?.forDocument(event.documentId).closeSidebarSlot('left', 'main');
        picked = text && pages.length ? { text, pages } : null;
        latest.current.onSelection(picked);
      }).catch(() => { if (generation.current === run && request === selectionRequest) latest.current.onSelection(null); });
    }));
    if (documents) cleanup.current.push(documents.onDocumentError(() => latest.current.onError()));
  }
  return <PDFViewer config={config} onReady={ready} style={{ width: '100%', height: '100%' }} />;
}
