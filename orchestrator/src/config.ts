





const BASE_ENV_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "TZ", "PYTHONDONTWRITEBYTECODE",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA"];

export const FETCH_ENV_KEYS = [...BASE_ENV_KEYS, "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "ALL_PROXY", "all_proxy",
  "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"];

function pickEnv(keys: string[], extra: Record<string, string>, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of keys) {
    const v = source[k];
    if (v !== undefined) env[k] = v;
  }
  return { ...env, ...extra };
}

export const fetchEnv = (extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env) => pickEnv(FETCH_ENV_KEYS, extra, source);
