import React from 'react';
import assert from 'node:assert/strict';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { dictionaryMatch, BUILTIN_DICTIONARY, type DictionaryEntry } from '../app/lib/dictionary';
import DictionaryPanel from '../app/components/DictionaryPanel';
import WordLearningTools from '../app/components/WordLearningTools';
import ConjugationPanel from '../app/components/ConjugationPanel';
import { LanguageProvider } from '../app/contexts/LanguageContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const source = { id: 'experience', name: 'Test dictionary', version: '1', date: '2026-10-16', url: 'https://example.com/dictionary', license: 'CC BY-SA 4.0', licenseUrl: 'https://example.com/license' };
const entry = (text: string, reading: string): DictionaryEntry => ({ id: text, common: true, spellings: [{ text, common: true, tags: [] }], readings: [{ text: reading, common: true, appliesTo: ['*'], tags: [] }], senses: [{ id: `${text}:1`, pos: [], glosses: [`meaning of ${text}`], appliesToSpellings: ['*'], appliesToReadings: ['*'], tags: [], notes: [] }], source });
const model = { endpoint: { baseUrl: 'https://ai.example/v1', model: 'test' } };
const textOf = (node: ReactTestInstance | string): string => typeof node === 'string' ? node : node.children.map(textOf).join('');

