import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { DictionaryStore, DictionaryUnavailableError } from '../app/api/_utils/dictionaryStore';
import { dictionaryAdapters, lookupDictionary, validateDictionaryResult } from '../app/api/_utils/dictionaryProvider';
import { POST as lookup } from '../app/api/dictionary/lookup/route';
import { POST as resegment } from '../app/api/resegment/route';
import { POST as conjugation } from '../app/api/conjugation/route';
import { POST as translate } from '../app/api/dictionary/translate/route';
import { POST as detail } from '../app/api/word-detail/route';
import { applyTokenEdit, buildReadingGroups, type EditState } from '../app/utils/analysisEditing';
import { parseReadingPreferences, makeShareLink, parseSharedText } from '../app/utils/readingPreferences';
import { externalDictionaryLinks, normalizeDictionaryKey, readDictionarySettings, type DictionaryEntry, type DictionaryResult } from '../app/lib/dictionary';
import { validateCandidates, validateConjugation, validateTranslations } from '../app/lib/learningTools';
import { convertWord } from '../scripts/dictionary/format.mjs';

const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const source = { id: 'fixture', name: 'Fixture JMdict', version: '1', date: '2026-10-05', url: 'https://example.com/dict', license: 'CC BY-SA 4.0', licenseUrl: 'https://example.com/license' };
const word = (id: string, text: string, reading: string, common = false): DictionaryEntry => ({ id, common, spellings: [{ text, common, tags: [] }], readings: [{ text: reading, common, appliesTo: [text], tags: [] }], senses: [{ id: `${id}:0`, pos: ['n'], glosses: ['front'], appliesToSpellings: [text], appliesToReadings: [reading], tags: [], notes: [] }], source });
const response = (entries: DictionaryEntry[] = []): DictionaryResult => ({ entries, total: entries.length, offset: 0, hasMore: false, source });
const request = (data: unknown, headers = {}) => new NextRequest('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
const token = (word: string, pos = '動詞') => ({ word, pos, furigana: word });
const completion = (data: unknown, finish_reason = 'stop') => Response.json({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason }] });

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'ja-dictionary-'));
  const originalFetch = globalThis.fetch;
  const originalCode = process.env.CODE;
  const originalBuiltin = dictionaryAdapters.builtin;
  try {
    const indices: Record<string, string[]> = { '前': ['2','1'], 'まえ': ['1','2'], 'ぜん': ['3','2'], '善': ['3'] };
    const entries: Record<string, DictionaryEntry> = { '1': word('1','前','まえ', true), '2': word('2','前','ぜん'), '3': word('3','善','ぜん', true) };
    const bucket = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 2);
    await mkdir(directory, { recursive: true });
    const files: Record<string, string> = {};
    for (let i = 0; i < 256; i++) for (const [kind, data] of [['index', indices], ['entries', entries]] as const) {
      const b = i.toString(16).padStart(2, '0');
      const buffer = gzipSync(JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key]) => bucket(key) === b))));
      const name = `${kind}-${b}.json.gz`; files[name] = digest(buffer); await writeFile(join(directory, name), buffer);
    }
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ formatVersion: 1, version: '1', source, files, tags: { n: 'noun' } }));
    const store = new DictionaryStore(directory);
    const found = await store.lookup({ query: '前' });
    const initialCacheBytes = store.cachedBytes;
    const concurrent = new DictionaryStore(directory);
    await Promise.all(Array.from({ length: 8 }, () => concurrent.lookup({ query: '前' })));
    assert.equal(concurrent.cachedBytes, initialCacheBytes, 'Concurrent shard loads share one cache entry and budget');
    assert.deepEqual(found.entries.map(e => e.id), ['1','2']);
    assert.deepEqual((await store.lookup({ query: 'ぜん', dictionaryForm: '前' })).entries.map(e => e.id), ['1','2','3'], 'Dictionary-form spellings precede reading-only homophones');
    assert.deepEqual((await store.lookup({ query: '善', dictionaryForm: '前' })).entries.map(e => e.id), ['3','1','2']);
    assert.deepEqual(found.entries[0].senses[0].appliesToReadings, ['まえ']);
    assert.equal((await store.lookup({ query: 'マエ' })).entries.length, 2);
    assert.equal((await store.lookup({ query: 'ない語' })).total, 0);
    assert.equal((await store.lookup({ query: '__proto__' })).total, 0);
    assert.deepEqual((await store.lookup({ query: '前', offset: 20 })).entries, []);
    assert.ok(store.cachedBytes > 0 && store.cachedBytes <= 32 * 1024 * 1024);
    const noCache = new DictionaryStore(directory, 1); await noCache.lookup({ query: '前' }); assert.equal(noCache.cachedBytes, 0);
    await writeFile(join(directory, `index-${bucket('前')}.json.gz`), 'corrupt');
    await assert.rejects(new DictionaryStore(directory).lookup({ query: '前' }), DictionaryUnavailableError);
    await assert.rejects(new DictionaryStore(join(directory, 'missing')).lookup({ query: '前' }), DictionaryUnavailableError);
    assert.equal(normalizeDictionaryKey(' ｶﾀｶﾅ '), 'かたかな');
    assert.equal(readDictionarySettings('{').activeId, 'builtin');
    assert.equal(readDictionarySettings(JSON.stringify({ activeId: 'secret', providers: [{ id: 'bad', adapter: 'script' }] })).providers.length, 1);
    assert.ok(externalDictionaryLinks('表面', '食べる').ichi.endsWith(encodeURIComponent('食べる')));
    // Conversion preserves restrictions instead of attributing every sense to every spelling.
    const converted = convertWord({ id: '3', kanji: [{ text: '前', common: true, tags: [] }], kana: [{ text: 'ぜん', common: false, appliesToKanji: ['前'], tags: [] }], sense: [{ partOfSpeech: ['n-pref'], gloss: [{ lang: 'eng', text: 'previous' }], appliesToKanji: ['前'], appliesToKana: ['ぜん'], field: [], dialect: [], misc: [], info: ['note'] }] });
    assert.deepEqual(converted.senses[0].appliesToReadings, ['ぜん']);

    const base: EditState = { tokens: [token('食べ'), token('られ', '助動詞'), token('なかっ', '助動詞'), token('た', '助動詞'), token('。','記号')], initial: [], groups: [{ start: 0, end: 4 }], taskId: 1, revision: 0, history: [] };
    const edited = applyTokenEdit(base, { start: 0, end: 3 }, [token('食べられなかった')]);
    assert.equal(edited.tokens.map(t => t.word).join(''), base.tokens.map(t => t.word).join(''));
    assert.equal(edited.tokens.at(-1), base.tokens.at(-1)); assert.equal(edited.history.length, 1); assert.deepEqual(edited.groups, []);
    assert.throws(() => applyTokenEdit(base, { start: 0, end: 3 }, [token('食べた')]));
    const repeat = [token('𠮷'), token(' ' ,'記号'), token('𠮷')];
    const repeated = applyTokenEdit({ ...base, tokens: repeat }, { start: 2, end: 2 }, [token('𠮷')]); assert.equal(repeated.tokens[0], repeat[0]);
    assert.deepEqual(buildReadingGroups(base.tokens, []), [{ start: 0, end: 3 }, { start: 4, end: 4 }]);
    assert.deepEqual(buildReadingGroups([token('読ん'), token('で','助詞'),token('いる')], []), [{ start: 0, end: 2 }]);
    assert.equal(buildReadingGroups([token('読む'),token(' ' ,'記号'),token('た','助動詞')], []).length, 3);
    assert.equal(buildReadingGroups(base.tokens, [{ start: 0, end: 9, suppressed: true }]).length, 5);
    assert.deepEqual(buildReadingGroups(base.tokens, [{ start: 0, end: 4 }])[0], { start: 0, end: 1 });
    const candidate = { candidates: [{ tokens: [token('答え'), token('にくい','形容詞')] }] };
    assert.equal(validateCandidates(candidate, '答えにくい').candidates.length, 1);
    assert.throws(() => validateCandidates(candidate, '答えにくい', ['答えに','くい']));
    assert.throws(() => validateCandidates(candidate, '答えやすい'));
    assert.throws(() => validateCandidates({ candidates: [candidate.candidates[0], candidate.candidates[0]] }, '答えにくい'));
    assert.throws(() => validateTranslations({ translations: [{ id: 'wrong', text: 'wrong' }] }, [{ id: '1' }]));
    assert.throws(() => validateConjugation({ analyses: [{ dictionaryForm: '食べる', steps: [{ form: '食べる', label: '原形' }], note: '' }], insufficient: false }, '食べた'));
    const preferences = parseReadingPreferences(null);
    const share = makeShareLink('https://example.com/', '駅の前\n𠮷 & # ? =', { ...preferences, viewMode: 'reading' });
    assert.equal(parseSharedText(new URL(share).hash)?.text, '駅の前\n𠮷 & # ? =');
    assert.equal(parseSharedText('#v=2&q=test'), null);
    for (const address of ['http://localhost:49152', 'http://127.0.0.1:3000', 'tauri://localhost', 'javascript:alert(1)']) assert.throws(() => makeShareLink(address, '駅', preferences));
    assert.throws(() => makeShareLink('https://example.com', '駅'.repeat(1000), preferences), /8 KiB/);
    assert.equal(parseReadingPreferences('invalid').showFurigana, true);

    delete process.env.CODE;
    for (const handler of [lookup, resegment, conjugation, translate]) {
      assert.equal((await handler(new NextRequest('http://localhost/api/test', { method: 'POST', body: 'null' }))).status, 400);
      process.env.CODE = 'protected'; assert.equal((await handler(request({}))).status, 401); delete process.env.CODE;
    }
    assert.equal((await lookup(request({ query: 1 }))).status, 400);
    assert.equal((await lookup(request({ query: '駅', offset: -1 }))).status, 400);
    assert.equal((await lookup(request({ query: '駅', provider: null }))).status, 400);
    const endpoint = { baseUrl: 'https://ai.example/v1', model: 'chosen' };
    const headers = { Authorization: 'Bearer model-key' };
    globalThis.fetch = async (_url, init) => {
      const payload = JSON.parse(String(init?.body)); assert.equal(payload.stream, false); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer model-key');
      assert.equal(payload.response_format.json_schema.strict, true); return completion(candidate);
    };
    assert.equal((await resegment(request({ ...endpoint, selection: '答えにくい', context: '答えにくい。' }, headers))).status, 200);
    assert.equal((await resegment(request({ ...endpoint, selection: '答えやすい', context: '答えやすい。' }, headers))).status, 502);
    assert.equal((await resegment(request({ ...endpoint, selection: '答えにくい', context: '答えにくい。', segments: ['答えに','くい'] }, headers))).status, 502);
    assert.equal((await resegment(request({ ...endpoint, selection: '答え\nにくい', context: '文' }, headers))).status, 400);
    globalThis.fetch = async () => completion({ translations: [{ id: '1', text: '前面' }] });
    assert.equal((await translate(request({ ...endpoint, senses: [{ id: '1', text: 'front' }] }, headers))).status, 200);
    assert.equal((await translate(request({ ...endpoint, senses: [{ id: '2', text: 'front' }] }, headers))).status, 502);
    globalThis.fetch = async () => completion({ analyses: [], insufficient: true });
    assert.equal((await conjugation(request({ ...endpoint, surface: '食べ', context: '食べた' }, headers))).status, 200);
    globalThis.fetch = async () => completion({}, 'length');
    assert.equal((await conjugation(request({ ...endpoint, surface: '食べ', context: '食べた' }, headers))).status, 502);
    globalThis.fetch = async (_url, init) => { const content = JSON.parse(String(init?.body)).messages[0].content; assert.match(content, /standalone lookup/); return completion({ dictionaryForm: '食べる' }); };
    assert.equal((await detail(request({ ...endpoint, word: '食べられなかった', kind: 'lookup' }, headers))).status, 200);

    const provider = { id: 'remote', name: 'Remote', adapter: 'http-v1' as const, lookupUrl: 'https://dict.example/lookup', apiKey: 'dictionary-key' };
    globalThis.fetch = async (url, init) => {
      assert.equal(url, provider.lookupUrl); assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer dictionary-key');
      const data = JSON.parse(String(init?.body)); assert.equal(data.query, '前'); assert.equal(data.sentence, undefined); assert.equal(data.model, undefined);
      return Response.json(response([entries['1']]));
    };
    assert.equal((await lookupDictionary({ query: '前' }, provider, new AbortController().signal)).entries.length, 1);
    assert.throws(() => validateDictionaryResult({ ...response(), source: { ...source, url: 'javascript:alert(1)' } }));
    assert.throws(() => validateDictionaryResult({ ...response(), entries: [{}] }));
    const fallbackResponse = response([entries['1']]);
    // Fallback uses the real bundled dictionary in integration; a temporary singleton lookup is isolated here.
    const { dictionaryStore } = await import('../app/api/_utils/dictionaryStore');
    const builtinLookup = dictionaryStore.lookup; dictionaryStore.lookup = async () => fallbackResponse;
    try {
      globalThis.fetch = async () => Response.json(response());
      assert.equal((await lookupDictionary({ query: '前' }, provider, new AbortController().signal)).fallback, 'empty');
      globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
      assert.equal((await lookupDictionary({ query: '前' }, provider, new AbortController().signal)).fallback, 'timeout');
      globalThis.fetch = async () => Response.json({ malformed: true });
      assert.equal((await lookupDictionary({ query: '前' }, provider, new AbortController().signal)).fallback, 'unavailable');
      await assert.rejects(lookupDictionary({ query: '前' }, provider, new AbortController().signal, true), /连接失败/);
      const controller = new AbortController(); controller.abort();
      await assert.rejects(lookupDictionary({ query: '前' }, provider, controller.signal));
    } finally { dictionaryStore.lookup = builtinLookup; }
    assert.equal((await readFile(join(directory, 'manifest.json'), 'utf8')).includes('fixture'), true);
    console.log('Learning tools passed: dictionary fixtures, adapters/fallback, protected APIs, segmentation invariants, reading groups, translations, conjugation and sharing.');
  } finally { globalThis.fetch = originalFetch; dictionaryAdapters.builtin = originalBuiltin; if (originalCode === undefined) delete process.env.CODE; else process.env.CODE = originalCode; await rm(directory, { recursive: true, force: true }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
