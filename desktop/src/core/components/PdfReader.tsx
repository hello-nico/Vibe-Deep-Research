import { useEffect, useMemo, useRef } from 'react';
import { PDFViewer, ScrollPlugin, SelectionPlugin, DocumentManagerPlugin, UIPlugin, ZoomMode, type PluginRegistry } from '@embedpdf/react-pdf-viewer';

export interface PdfSelection { text: string; pages: number[] }
export interface PdfReaderProps {
  src: string;
  initialPage: number;
  onPageChange: (page: number) => void;
  onSelection: (selection: PdfSelection | null) => void;
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
    if (!scroll || !selection) { latest.current.onError(); return; }
    cleanup.current.push(scroll.onLayoutReady(event => {
      focusDocument.current = () => ui?.forDocument(event.documentId).closeSidebarSlot('left', 'main');
      if (event.isInitial) scroll.forDocument(event.documentId).scrollToPage({ pageNumber: Math.min(Math.max(1, latest.current.initialPage), event.totalPages), behavior: 'instant' });
    }));
    cleanup.current.push(scroll.onPageChange(event => latest.current.onPageChange(event.pageNumber)));
    cleanup.current.push(selection.onBeginSelection(() => { selectionRequest++; latest.current.onSelection(null); }));
    cleanup.current.push(selection.onEndSelection(event => {
      const request = ++selectionRequest;
      const pages = [...new Set(selection.getFormattedSelection(event.documentId).map(item => item.pageIndex + 1))].sort((a, b) => a - b);
      void selection.getSelectedText(event.documentId).toPromise().then(parts => {
        if (generation.current !== run || request !== selectionRequest) return;
        const text = parts.join('\n').trim();
        if (text) ui?.forDocument(event.documentId).closeSidebarSlot('left', 'main');
        latest.current.onSelection(text && pages.length ? { text, pages } : null);
      }).catch(() => { if (generation.current === run && request === selectionRequest) latest.current.onSelection(null); });
    }));
    if (documents) cleanup.current.push(documents.onDocumentError(() => latest.current.onError()));
  }
  return <PDFViewer config={config} onReady={ready} style={{ width: '100%', height: '100%' }} />;
}
