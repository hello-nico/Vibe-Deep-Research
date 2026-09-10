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
  /** 随提问一起发给模型的本页数据 */
  context: string;
  /** 空对话时给几个可点的问题 */
  suggestions?: string[];
}

interface Store {
  page: AiPage | null;
  set: Dispatch<SetStateAction<AiPage | null>>;
  question: { context: string; pageKey: string; pageContext: string; sequence: number; reference?: { title: string; text: string } } | null;
  ask: (context: string, reference?: { title: string; text: string }) => void;
  clearQuestion: () => void;
}

const Ctx = createContext<Store | null>(null);

export function AiPageProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<AiPage | null>(null);
  const [question, setQuestion] = useState<Store['question']>(null);
  const sequence = useRef(0);
  const value = useMemo<Store>(() => ({ page, set: setPage, question, clearQuestion: () => setQuestion(null), ask: (context, reference) => {
    if (page) setQuestion({ context, reference, pageKey: page.key, pageContext: page.context, sequence: ++sequence.current });
  } }), [page, question]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAiQuestion() {
  const store = useContext(Ctx);
  return { question: store?.question, ask: store?.ask, clearQuestion: store?.clearQuestion };
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
  // 只为比较用：把建议压成一个字符串，免得数组每次都是新对象
  const sig = page?.suggestions?.join("\u0000") ?? "";

  useEffect(() => {
    if (!set) return;
    const next: AiPage | null = has
      ? { key, title, context, suggestions: sig ? sig.split("\u0000") : [] }
      : null;
    mine.current = next;
    set(next);
    return () => {
      set((prev) => (prev === mine.current ? null : prev));
    };
  }, [set, has, key, title, context, sig]);
}
