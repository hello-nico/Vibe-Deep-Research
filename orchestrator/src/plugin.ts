import AjvModule from "ajv";
import { applyCoreFormats, assertKnownFormats } from "./formats.ts";





export interface PageBlockDef {
  /** 块 id:前端按它取数据,**这才是前端该认识的名字**(不是端点 id) */
  readonly id: string;
  readonly title: string;
  /** 这一块在回答什么。展示给用户,不是给开发看的 */
  readonly note?: string;
  readonly endpoint: string;
  readonly symbol?: string;
  readonly args?: Readonly<Record<string, unknown>>;
  /** 缺这一块整屏就没意义 ⇒ 取不到时整屏判失败;否则只标这一块缺 */
  readonly required?: boolean;
  /**
   * 这一块要不要接收业务上下文注入的参数(见 `Plugin.pageContext.resolve` 的 `inject`)。
   * 🔴 默认 **false**。原来是无差别注入给每一块 —— 结果不接受那个参数的端点全被参数校验拒掉,
   *    一屏五块全 missing。注入是**按块**的事:哪个端点吃这个参数,只有声明的人知道。
   */
  readonly injectContext?: boolean;
  /**
   * 注入键的**选取 + 改名表**(`注入时的键 → 这个端点要的参数名`)。
   * **只注入列出的这些键**。吃上下文(`injectContext`)就必须声明它 —— 注册期强制。
   *
   * 🔴 为什么需要:同一个概念,各端点的**参数名**和**取值写法**都不一样。
   *    ① 名字:同一屏里三个端点收 `date`,第四个收 `trade_date` ——
   *       整包注入过去后者当场 `TypeError`,信封 failed、证据 0 条。
   *    ② 写法:同一个日期,有的端点要 `YYYYMMDD`,有的要 `YYYY-MM-DD`。
   *       ⚠️ **写错格式不报错** —— 上游返回空集,端点如实报"池为空 / 无数据",
   *       读起来像真实状况(今天没有),而不像格式不对。**这一类只能靠真跑发现。**
   *    ⇒ 上下文可以同时产出同一概念的多种写法,由各块**显式挑**自己要的那一种。
   * ⚠️ 注册期只校验形状与参数名;**取值写法对不对没人能替你查**,加新块要真跑一次看证据条数。
   */
  readonly injectAs?: Readonly<Record<string, string>>;
  /**
   * 默认收起。一屏块多时,不常看的先收着 ——
   * ⚠️ **收起不等于不取**:数据照常一次取回,收的只是显示。
   *    真想省取数就别把这一块放进这个查询。
   */
  readonly collapsed?: boolean;
  /**
   * 允许用户在界面上改的**参数键白名单**(比如让某一块换个口径看)。没声明 = 一个都不许改。
   *
   * 🔴 白名单是必须的:不设的话,前端能把这一块的**任何**参数换掉 ——
   *    包括那些决定"这一块到底在回答什么"的参数。哪些参数可以由用户拨,
   *    是垂类的判断,不是前端的。
   * ⚠️ 它**不替代**端点自己的参数校验:白名单只管"哪些键可以被覆盖",
   *    值合不合法仍由 `assertArgs` 判。
   */
  readonly userArgs?: readonly string[];
}

export interface PageQueryDef {
  readonly title: string;
  /** 这一页在回答什么问题 —— 首屏要显示它 */
  readonly intent: string;
  readonly blocks: readonly PageBlockDef[];
  /** 这一页要不要先解析业务上下文(见 `Plugin.pageContext`)。true = 要 */
  readonly needsContext?: boolean;
}

export interface PageContextDef {
  /** 解析上下文要先取哪个端点 */
  readonly endpoint: string;
  /** 该端点需要的主体(不需要就不给) */
  readonly symbol?: string;
  /**
   * 从取数信封解析。拿不到就返回 null —— **别编一个默认值**:
   * 编出来的业务日期会让整页显示错误的日子,而且看不出来。
   */
  readonly resolve: (envelope: unknown) => { values: Record<string, unknown>; inject: Record<string, unknown> } | null;
  /** 拿不到时给用户看的话 */
  readonly unavailable: string;
}

export interface LedgerKindDef {
  /** 显示名(界面用);Core 不解释它 */
  readonly label: string;
  /** 字段:JSON Schema 的 properties 片段 */
  readonly properties: Readonly<Record<string, unknown>>;
  /** 其中哪些必填(必须是 properties 的子集) */
  readonly required: readonly string[];
}

