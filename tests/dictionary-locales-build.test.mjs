import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { safeContent, traditionalContent, compatibleForm, chineseBlock, koreanBlock } from '../scripts/dictionary/localized-format.mjs';
import { readZip } from '../scripts/dictionary/prepare-locales.mjs';
import { checkLocalizedDates } from '../scripts/dictionary/update-locales.mjs';
import { digest } from '../scripts/dictionary/prepare.mjs';

test('Chinese conversion preserves structure, form restrictions, stable independent IDs and Japanese quotations', () => {
  const entry = { id: '1', spellings: [{ text: '食べる' }, { text: '喰べる' }], readings: [{ text: 'たべる', appliesTo: ['食べる'] }] };
  assert.equal(compatibleForm(entry, '食べる', 'タベル'), true);
  assert.equal(compatibleForm(entry, '喰べる', 'たべる'), false);
  const content = [{ type: 'structured-content', content: { tag: 'div', lang: 'ja', content: [
    { tag: 'ul', data: { content: 'glossary' }, content: { tag: 'li', content: '火车站「国」国に帰る' } },
    { tag: 'span', lang: 'ja', content: '火车站・言葉・食べる' },
    { tag: 'span', lang: 'zh', content: '我到车站了。' },
    { tag: 'table', content: { tag: 'tr', content: { tag: 'td', rowSpan: 2, content: '日语原文' } } },
    { tag: 'img', path: 'glyph.svg', alt: '字形' },
  ] } }];
  const row = ['食べる', 'たべる', '', '', 0, content, 1, ''];
  const block = chineseBlock(row, entry, new Map([['glyph.svg', 'a'.repeat(64)]]));
  assert.ok(block.id.startsWith('zh:1:')); assert.notEqual(block.id, '1:0');
  assert.deepEqual(block.appliesTo, [{ spelling: '食べる', reading: 'たべる' }]);
  const hant = traditionalContent(block.content);
  assert.match(JSON.stringify(hant), /火車站/); assert.match(JSON.stringify(hant), /我到車站了/);
  assert.match(JSON.stringify(hant), /「国」国に帰る/);
  assert.match(JSON.stringify(hant), /火车站・言葉・食べる/); assert.match(JSON.stringify(hant), /日语原文/);
  assert.match(JSON.stringify(hant), /"rowSpan":2/); assert.match(JSON.stringify(hant), /"asset":"aaaa/);
  assert.equal(chineseBlock({ ...row, 6: -1 }, entry, new Map()), null);
  assert.equal(chineseBlock(['喰べる', 'たべる', '', '', 0, content, 1], entry, new Map()), null);
  const kana = { id: '2', spellings: [], readings: [{ text: 'の', appliesTo: ['*'] }] };
  assert.ok(compatibleForm(kana, 'の', 'の'));
});
test('rich content accepts only safe nodes and assets and bounds nested data', () => {
  const assets = new Map();
  assert.throws(() => safeContent({ tag: 'script', content: 'alert(1)' }, assets), /Unsupported/);
  assert.throws(() => safeContent({ tag: 'a', href: 'javascript:alert(1)' }, assets), /Unsafe/);
  assert.throws(() => safeContent({ tag: 'img', path: '../bad.svg' }, assets), /Missing/);
  let deep = 'text'; for (let i = 0; i < 65; i++) deep = { tag: 'div', content: deep };
  assert.throws(() => safeContent(deep, assets), /limits/);
  const link = safeContent({ tag: 'a', href: '?query=駅&wildcards=off', style: { color: 'red' }, onclick: 'alert(1)', content: '駅' }, assets);
  assert.equal(link.href, 'https://ichi.moe/cl/word/?q=%E9%A7%85'); assert.equal(link.style, undefined); assert.equal(link.onclick, undefined);
  assert.throws(() => readZip(zipSync({ '../escape.json': Buffer.from('{}') })), /Unsafe/);
  assert.throws(() => readZip(zipSync({ 'huge.json': Buffer.alloc(8 * 1024 * 1024 + 1) })), /Unsafe/);
});
test('Korean records retain definitions and examples and have their own IDs/source links', () => {
  const block = koreanBlock({ lang_code: 'ja', word: '食べる', pos: 'verb', pos_title: '동사', senses: [{ glosses: ['먹다'], examples: [{ text: '食べる。', translation: '먹다.' }] }] });
  assert.ok(block.id.startsWith('ko:')); assert.match(block.url, /ko\.wiktionary\.org/);
  assert.match(JSON.stringify(block.content), /먹다/); assert.match(JSON.stringify(block.content), /食べる/);
  assert.equal(koreanBlock({ lang_code: 'ko', senses: [{ glosses: ['not Japanese'] }] }), null);
  assert.equal(koreanBlock({ lang_code: 'ja', word: 'missing', senses: [{ tags: ['no-gloss'] }] }), null);
});
test('pinned snapshots reproduce independently of mutable Kaikki URLs; dates use independent limits', async () => {
  const lock = JSON.parse(await readFile(new URL('../dictionary.locales.lock.json', import.meta.url)));
  const bytes = await readFile(new URL(`../${lock.sources.ko.snapshot}`, import.meta.url));
  assert.equal(digest(bytes), lock.sources.ko.sha256); assert.match(lock.sources.zh.sha256, /^[a-f0-9]{64}$/);
  const rows = gunzipSync(bytes).toString().trim().split('\n').map(line => JSON.parse(line));
  assert.ok(rows.length >= 10_000); assert.ok(rows.every(row => row.lang_code === 'ja'));
  const now = Date.parse('2026-10-16T00:00:00Z'); checkLocalizedDates(lock, now);
  assert.throws(() => checkLocalizedDates({ sources: { zh: { date: '2026-07-17', upstreamDate: '2026-08-11' } } }, now), /90 days/);
  assert.throws(() => checkLocalizedDates({ sources: { ko: { date: '2026-10-15', upstreamDate: '2026-01-01' } } }, now), /180 days/);
});
