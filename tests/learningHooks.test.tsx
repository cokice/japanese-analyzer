import React from 'react';
import assert from 'node:assert/strict';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useDictionary } from '../app/hooks/useDictionary';
import { useAnalysisEditing } from '../app/hooks/useAnalysisEditing';
import { useReadingPreferences } from '../app/hooks/useReadingPreferences';
import { BUILTIN_DICTIONARY, type DictionaryProvider } from '../app/lib/dictionary';
import { makeShareLink, READING_PREFERENCES_KEY } from '../app/utils/readingPreferences';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const source = { id: 'test', name: 'test', version: '1', date: '2026-10-05', url: 'https://example.com', license: 'CC BY-SA 4.0', licenseUrl: 'https://example.com/license' };
const result = (id: string) => ({ entries: id ? [{ id, source }] : [], total: id ? 1 : 0, offset: 0, hasMore: false, source });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function main() {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let renderer: ReactTestRenderer | undefined;
  try {
    const pending: { data: Record<string, unknown>; signal: AbortSignal; resolve: (r: Response) => void; reject: (e: Error) => void }[] = [];
    globalThis.fetch = async (_url, init) => new Promise<Response>((resolve, reject) => pending.push({ data: JSON.parse(String(init?.body)), signal: init!.signal!, resolve, reject }));
    let dictionary!: ReturnType<typeof useDictionary>;
    function DictionaryHarness({ word, lemma = '', provider = BUILTIN_DICTIONARY }: { word: string; lemma?: string; provider?: DictionaryProvider }) { dictionary = useDictionary(word, lemma, '', provider); return null; }
    await act(async () => { renderer = create(<DictionaryHarness word="駅" />); });
    assert.equal(pending.length, 1);
    await act(async () => { renderer!.update(<DictionaryHarness word="前" />); });
    assert.equal(pending[0].signal.aborted, true);
    await act(async () => { pending[1].resolve(Response.json(result('new'))); await tick(); });
    assert.equal(dictionary.result?.entries[0].id, 'new');
    await act(async () => { pending[0].resolve(Response.json(result('stale'))); await tick(); });
    assert.equal(dictionary.result?.entries[0].id, 'new', 'Ignored-abort upstream cannot replace latest word');
    await act(async () => { renderer!.update(<DictionaryHarness word="食べられなかった" />); });
    await act(async () => { renderer!.update(<DictionaryHarness word="食べられなかった" lemma="食べる" />); });
    assert.equal(pending.length, 3, 'Lemma does not cancel surface lookup');
    await act(async () => { pending[2].resolve(Response.json(result(''))); await tick(); });
    assert.equal(pending.length, 4); assert.equal(pending[3].data.dictionaryForm, '食べる');
    await act(async () => { pending[3].reject(new Error('offline')); await tick(); });
    assert.equal(dictionary.loading, false); assert.equal(pending.length, 4, 'A failed lemma request must not retry forever');
    assert.equal(dictionary.error, 'offline');
    const otherProvider: DictionaryProvider = { id: 'other', name: 'Other', adapter: 'http-v1', lookupUrl: 'https://example.com/lookup' };
    await act(async () => { renderer!.update(<DictionaryHarness word="前" provider={otherProvider} />); });
    assert.equal(dictionary.result, null);
    await act(async () => { renderer!.unmount(); });
    assert.equal(pending.at(-1)?.signal.aborted, true);
    renderer = undefined;

    let editing!: ReturnType<typeof useAnalysisEditing>;
    function EditingHarness() { editing = useAnalysisEditing(); return null; }
    await act(async () => { renderer = create(<EditingHarness />); });
    const tokens = [{ word: '食べ', pos: '動詞' }, { word: 'た', pos: '助動詞' }];
    await act(async () => { editing.setTokens(tokens); });
    const ticket = { taskId: editing.state.taskId, revision: editing.state.revision };
    await act(async () => { editing.edit({ start: 0, end: 1 }, [{ word: '食べた', pos: '動詞' }], ticket.taskId, ticket.revision); });
    assert.equal(editing.state.tokens.length, 1);
    await act(async () => { editing.undo(); });
    assert.deepEqual(editing.state.tokens, tokens);
    await act(async () => { editing.edit({ start: 0, end: 1 }, [{ word: '食べた', pos: '動詞' }], ticket.taskId, ticket.revision); });
    assert.deepEqual(editing.state.tokens, tokens, 'Candidate from an earlier revision is rejected');
    for (let i = 0; i < 21; i++) {
      const s = editing.state;
      const next = s.tokens.length === 2 ? [{ word: '食べた', pos: '動詞' }] : tokens;
      await act(async () => { editing.edit({ start: 0, end: s.tokens.length - 1 }, next, s.taskId, s.revision); });
    }
    assert.equal(editing.state.history.length, 20);
    await act(async () => { editing.restore(); });
    assert.deepEqual(editing.state.tokens, tokens);
    assert.equal(editing.state.history.length, 0);
    await act(async () => { editing.setTokens([]); });
    assert.notEqual(editing.state.taskId, ticket.taskId);
    await act(async () => { renderer!.unmount(); }); renderer = undefined;

    const stored = new Map([[READING_PREFERENCES_KEY, JSON.stringify({ showFurigana: false, showRomaji: true, viewMode: 'reading' })]]);
    const writes: string[] = []; let sharedText = '';
    const listeners = new Map<string, () => void>();
    const fakeWindow = { addEventListener: (name: string, listener: () => void) => listeners.set(name, listener), removeEventListener: (name: string) => listeners.delete(name), location: { hash: '' }, localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { writes.push(value); stored.set(key, value); } } };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    let prefs!: ReturnType<typeof useReadingPreferences>;
    function PreferencesHarness() { prefs = useReadingPreferences(text => { sharedText = text; }); return null; }
    await act(async () => { renderer = create(<PreferencesHarness />); });
    assert.equal(prefs.preferences.showRomaji, true); assert.equal(prefs.preferences.showFurigana, false); assert.equal(writes.length, 0);
    await act(async () => { prefs.change('showFurigana', true); });
    assert.equal(writes.length, 1); assert.equal(JSON.parse(writes[0]).showRomaji, true);
    await act(async () => { renderer!.unmount(); }); renderer = undefined;
    const shared = { showFurigana: true, showRomaji: false, viewMode: 'lexical' as const };
    fakeWindow.location.hash = new URL(makeShareLink('https://example.com', '駅の前', shared)).hash;
    await act(async () => { renderer = create(<PreferencesHarness />); });
    assert.equal(sharedText, '駅の前'); assert.deepEqual(prefs.preferences, shared);
    await act(async () => { prefs.change('showRomaji', true); });
    assert.equal(writes.length, 1, 'Shared options and edits are session-only');
    assert.equal(pending.length, 5, 'Opening shared text does not start an analysis request');
    fakeWindow.location.hash = new URL(makeShareLink('https://example.com', '別の原文', shared)).hash;
    await act(async () => { listeners.get('hashchange')?.(); });
    assert.equal(sharedText, '別の原文', 'A shared fragment also works within an already open app');
    assert.equal(writes.length, 1);
    console.log('Learning hooks passed: late responses, lemma enrichment/failure, provider cancellation, edit revisions, preferences hydration and shared-session isolation.');
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
