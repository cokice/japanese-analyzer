export interface ReadingPreferences { showFurigana: boolean; showRomaji: boolean; viewMode: 'lexical' | 'reading'; }
export const DEFAULT_READING_PREFERENCES: ReadingPreferences = { showFurigana: true, showRomaji: false, viewMode: 'lexical' };
export const READING_PREFERENCES_KEY = 'japaneseAnalyzer:reading:v1';
export const SHARE_BASE_KEY = 'japaneseAnalyzer:shareBase:v1';
export function parseReadingPreferences(raw: string | null): ReadingPreferences {
  try { const data = JSON.parse(raw || '{}'); return { showFurigana: typeof data.showFurigana === 'boolean' ? data.showFurigana : true, showRomaji: typeof data.showRomaji === 'boolean' ? data.showRomaji : false, viewMode: data.viewMode === 'reading' ? 'reading' : 'lexical' }; } catch { return { ...DEFAULT_READING_PREFERENCES }; }
}
export function parseSharedText(hash: string): { text: string; preferences: ReadingPreferences } | null {
  try {
    if (new TextEncoder().encode(hash).length > 8192) return null;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (params.get('v') !== '1' || !params.has('q') || !['0','1'].includes(params.get('f') || '') || !['0','1'].includes(params.get('r') || '') || !['lexical','reading'].includes(params.get('view') || '')) return null;
    return { text: params.get('q')!, preferences: { showFurigana: params.get('f') === '1', showRomaji: params.get('r') === '1', viewMode: params.get('view') as ReadingPreferences['viewMode'] } };
  } catch { return null; }
}
export function isLocalShareAddress(address: string): boolean {
  try { const u = new URL(address); return !/^https?:$/.test(u.protocol) || ['localhost','127.0.0.1','[::1]','tauri.localhost'].includes(u.hostname) || u.hostname.endsWith('.localhost'); } catch { return true; }
}
export function makeShareLink(base: string, text: string, preferences: ReadingPreferences): string {
  if (isLocalShareAddress(base)) throw new Error('请填写公开分享地址');
  const url = new URL(base); if (url.username || url.password) throw new Error('请填写公开分享地址');
  url.search = ''; url.hash = new URLSearchParams({ v: '1', q: text, f: preferences.showFurigana ? '1' : '0', r: preferences.showRomaji ? '1' : '0', view: preferences.viewMode }).toString();
  if (new TextEncoder().encode(url.href).length > 8192) throw new Error('分享链接超过 8 KiB，请复制原文');
  return url.href;
}
