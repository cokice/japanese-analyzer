/** Accept only a single HTTP(S) URL, without embedded credentials. */
export function getSingleWebUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^https?:\/\//iu.test(text) || text.length > 8192 || /[\s\u0000-\u001f\u007f<>]/u.test(text)) return null;
  try {
    const url = new URL(text);
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
