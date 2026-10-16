import React from 'react';
import assert from 'node:assert/strict';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { LanguageProvider, useLanguage } from '../app/contexts/LanguageContext';
import DictionaryPanel from '../app/components/DictionaryPanel';
import { BUILTIN_DICTIONARY, type DictionaryEntry, type DictionaryLocalization } from '../app/lib/dictionary';
import { DictionaryContent } from '../app/components/DictionaryContent';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise<void>(r => setImmediate(r));
const text = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(text).join('');
const source = { id: 'jmdict', name: 'JMdict', version: 'fixture', date: '2026-10-16', url: 'https://example.com/dictionary', license: 'CC BY-SA 4.0', licenseUrl: 'https://example.com/license' };
const localized = (language: 'zh-Hans' | 'ko'): DictionaryLocalization => ({ language, source: { ...source, id: language, name: `Source ${language}` }, origin: language === 'ko' ? 'dictionary-original' : 'community-machine-translation', upstreamDate: '2026-10-01', blocks: [{ id: `${language}:independent`, appliesTo: [{ spelling: '駅', reading: 'えき' }], content: { tag: 'ul', role: 'glossary', content: { tag: 'li', content: language === 'ko' ? '역' : '火车站' } } }] });
const entry = (language?: 'zh-Hans' | 'ko'): DictionaryEntry => ({ id: 'locale-ui', common: true, spellings: [{ text: '駅', common: true, tags: [] }], readings: [{ text: 'えき', common: true, appliesTo: ['*'], tags: [] }], senses: [{ id: 'english:independent', pos: ['n'], glosses: ['station'], appliesToSpellings: ['*'], appliesToReadings: ['*'], tags: [], notes: [] }], source, localizations: language ? [localized(language)] : [] });
const result = (language?: 'zh-Hans' | 'ko') => ({ entries: [entry(language)], total: 1, offset: 0, hasMore: false, source, localizationStatus: { language: language || 'zh-Hans', status: 'ready' } });
async function main() {
  const descriptors = new Map(['React', 'window', 'document', 'localStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const originalFetch = globalThis.fetch;
  const storage = { getItem: () => 'zh-CN', setItem: () => {} };
  let renderer: ReactTestRenderer | undefined;
  try {
    Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: storage } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'zh-CN' }, querySelector: () => null } });
    await act(async () => { renderer = create(<LanguageProvider><DictionaryContent content={{ tag: 'table', content: { tag: 'tr', content: { tag: 'td', label: 'form-pri' } } }} /></LanguageProvider>); });
    assert.equal(renderer!.root.findByType('tr').parent?.type, 'tbody');
    assert.equal(renderer!.root.findByType('td').findByType('span').props['aria-label'], '常用写法');
    assert.match(text(renderer!.root), /★/);
    await act(async () => { renderer!.unmount(); });
    const pending: { path: string; headers: Headers; body: Record<string, unknown>; signal: AbortSignal; resolve: (r: Response) => void }[] = [];
    globalThis.fetch = async (path, init) => new Promise<Response>(resolve => pending.push({ path: String(path), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)), signal: init!.signal!, resolve }));
    let language!: ReturnType<typeof useLanguage>;
    function Control() { language = useLanguage(); return null; }
    const view = (modelName = 'model-one', word = '駅') => <LanguageProvider><Control /><DictionaryPanel standalone word={word} provider={BUILTIN_DICTIONARY} model={{ endpoint: { model: modelName, baseUrl: 'https://example.com/v1' } }} /></LanguageProvider>;
    await act(async () => { renderer = create(view()); });
    await act(async () => { pending[0].resolve(Response.json(result('zh-Hans'))); await tick(); });
    assert.equal(pending.length, 1, 'Included translations never start a model request');
    assert.match(text(renderer!.root), /社区机器译文/); assert.match(text(renderer!.root), /火车站/);
    const original = () => renderer!.root.findAllByType('details').find(n => n.props.className === 'dictionary-original')!;
    assert.equal(original().props.open, false, 'English is available for checking but initially collapsed');
    const translate = () => renderer!.root.findAllByType('button').find(n => text(n).includes('用 AI 翻译'))!;
    await act(async () => { translate().props.onClick(); });
    assert.equal(pending[1].path, '/api/dictionary/translate');
    assert.deepEqual(pending[1].body.senses, [{ id: 'english:independent', text: 'station' }], 'Community blocks are never treated as aligned English senses');
    await act(async () => { renderer!.update(view('model-two')); });
    assert.equal(pending[1].signal.aborted, true);
    await act(async () => { pending[1].resolve(Response.json({ translations: [{ id: 'english:independent', text: '迟到译文' }] })); await tick(); });
    assert.doesNotMatch(text(renderer!.root), /迟到译文/);
    await act(async () => { translate().props.onClick(); });
    await act(async () => { pending.at(-1)!.resolve(Response.json({ translations: [{ id: 'wrong-id', text: '错误对应' }] })); await tick(); });
    assert.doesNotMatch(text(renderer!.root), /错误对应/); assert.match(text(renderer!.root), /station/);
    await act(async () => { translate().props.onClick(); });
    await act(async () => { pending.at(-1)!.resolve(Response.json({ translations: [{ id: 'english:independent', text: '车站（当前模型）' }] })); await tick(); });
    assert.match(text(renderer!.root), /车站（当前模型）/); assert.match(text(renderer!.root), /火车站/);
    await act(async () => { language.setLocale('ko'); });
    assert.equal(pending.at(-1)!.headers.get('X-App-Locale'), 'ko');
    assert.doesNotMatch(text(renderer!.root), /车站（当前模型）/);
    await act(async () => { pending.at(-1)!.resolve(Response.json(result('ko'))); await tick(); });
    assert.match(text(renderer!.root), /역/); assert.match(text(renderer!.root), /사전 원문/);
    await act(async () => { language.setLocale('en'); });
    await act(async () => { pending.at(-1)!.resolve(Response.json(result())); await tick(); });
    assert.equal(renderer!.root.findAllByType('button').some(n => /Translate with AI/.test(text(n))), false);
    const before = pending.length;
    await act(async () => { language.setLocale('zh-CN'); await tick(); });
    assert.equal(pending.length, before, 'Switching back reuses the correct locale dictionary cache');
    await act(async () => { translate().props.onClick(); });
    assert.equal(pending.length, before, 'Only complete successful AI translations are cached per model/locale');
    assert.match(text(renderer!.root), /车站（当前模型）/);
    await act(async () => { renderer!.update(view('model-two', '駅前')); });
    await act(async () => { pending.at(-1)!.resolve(Response.json({ ...result(), localizationStatus: { language: 'zh-Hans', status: 'unavailable' } })); await tick(); });
    assert.match(text(renderer!.root), /当前语言词典暂不可用/);
    assert.doesNotMatch(text(renderer!.root), /暂无当前语言的内置解释/);
    console.log('Localized UI passed: no automatic AI, independent originals, model cancellation, sense validation, language switches and cache isolation.');
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
