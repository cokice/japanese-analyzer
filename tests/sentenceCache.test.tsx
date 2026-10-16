import React from 'react';
import assert from 'node:assert/strict';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ResultCache, sentenceCacheKey, sentenceTranslationCache, analysisCache } from '../app/utils/sentenceCache';
import { useSentenceTranslation } from '../app/hooks/useSentenceTranslation';
import type { EndpointPayload } from '../app/services/api';
import type { Locale } from '../app/i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const endpoint = { baseUrl: 'https://cache.example/v1', model: 'A' };
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const complete = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
const sse = (content: string, done = true) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n${done ? 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' : ''}`, { headers: { 'Content-Type': 'text/event-stream' } });

async function main() {
  const lru = new ResultCache<{ value: string }>(2, 200);
  lru.set('a', { value: 'A' }); lru.set('b', { value: 'B' });
  lru.get('a')!.value = 'mutated';
  lru.set('c', { value: 'C' });
  assert.equal(lru.get('b'), undefined);
  assert.equal(lru.get('a')?.value, 'A', 'Cache returns isolated copies');
  lru.set('huge', { value: 'x'.repeat(200) });
  assert.equal(lru.get('huge'), undefined);
  const byteLimited = new ResultCache<string>(20, 60);
  byteLimited.set('a', 'x'.repeat(20)); byteLimited.set('b', 'x'.repeat(20));
  assert.equal(byteLimited.get('a'), undefined, 'Byte budget also evicts entries');
  const key = sentenceCacheKey('食べた', endpoint, 'zh-CN', 'secret');
  assert.ok(!key.includes('secret'));
  for (const other of [
    sentenceCacheKey('食べた ', endpoint, 'zh-CN', 'secret'),
    sentenceCacheKey('食べた', { ...endpoint, model: 'B' }, 'zh-CN', 'secret'),
    sentenceCacheKey('食べた', { ...endpoint, baseUrl: 'https://other.example/v1' }, 'zh-CN', 'secret'),
    sentenceCacheKey('食べた', endpoint, 'en', 'secret'),
    sentenceCacheKey('食べた', endpoint, 'zh-CN', 'other-key'),
    sentenceCacheKey('食べた', endpoint, 'zh-CN', 'secret', true),
    sentenceCacheKey('食べた', { ...endpoint, caps: { thinking: true } }, 'zh-CN', 'secret'),
  ]) assert.notEqual(other, key);
  analysisCache.set(key, [{ word: '食べた', pos: '動詞' }]);
  assert.equal(analysisCache.get(key)?.[0].word, '食べた');
  assert.equal(analysisCache.get(sentenceCacheKey('食べた', { ...endpoint, model: 'B' }, 'zh-CN', 'secret')), undefined);

  const originalFetch = globalThis.fetch;
  let renderer: ReactTestRenderer | undefined;
  let translation!: ReturnType<typeof useSentenceTranslation>;
  const pending: { signal: AbortSignal; resolve: (r: Response) => void }[] = [];
  function Harness({ model = endpoint, text = '食べた', locale = 'zh-CN', stream = false, trigger = 1, signal }: { model?: EndpointPayload; text?: string; locale?: Locale; stream?: boolean; trigger?: number; signal?: AbortSignal }) {
    translation = useSentenceTranslation({ text, endpoint: model, apiKey: 'test', locale, useStream: stream, trigger, analysisSignal: signal });
    return null;
  }
  try {
    globalThis.fetch = async (_url, init) => new Promise<Response>(resolve => pending.push({ signal: init!.signal!, resolve }));
    sentenceTranslationCache.clear();
    await act(async () => { renderer = create(<Harness />); });
    await act(async () => { pending[0].resolve(complete('吃过了')); await tick(); });
    assert.equal(translation.translation, '吃过了');
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = create(<Harness />); });
    assert.equal(pending.length, 1, 'Navigation/remount reuses completed translation');
    assert.equal(translation.fromCache, true);
    await act(async () => { renderer!.update(<Harness model={{ ...endpoint, model: 'B' }} />); });
    assert.equal(pending.length, 2);
    await act(async () => { pending[1].resolve(complete('吃了（B）')); await tick(); });
    await act(async () => { renderer!.update(<Harness />); });
    assert.equal(pending.length, 2, 'Switching A → B → A reuses A');
    assert.equal(translation.translation, '吃过了');
    await act(async () => { renderer!.update(<Harness trigger={2} />); });
    assert.equal(pending.length, 2, 'Analyzing the same sentence does not regenerate its translation');
    await act(async () => { void translation.translate(true); });
    assert.equal(pending.length, 3, 'Explicit refresh bypasses cache');
    await act(async () => { pending[2].resolve(complete('新译文')); await tick(); });
    assert.equal(translation.translation, '新译文');
    await act(async () => { renderer!.update(<Harness locale="en" />); });
    assert.equal(pending.length, 4, 'Language has a separate cache');
    await act(async () => { renderer!.update(<Harness text="駅" />); });
    assert.equal(pending[3].signal.aborted, true);
    await act(async () => { pending[3].resolve(complete('stale')); await tick(); });
    assert.notEqual(translation.translation, 'stale');
    await act(async () => { pending[4].resolve(Response.json({ error: { message: 'offline' } }, { status: 503 })); await tick(); });
    assert.ok(translation.error);
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = create(<Harness text="駅" stream />); });
    assert.equal(pending.length, 6, 'Failure is retried, never cached');
    await act(async () => { pending[5].resolve(sse('车站')); await tick(); });
    assert.equal(translation.translation, '车站');
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = create(<Harness text="駅" stream />); });
    assert.equal(pending.length, 6, 'Complete streamed results are cached');
    await act(async () => { renderer!.update(<Harness text="不完整" stream />); });
    await act(async () => { pending[6].resolve(sse('partial', false)); await tick(); });
    assert.ok(translation.error);
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = create(<Harness text="不完整" stream />); });
    assert.equal(pending.length, 8, 'Incomplete streamed results are not cached');
    await act(async () => { renderer!.unmount(); }); renderer = undefined;
    await act(async () => { pending[7].resolve(sse('late after unmount')); await tick(); });
    await act(async () => { renderer = create(<Harness text="不完整" stream />); });
    assert.equal(pending.length, 9, 'Cancelled results are not cached even if the upstream ignores abort');
    const controller = new AbortController();
    await act(async () => { renderer!.update(<Harness text="取消" signal={controller.signal} />); });
    await act(async () => { controller.abort(); pending[9].resolve(complete('cancelled')); await tick(); });
    assert.equal(translation.isLoading, false);
    assert.notEqual(translation.translation, 'cancelled');
    await act(async () => { renderer!.unmount(); });
    await act(async () => { renderer = create(<Harness text="取消" />); });
    assert.equal(pending.length, 11, 'Analysis cancellation cannot cache the associated translation');
    console.log('Sentence cache passed: bounds, isolation, remount, model/language switching, refresh, stream completeness and cancellation.');
  } finally {
    if (renderer) await act(async () => { renderer!.unmount(); });
    globalThis.fetch = originalFetch;
    analysisCache.clear(); sentenceTranslationCache.clear();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
