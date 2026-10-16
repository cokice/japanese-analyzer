import { createHash } from 'node:crypto';
import { Converter } from 'opencc-js/cn2t';
import { normalizeKey } from './format.mjs';

const traditional = Converter({ from: 'cn', to: 'tw' });
const tags = new Set(['div', 'span', 'li', 'ul', 'ol', 'ruby', 'rt', 'a', 'table', 'tr', 'td', 'th', 'img', 'br']);
const chineseRoles = new Set(['glossary', 'xref-glossary', 'antonym-glossary', 'sense-note-content', 'info-gloss-content']);
const hash = text => createHash('sha256').update(text).digest('hex');
function traditionalText(text) {
  // Preserve Japanese quote notation and mixed kanji/kana expressions even
  // when the upstream Chinese text did not mark those spans with lang=ja.
  const protectedText = /「[^」]*」|『[^』]*』|[\p{Script=Han}々〇〆]*[\u3041-\u3096\u30a1-\u30faー]+[\p{Script=Han}\u3041-\u3096\u30a1-\u30faー々〇〆]*/gu;
  let previous = 0, result = '';
  for (const match of text.matchAll(protectedText)) { result += traditional(text.slice(previous, match.index)) + match[0]; previous = match.index + match[0].length; }
  return result + traditional(text.slice(previous));
}

// Upstream markup is data, never HTML, CSS, event handlers or executable code.
export function safeContent(value, assets, depth = 0, budget = { nodes: 0 }) {
  if (++budget.nodes > 30_000 || depth > 60) throw new Error('Dictionary content exceeds structural limits');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => safeContent(v, assets, depth + 1, budget));
  if (!value || typeof value !== 'object') throw new Error('Unsupported dictionary content');
  if (value.type === 'structured-content') return safeContent(value.content, assets, depth + 1, budget);
  if (!tags.has(value.tag)) throw new Error(`Unsupported dictionary tag: ${value.tag}`);
  const node = { tag: value.tag };
  if (value.content !== undefined) node.content = safeContent(value.content, assets, depth + 1, budget);
  for (const key of ['lang', 'title', 'alt']) if (typeof value[key] === 'string') node[key] = value[key];
  if (typeof value.data?.content === 'string') node.role = value.data.content;
  if (chineseRoles.has(node.role) || node.lang === 'zh') node.lang = 'zh-Hans';
  if (typeof value.data?.class === 'string') node.label = value.data.class;
  for (const key of ['colSpan', 'rowSpan']) if (Number.isInteger(value[key]) && value[key] > 0 && value[key] <= 100) node[key] = value[key];
  if (value.href !== undefined) {
    if (typeof value.href !== 'string') throw new Error('Invalid dictionary link');
    if (value.href.startsWith('?query=')) {
      const query = new URLSearchParams(value.href.slice(1)).get('query');
      if (!query || [...query].length > 120) throw new Error('Invalid dictionary query link');
      node.href = `https://ichi.moe/cl/word/?q=${encodeURIComponent(query)}`;
    } else {
      const url = new URL(value.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe dictionary link');
      node.href = url.href;
    }
  }
  if (value.tag === 'img') {
    if (typeof value.path !== 'string' || !assets.has(value.path)) throw new Error(`Missing dictionary image: ${value.path}`);
    node.asset = assets.get(value.path);
    if (value.path.startsWith('jitendex/HanaMinA/')) node.glyph = true;
  }
  return node;
}

// Some Jitendex containers say lang=ja even around Chinese glossaries. Only
// explicitly identified Chinese fields change; Japanese quotations/forms do not.
export function traditionalContent(value, chinese = false) {
  if (typeof value === 'string') return chinese ? traditionalText(value) : value;
  if (Array.isArray(value)) return value.map(v => traditionalContent(v, chinese));
  const convert = chineseRoles.has(value.role) || value.lang === 'zh' || value.lang === 'zh-Hans'
    ? true : value.lang === 'ja' || value.lang === 'en' || value.role === 'forms' ? false : chinese;
  return { ...value, ...(value.lang === 'zh' || value.lang === 'zh-Hans' || chineseRoles.has(value.role) ? { lang: 'zh-Hant' } : {}),
    ...(value.content !== undefined ? { content: traditionalContent(value.content, convert) } : {}),
    ...(value.alt && convert ? { alt: traditional(value.alt) } : {}) };
}

export function compatibleForm(entry, spelling, reading) {
  const head = normalizeKey(spelling), kana = normalizeKey(reading || spelling);
  return entry.readings.some(r => normalizeKey(r.text) === kana && (
    !entry.spellings.length ? head === kana : entry.spellings.some(s => normalizeKey(s.text) === head)
      && (r.appliesTo.includes('*') || r.appliesTo.some(s => normalizeKey(s) === head))));
}

export function chineseBlock(row, entry, assets) {
  if (!Number.isSafeInteger(row[6]) || row[6] <= 0 || !entry || !compatibleForm(entry, row[0], row[1])) return null;
  if (!Array.isArray(row[5])) throw new Error('Invalid Yomitan definition');
  const content = safeContent(row[5], assets);
  const fingerprint = hash(JSON.stringify(content));
  return { id: `zh:${entry.id}:${fingerprint.slice(0, 20)}`, content,
    appliesTo: [{ spelling: row[0], reading: row[1] || row[0] }] };
}

export function koreanBlock(row) {
  if (row.lang_code !== 'ja') return null;
  const senses = (row.senses ?? []).filter(s => Array.isArray(s.glosses) && s.glosses.some(g => typeof g === 'string' && g.trim()) && !(s.tags ?? []).includes('no-gloss'));
  if (!senses.length) return null;
  const list = senses.map(s => ({ tag: 'li', content: [
    ...s.glosses.map(text => ({ tag: 'p', content: text })),
    ...(s.tags?.length ? [{ tag: 'small', content: s.tags.join(' · ') }] : []),
    ...(s.examples ?? []).flatMap(e => [
      ...(e.text ? [{ tag: 'div', lang: 'ja', role: 'example-sentence-a', content: e.text }] : []),
      ...(e.translation ? [{ tag: 'div', lang: 'ko', role: 'example-sentence-b', content: e.translation }] : []),
    ]),
  ] }));
  const content = [{ tag: 'span', content: row.pos_title || row.pos }, { tag: 'ol', content: list }];
  return { id: `ko:${hash(JSON.stringify([row.word, row.pos, content])).slice(0, 24)}`, content,
    appliesTo: [{ spelling: row.word, reading: '' }], url: `https://ko.wiktionary.org/wiki/${encodeURIComponent(row.word)}#일본어` };
}
