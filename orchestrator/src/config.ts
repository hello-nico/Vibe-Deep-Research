





export const BASE_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ", "PYTHONDONTWRITEBYTECODE",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA"];

export const FETCH_ENV_KEYS = [...BASE_ENV_KEYS, "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "ALL_PROXY", "all_proxy",
  "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"];

export function pickEnv(keys: string[], extra: Record<string, string>, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of keys) {
    const v = source[k];
    if (v !== undefined) env[k] = v;
  }
  return { ...env, ...extra };
}

export const fetchEnv = (extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env) => pickEnv(FETCH_ENV_KEYS, extra, source);

/**
 * DSH 子进程环境白名单（唯一筛选实现，供开发启动与安装脚本共用）。
 * 用途登记：
 * - 基础 OS（BASE_ENV_KEYS）：子进程 spawn（PATH）、家目录回退（HOME）、locale（LANG/LC_*）、临时目录与编码（TMPDIR/TZ/PYTHONDONTWRITEBYTECODE）及 Windows 对应键。
 * - 代理 / 证书：模型 API 与网页取数出站代理、Python 请求证书（SSL_CERT_FILE / REQUESTS_CA_BUNDLE）。
 * - DSH 路径（DSH_HOME）：运行时归属目录。
 * - 原生 Provider 环境变量（DEEPSEEK_API_KEY）：deepseek-official 路由的环境接入路径，由 DSH 原生凭据分层拥有（继承进程环境层优先于存储文件）；只传键名，值不进产品配置。
 */
export const DSH_RUNTIME_ENV_KEYS = [...FETCH_ENV_KEYS, "DSH_HOME", "DEEPSEEK_API_KEY"];
