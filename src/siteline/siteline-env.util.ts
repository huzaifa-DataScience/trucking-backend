import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function normalizeSitelineApiToken(raw: string): string {
  let t = raw.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function parseDotEnvLastValue(text: string, key: string): string | null {
  let last = '';
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
    last = key === 'SITELINE_API_TOKEN' ? normalizeSitelineApiToken(v) : v.trim();
  }
  return last || null;
}

export function readLastSitelineSecretFromDotEnv(
  cwd: string,
  key: 'SITELINE_API_TOKEN' | 'SITELINE_API_URL',
): string | null {
  try {
    const p = join(cwd, '.env');
    if (!existsSync(p)) return null;
    return parseDotEnvLastValue(readFileSync(p, 'utf8'), key);
  } catch {
    return null;
  }
}

export function normalizeSitelineApiBase(url: string): string {
  return url.replace(/\/$/, '').replace(/\/graphql$/i, '');
}
