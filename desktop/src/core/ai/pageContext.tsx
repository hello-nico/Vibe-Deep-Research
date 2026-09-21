/**
 * 「当前这一页要给 AI 看什么」的登记处。
 *
 * 以前每个页面**自己**渲染一个「问 AI」按钮，于是只有想起来加的那几页有。
 * 现在按钮固定在右上角、由外壳渲染一份 —— 外壳就必须有办法知道"用户现在看的是哪一页"。
 * ⇒ 页面只**登记**自己的上下文，按钮从这里读。
 *
 * 🔴 这一层是 Core：它不认识任何行业，只搬运页面给的字符串。
 *    上下文写什么、建议问什么，全由垂类的页面决定。
 */
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface AiPage {
  /**
   * 这份对话的归属。**换页 / 换对象都要换 key**，否则上一页的历史会被当成
   * history 发给问下一页的模型（问 A 的记录出现在 B 的对话里）。
   */
  key: string;
  /** 面板上显示的"在聊哪一页" */
  title: string;
  /** 发送时固定的页面快照正文（结构化列表，含来源与取数时点） */
  context: string;
  /** 大盘页 @ 指数时从快照取显示值的结构化索引行 */
  marketIndices?: { id: string; name: string; price: number | null; change_pct: number | null; asOf?: string; source?: string; fetched_at?: string }[];
  /** 大盘页 @ 连板/成交额个股时从快照取显示值 */
  companyQuotes?: CompanySnapshotQuote[];
  /** 空对话时给几个可点的问题 */
  suggestions?: string[];
}

export interface CompanySnapshotQuote {
  id: string;
  name: string;
  symbol: string;
  section?: string;
  price?: number | null;
  change_pct?: number | null;
  amount?: number | null;
  float_cap?: number | null;
  boards?: number | null;
  industry?: string;
  asOf?: string;
  source?: string;
  fetched_at?: string;
}

export interface AssistantObjectRef {
  kind: string;
  id: string;
  label: string;
  version?: string;
  locator?: string;
  url?: string;
  ready?: boolean;
  detail?: string;
  section?: string;
  hint?: string;
  source?: string;
  time?: string;
  readable?: boolean;
}

export type PageAssistantObject = AssistantObjectRef;

interface Store {
  page: AiPage | null;
  set: Dispatch<SetStateAction<AiPage | null>>;
  question: { context: string; pageKey: string; pageContext: string; sequence: number; reference?: { title: string; text: string }; object?: AssistantObjectRef } | null;
  objects: AssistantObjectRef[];
  registered: PageAssistantObject[];
  ask: (context: string, reference?: { title: string; text: string } | AssistantObjectRef) => void;
  cite: (object: AssistantObjectRef) => void;
  uncitate: (id: string) => void;
  clearQuestion: () => void;
  registerPageObjects: (pageKey: string, generation: number, objects: PageAssistantObject[]) => void;
  unregisterPageObjects: (pageKey: string, generation: number) => void;
  queryPageObjects: (query: string) => PageAssistantObject[];
}

const Ctx = createContext<Store | null>(null);

function objectSig(objects: PageAssistantObject[]): string {
  return JSON.stringify(objects.map(item => [item.id, item.label, item.version, item.url, item.hint]));
}