async function main() {
  assert.equal(dictionaryMatch(entry('駅', 'えき'), '駅', '', 'えき'), 'surface');
  assert.equal(dictionaryMatch(entry('液', 'えき'), '駅', '', 'えき'), 'reading');
  assert.equal(dictionaryMatch(entry('食べる', 'たべる'), '食べた', '食べる'), 'lemma');
  assert.equal(dictionaryMatch(entry('液', 'えき'), 'エキ'), 'surface', 'An explicit kana query may have multiple equally exact words');
  assert.equal(dictionaryMatch(entry('別', 'べつ'), '駅'), 'other');
  const kana = { ...entry('の', 'の'), spellings: [] };
  assert.equal(dictionaryMatch(kana, 'の'), 'surface', 'Kana-only entries remain primary');

  const originalFetch = globalThis.fetch;
  const descriptors = new Map(['window', 'document', 'localStorage', 'React'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const storage = { getItem: () => null, setItem: () => {} };
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {}, removeEventListener() {}, localStorage: storage } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'zh-CN' }, querySelector: () => null, title: '' } });
  let renderer: ReactTestRenderer | undefined;
  const requests: { path: string; body: Record<string, unknown>; signal: AbortSignal; resolve: (value: Response) => void }[] = [];
  const view = (node: React.ReactNode) => <LanguageProvider>{node}</LanguageProvider>;
  try {
    globalThis.fetch = async (path, init) => new Promise<Response>(resolve => requests.push({ path: String(path), body: JSON.parse(String(init?.body)), signal: init!.signal!, resolve }));
    const dictionary = <DictionaryPanel word="駅" reading="えき" provider={BUILTIN_DICTIONARY} model={model} />;
    await act(async () => { renderer = create(view(dictionary)); });
    await act(async () => { requests[0].resolve(Response.json({ entries: [entry('駅', 'えき'), entry('液', 'えき')], total: 2, offset: 0, hasMore: false, source })); await tick(); });
    const related = renderer!.root.findAllByType('details').find(node => node.props.className.includes('dictionary-related'))!;
    assert.ok(related); assert.notEqual(related.props.open, true, 'Homophones default to collapsed');
    assert.match(textOf(related), /不代表当前选词的含义/);
    assert.equal(related.findAllByType('article')[0].props['data-match'], 'reading');
    assert.equal(renderer!.root.findAllByType('article').find(node => node.props['data-match'] === 'surface')!.findByType('h3').children[0], '駅');
    assert.equal(renderer!.root.findAllByType('summary').some(node => textOf(node) === '外部查询'), false, 'External lookup is never nested inside dictionary senses');
    let noExactMatch = false;
    await act(async () => { renderer!.update(view(<DictionaryPanel word="駅前" reading="えき" provider={BUILTIN_DICTIONARY} model={model} onEmptyChange={empty => { noExactMatch = empty; }} />)); });
    await act(async () => { requests.at(-1)!.resolve(Response.json({ entries: [entry('液', 'えき')], total: 1, offset: 0, hasMore: false, source })); await tick(); });
    assert.ok(noExactMatch, 'Reading-only results still allow the user to request AI lemma identification');
    assert.match(textOf(renderer!.root), /没有本词或原形的精确匹配/);
    await act(async () => { renderer!.unmount(); });
    const dictionaryRequestCount = requests.length;

    const props = { word: '駅の前', tokens: [{ word: '駅', pos: '名詞' }, { word: 'の', pos: '助詞' }, { word: '前', pos: '名詞' }], selectionKind: 'phrase' as const, context: '駅の前。', provider: BUILTIN_DICTIONARY, model };
    await act(async () => { renderer = create(view(<WordLearningTools {...props} />)); });
    assert.equal(requests.length, dictionaryRequestCount, 'Phrase selection does not start a dictionary or model request');
    assert.equal(renderer!.root.findAllByType(DictionaryPanel).length, 0);
    assert.equal(renderer!.root.findAllByType(ConjugationPanel).length, 0, 'Noun phrases do not offer conjugation');
    assert.ok(renderer!.root.findAllByType('summary').some(node => textOf(node) === '外部查询'));
    assert.ok(renderer!.root.findAllByType('a')[0].props.href.endsWith(encodeURIComponent('駅の前')));
    await act(async () => { renderer!.update(view(<WordLearningTools {...props} word="駅" tokens={[{ word: '駅', pos: '名詞' }]} selectionKind="word" />)); });
    assert.equal(renderer!.root.findAllByType(DictionaryPanel).length, 1);
    const disclosures = renderer!.root.findAllByType('details');
    const senses = disclosures.find(node => node.props.className === 'dictionary-results detail-disclosure')!;
    const external = disclosures.find(node => node.props.className === 'detail-disclosure external-dictionary')!;
    assert.ok(senses.parent?.parent === external.parent?.parent, 'Dictionary senses and external lookup share the same DOM level');
    await act(async () => { renderer!.update(view(<WordLearningTools {...props} word="駅の前にいる。" tokens={[...props.tokens, { word: 'に', pos: '助詞' }, { word: 'いる', pos: '動詞' }, { word: '。', pos: '記号' }]} />)); });
    assert.equal(renderer!.root.findAllByType(DictionaryPanel).length, 0, 'Sentence ranges cannot masquerade as word lookups');
    assert.equal(renderer!.root.findAllByType(ConjugationPanel).length, 1);
    const afterSelectionRequests = requests.length;
    assert.equal(requests.filter(value => value.path === '/api/conjugation').length, 0, 'Offering the explanation never calls AI automatically');
    await act(async () => { renderer!.unmount(); });

    const conjugation = (surface: string) => view(<ConjugationPanel surface={surface} lemma="食べる" context="昨日食べた。" model={model} />);
    await act(async () => { renderer = create(conjugation('食べた')); });
    assert.match(textOf(renderer!.root), /原形.*句中形式/);
    assert.match(textOf(renderer!.root), /食べる → 食べた/);
    assert.equal(requests.length, afterSelectionRequests, 'Opening the tool is free of model requests');
    await act(async () => { renderer!.root.findByType('button').props.onClick(); });
    const first = requests.at(-1)!;
    assert.equal(first.path, '/api/conjugation'); assert.equal(first.body.surface, '食べた');
    await act(async () => { renderer!.update(conjugation('食べない')); });
    assert.equal(first.signal.aborted, true);
    await act(async () => { first.resolve(Response.json({ analyses: [{ dictionaryForm: '食べる', steps: [{ form: '食べる', label: '原形' }, { form: '食べた', label: '迟到结果' }], note: '' }], insufficient: false })); await tick(); });
    assert.doesNotMatch(textOf(renderer!.root), /迟到结果/);
    console.log('Dictionary experience passed: homophone separation, kana ambiguity, sibling external lookup, phrase/sentence exclusion, conjugation explanation and cancellation.');
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