export const LEDGER_ENVELOPE_KEYS = ["id", "kind", "created_at", "updated_at"] as const;

const AjvCtor = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as new (o: object) => {
  compile: (s: object) => ((d: unknown) => boolean) & { errors?: { instancePath?: string; message?: string }[] | null };
  addFormat: (name: string, def: { type: "string"; validate: (s: string) => boolean }) => unknown;
};

const ajv = applyCoreFormats(new AjvCtor({ allErrors: true, strict: false, discriminator: true }));

const NONBLANK = { type: "string", minLength: 1, pattern: "\\S" };

const strArray = (extra: object = {}) => ({ type: "array", items: NONBLANK, ...extra });

const mapOf = (values: object) => ({ type: "object", additionalProperties: values });

const RISKY_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function snapshot<T>(value: T, ancestors = new Set<object>()): T {
  if (typeof value === "function" || value === null) return value;
  if (["undefined", "symbol", "bigint"].includes(typeof value)) throw new Error("配置包含非 JSON 值");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("配置不能包含非有限数值");
  if (typeof value !== "object") return value;
  if (ancestors.has(value)) throw new Error("配置不能循环引用");
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype) throw new Error("配置必须使用普通对象");
  ancestors.add(value);
  const out: Record<string, unknown> = array ? [] as unknown as Record<string, unknown> : {};
  if (array && Object.keys(value).length !== value.length) throw new Error("配置不接受稀疏数组");
  for (const key of Object.keys(value)) {
    if (RISKY_KEYS.has(key)) throw new Error(`配置包含保留字段:${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error("配置不接受 getter/setter");
    out[key] = snapshot(descriptor.value, ancestors);
  }
  ancestors.delete(value);
  return Object.freeze(out) as T;
}

const LEDGER_KIND_NAME = { type: "string", pattern: "^[a-z][a-z0-9_]{0,31}$" };

const LEDGER = {
  type: "object", additionalProperties: false, required: ["kinds"],
  properties: {
    kinds: {
      type: "object",
      // 键要过 LEDGER_KIND_NAME;ajv 的 propertyNames 就是干这个的
      propertyNames: LEDGER_KIND_NAME,
      additionalProperties: {
        type: "object", additionalProperties: false, required: ["label", "properties", "required"],
        properties: { label: NONBLANK, properties: { type: "object" }, required: strArray({ uniqueItems: true }) },
      },
    },
    // 显示名:字段键 / 枚举值 → 人话。放在**种类之外**是因为 status 这类枚举跨种类共用
    fieldLabels: mapOf(NONBLANK),
    enumLabels: mapOf(NONBLANK),
  },
};
export interface Plugin {
readonly id: string;
readonly evidence: {
    readonly markets: readonly string[];
    readonly adjustments: readonly string[];
    /** 哪些 market **可以**带全市场读数(symbol=MARKET) */
    readonly marketWideCodes: readonly string[];
    /**
     * 哪些 market **只**用于全市场读数 —— 该市场的个体主体用别的代码。
     * ⚠️ 与上一条是**两回事**:一个市场可以既允许 MARKET、也允许具体主体;
     * 合并成一条会把"某市场的个体证据"全判成错(实测被既有测试抓到)。
     */
    readonly marketWideOnlyCodes: readonly string[];
  };
readonly marketRegion: (market: string) => string;
readonly seriesFor?: (dataRoot: string, endpoint: string) =>
    { observations: unknown[]; exists: boolean; unreadable: boolean; dropped: number };
readonly ledger?: {
    /** 种类名 → 定义。种类名会被拼进文件路径,注册期按安全路径段校验 */
    readonly kinds: Readonly<Record<string, LedgerKindDef>>;
    /**
     * 字段键 → 显示名。**这是垂类知识**:同一个键在不同垂类里叫法完全不同。
     * 🔴 曾经写死在 Core 的表单组件里 —— 界面看着没毛病,但换个垂类就得改 Core,
     *    而纯净度棘轮的词表里恰好一个都没收录,于是**一路绿灯**。
     * ⚠️ 没登记的字段照样渲染(退回原键名),不能因为没起名就整块不显示。
     */
    readonly fieldLabels?: Readonly<Record<string, string>>;
    /** 枚举值 → 显示名。跨种类共用(status 在好几种记录里都出现),所以不挂在种类下 */
    readonly enumLabels?: Readonly<Record<string, string>>;
  };
readonly pageQueries?: Readonly<Record<string, PageQueryDef>>;
readonly pageContext?: PageContextDef;
}

let active: Plugin | null = null;
let source: Plugin | null = null;

/** Only the local data service uses this configuration; DSH owns research execution. */
export function registerPlugin(plugin: Plugin): void {
  if (source === plugin) return;
  if (active) throw new Error(`已注册过插件 ${active.id}`);
  const p = snapshot(plugin);
  const validate = ajv.compile(PLUGIN_SCHEMA);
  if (!validate(p)) throw new Error(`Plugin 不符契约:${JSON.stringify(validate.errors)}`);
  if (typeof p.marketRegion !== "function" || (p.seriesFor && typeof p.seriesFor !== "function")) throw new Error("插件数据函数非法");
  if (p.evidence.marketWideOnlyCodes.some(code => !p.evidence.marketWideCodes.includes(code)) || p.evidence.marketWideCodes.some(code => !p.evidence.markets.includes(code))) throw new Error("市场代码必须满足 Only ⊆ Codes ⊆ markets");
  if (p.pageContext && (typeof p.pageContext.resolve !== "function" || !p.pageContext.endpoint || !p.pageContext.unavailable)) throw new Error("页面上下文非法");
  for (const page of Object.values(p.pageQueries ?? {})) {
    if (page.needsContext && !p.pageContext) throw new Error("页面缺少上下文解析器");
    const ids = new Set<string>();
    for (const block of page.blocks) {
      if (ids.has(block.id)) throw new Error(`页面区块重复:${block.id}`);
      ids.add(block.id);
      if (block.injectContext && (!page.needsContext || !block.injectAs || !Object.keys(block.injectAs).length)) throw new Error(`区块缺少上下文映射:${block.id}`);
    }
  }
  for (const def of Object.values(p.ledger?.kinds ?? {})) {
    if (def.required.some(key => !(key in def.properties)) || LEDGER_ENVELOPE_KEYS.some(key => key in def.properties)) throw new Error("台账字段与信封冲突或缺少必填字段定义");
    assertKnownFormats("ledger", def.properties);
    ajv.compile({ type: "object", properties: def.properties, required: def.required });
  }
  active = p;
  source = plugin;
}

export function currentPlugin(): Plugin {
  if (!active) throw new Error("未注入插件:入口处应先调用 registerPlugin");
  return active;
}
export function hasPlugin(): boolean { return active !== null; }
export function resetPlugin(): void { active = null; source = null; }

const pageQueriesSchema = {
      type: "object",
      additionalProperties: {
        type: "object", additionalProperties: false,
        required: ["title", "intent", "blocks"],
        properties: {
          title: NONBLANK, intent: NONBLANK, needsContext: { type: "boolean" },
          blocks: {
            type: "array", minItems: 1,
            items: {
              type: "object", additionalProperties: false,
              required: ["id", "title", "endpoint"],
              properties: {
                id: { type: "string", pattern: "^[a-z][a-z0-9_]{0,31}$" },
                title: NONBLANK, note: { type: "string" },
                endpoint: NONBLANK, symbol: { type: "string" },
                args: { type: "object" }, required: { type: "boolean" }, injectContext: { type: "boolean" }, collapsed: { type: "boolean" },
                injectAs: { type: "object", additionalProperties: { type: "string", minLength: 1 }, propertyNames: { minLength: 1 } },
                userArgs: strArray({ uniqueItems: true }),
              },
            },
          },
        },
      },
    };

const evidenceSchema = {
      type: "object", additionalProperties: false,
      required: ["markets", "adjustments", "marketWideCodes", "marketWideOnlyCodes"],
      properties: {
        markets: strArray({ minItems: 1, uniqueItems: true }),
        adjustments: strArray({ minItems: 1, uniqueItems: true }),
        marketWideCodes: strArray({ uniqueItems: true }),
        marketWideOnlyCodes: strArray({ uniqueItems: true }),
      },
    };

export const PLUGIN_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "evidence", "marketRegion"], properties: {
    id: NONBLANK, evidence: evidenceSchema, marketRegion: {}, seriesFor: {},
    ledger: LEDGER, pageQueries: pageQueriesSchema, pageContext: {},
  },
};
