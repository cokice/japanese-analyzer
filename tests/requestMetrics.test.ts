import assert from 'assert';
import { createRequestMetrics, getRequestErrorCategory } from '../app/utils/analytics';
import { ApiRequestError, InvalidResponseError } from '../app/utils/requestErrors';
import { analyzeSentence, streamAnalyzeSentence, streamChat } from '../app/services/api';

export async function runRequestMetricsTests() {
  type Event = { name: string; data: Record<string, string | number> };
  const events: Event[] = [];
  let clock = 100;
  const dependencies = { now: () => clock, emit: (event: Event) => events.push(event) };
  const controller = new AbortController();
  const request = createRequestMetrics('analyze', 'deepseek', 'deepseek-flash', true, controller.signal, dependencies);
  clock = 250;
  request.firstResult();
  clock = 500;
  request.firstResult();
  request.succeed();
  controller.abort('user');
  request.fail(new Error('private sentence / API key'));
  assert.deepStrictEqual([...events], [{ name: 'analyze_success', data: {
    provider: 'deepseek', model: 'deepseek-flash', mode: 'stream', duration_ms: 400, first_result_ms: 150,
  } }]);

  events.length = 0;
  const aborted = new AbortController();
  const cancelled = createRequestMetrics('analyze', 'deepseek', 'deepseek-flash', true, aborted.signal, dependencies);
  clock += 60;
  aborted.abort('user');
  cancelled.firstResult();
  cancelled.succeed();
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual({ ...events[0].data }, { provider: 'deepseek', model: 'deepseek-flash', mode: 'stream', duration_ms: 60, cancel_reason: 'user' });
  assert.strictEqual(events[0].name, 'analyze_cancel');

  for (const reason of ['superseded', 'unmount', 'private sentence']) {
    const c = new AbortController();
    c.abort(reason);
    createRequestMetrics('analyze', 'deepseek', 'deepseek-flash', false, c.signal, dependencies);
    assert.strictEqual(events.at(-1)?.data.cancel_reason, reason === 'private sentence' ? 'other' : reason);
  }

  events.length = 0;
  const chat = createRequestMetrics('chat', 'deepseek', 'deepseek-flash', true, undefined, dependencies);
  clock += 10;
  chat.firstResult();
  clock += 20;
  chat.fail(new ApiRequestError('private chat and sk-secret-key', 429));
  chat.succeed();
  assert.deepStrictEqual(events.map(event => event.name), ['chat_send', 'chat_error']);
  assert.strictEqual(events[1].data.error_category, 'rate_limit');
  assert.strictEqual(events[1].data.first_result_ms, 10);
  assert.strictEqual(events[1].data.duration_ms, 30);
  assert.ok(!JSON.stringify(events).includes('private'));
  assert.ok(!JSON.stringify(events).includes('sk-secret'));
  const allowed = new Set(['provider', 'model', 'mode', 'duration_ms', 'first_result_ms', 'error_category', 'cancel_reason']);
  for (const event of events) assert.ok(Object.keys(event.data).every(key => allowed.has(key)));
  for (const [error, expected] of [
    [new ApiRequestError('secret', 401), 'auth'], [new ApiRequestError('secret', 403), 'auth'],
    [new ApiRequestError('secret', 504), 'timeout'], [new ApiRequestError('secret', 500), 'server'],
    [new ApiRequestError('secret', 400), 'request'], [new InvalidResponseError('secret'), 'invalid_response'],
    [new SyntaxError('secret'), 'invalid_response'], [new TypeError('secret'), 'network'],
    [new DOMException('secret', 'TimeoutError'), 'timeout'], [new Error('secret'), 'unknown'],
  ] as const) assert.strictEqual(getRequestErrorCategory(error), expected);

  // 验证真实服务封装能保留 HTTP 分类，HTML 错误页不误报为 JSON 解析失败。
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    globalThis.fetch = async () => new Response('gateway error', { status: 429 });
    await assert.rejects(analyzeSentence('天気', undefined, 'deepseek'), error => getRequestErrorCategory(error) === 'rate_limit');
    const errors: unknown[] = [];
    await streamAnalyzeSentence('天気', () => assert.fail('HTTP failure must not succeed'), error => errors.push(error));
    await streamChat([], () => assert.fail('HTTP failure must not succeed'), error => errors.push(error));
    assert.strictEqual(errors.length, 2);
    assert.ok(errors.every(error => getRequestErrorCategory(error) === 'rate_limit'));

    globalThis.fetch = async () => new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    const emptyChatErrors: unknown[] = [];
    await streamChat([], (_, done) => assert.ok(!done), error => emptyChatErrors.push(error));
    assert.strictEqual(emptyChatErrors.length, 1);
    assert.strictEqual(getRequestErrorCategory(emptyChatErrors[0]), 'invalid_response');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
}