function matchesQuery(object: PageAssistantObject, query: string): boolean {
  if (!query) return true;
  const haystack = [object.label, object.id, object.hint, object.source, object.section, object.time, object.url]
    .filter(Boolean)
    .join('\u0000')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function AiPageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<AiPage | null>(null);
  const [question, setQuestion] = useState<Store['question']>(null);
  const [objects, setObjects] = useState<AssistantObjectRef[]>([]);
  const [registered, setRegistered] = useState<PageAssistantObject[]>([]);
  const registration = useRef({ pageKey: '', generation: 0 });
  const sequence = useRef(0);
  const value = useMemo<Store>(() => ({
    page, set: setPage, question, objects, registered,
    clearQuestion: () => setQuestion(null),
    cite: (object) => {
      setObjects(prev => prev.some(item => item.id === object.id) ? prev : [...prev, object]);
      if (page) setQuestion({ context: object.detail || object.label, object, pageKey: page.key, pageContext: page.context, sequence: ++sequence.current });
    },
    uncitate: (id) => setObjects(prev => prev.filter(item => item.id !== id)),
    ask: (context, reference) => {
      if (!page) return;
      const object = reference && 'id' in reference && 'kind' in reference
        ? reference as AssistantObjectRef
        : reference && 'title' in reference
          ? { kind: 'excerpt', id: `excerpt:${page.key}:${reference.title}`, label: reference.title, locator: reference.title, detail: reference.text, ready: true }
          : undefined;
      if (object) setObjects(prev => prev.some(item => item.id === object.id) ? prev : [...prev, object]);
      setQuestion({ context, reference: reference && 'title' in reference ? reference : undefined, object, pageKey: page.key, pageContext: page.context, sequence: ++sequence.current });
    },
    registerPageObjects: (pageKey, generation, next) => {
      registration.current = { pageKey, generation };
      setRegistered(prev => objectSig(prev) === objectSig(next) ? prev : next);
    },
    unregisterPageObjects: (pageKey, generation) => {
      if (registration.current.pageKey !== pageKey || registration.current.generation !== generation) return;
      registration.current = { pageKey: '', generation: 0 };
      setRegistered([]);
    },
    queryPageObjects: (query) => registered.filter(item => item.readable !== false && matchesQuery(item, query.trim())),
  }), [page, question, objects, registered]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAiQuestion() {
  const store = useContext(Ctx);
  return { question: store?.question, ask: store?.ask, clearQuestion: store?.clearQuestion, objects: store?.objects ?? [], cite: store?.cite, uncitate: store?.uncitate };
}

export function usePageAssistantObjects() {
  const store = useContext(Ctx);
  return {
    objects: store?.registered ?? [],
    query: store?.queryPageObjects ?? (() => [] as PageAssistantObject[]),
  };
}

/**
 * 外壳有没有接上（`AiPageProvider` 挂了没有）。
 * 🔴 分开报,是因为"没接上"和"这页没内容"在界面上长得一模一样 ——
 *    都是按钮灰掉 + 一句"没有可聊的内容"。**把接线故障伪装成内容为空**,
 *    排查时会一路去查页面数据,而根因在路由层漏挂了 Provider。
 */
export function useAiWired(): boolean {
  return useContext(Ctx) !== undefined;
}

export function useCurrentAiPage(): AiPage | null {
  const ctx = useContext(Ctx);
  if (ctx === undefined && import.meta.env.DEV) {
    // 开发期直接炸:漏挂 Provider 是接线 bug,不该等到线上才发现
    throw new Error("AiPageProvider 没有挂上 —— AI 入口读不到页面上下文");
  }
  return ctx?.page ?? null;
}

/**
 * 页面登记自己的上下文。传 `null` = 这一页暂时没什么可聊的（按钮会变成不可点，
 * 而不是消失 —— 时有时无的按钮会被当成坏了）。
 *
 * 🔴 依赖按**内容**比，不按对象比：`context` 每次渲染都是新拼的字符串，
 *    把对象直接放进依赖数组会每帧 setState 一次 —— 死循环，而且表现只是"有点卡"。
 * 🔴 卸载时**只清掉自己登记的那份**：无条件清空会在"旧页卸载晚于新页挂载"的切页顺序里
 *    把新页刚登记的上下文抹掉，表现是换页之后 AI 说"这页没有数据"。
 */
export function useAiPage(page: AiPage | null): void {
  const ctx = useContext(Ctx);
  if (ctx === undefined && import.meta.env.DEV) {
    throw new Error("AiPageProvider 没有挂上 —— 页面登记的上下文会被丢掉");
  }
  const set = ctx?.set;
  const mine = useRef<AiPage | null>(null);

  const has = page !== null;
  const key = page?.key ?? "";
  const title = page?.title ?? "";
  const context = page?.context ?? "";
  const marketIndices = page?.marketIndices;
  const companyQuotes = page?.companyQuotes;
  const marketSig = marketIndices ? JSON.stringify(marketIndices) : "";
  const quoteSig = companyQuotes ? JSON.stringify(companyQuotes) : "";
  // 只为比较用：把建议压成一个字符串，免得数组每次都是新对象
  const sig = page?.suggestions?.join("\u0000") ?? "";

  useEffect(() => {
    if (!set) return;
    const next: AiPage | null = has
      ? {
        key, title, context,
        marketIndices: marketIndices?.length ? marketIndices : undefined,
        companyQuotes: companyQuotes?.length ? companyQuotes : undefined,
        suggestions: sig ? sig.split("\u0000") : [],
      }
      : null;
    mine.current = next;
    set(next);
    return () => {
      set((prev) => (prev === mine.current ? null : prev));
    };
  }, [set, has, key, title, context, marketSig, quoteSig, sig]);
}

/** 当前页已加载对象进入问助手 `@` 范围；卸载或换批次时注销，不抓正文。 */
export function useAiPageObjects(pageKey: string | undefined, objects: PageAssistantObject[]): void {
  const ctx = useContext(Ctx);
  const gen = useRef(0);
  const latest = useRef(objects);
  const register = useRef(ctx?.registerPageObjects);
  const unregister = useRef(ctx?.unregisterPageObjects);
  latest.current = objects;
  register.current = ctx?.registerPageObjects;
  unregister.current = ctx?.unregisterPageObjects;
  const sig = objectSig(objects);
  useEffect(() => {
    if (!pageKey || !register.current) return;
    const generation = ++gen.current;
    register.current(pageKey, generation, latest.current);
    return () => unregister.current?.(pageKey, generation);
  }, [pageKey, sig]);
}
