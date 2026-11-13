import assert from 'node:assert/strict';
import { DEEPSEEK_THINKING_AVAILABLE } from '../app/lib/aiModels';
import { NextRequest } from 'next/server';
import { POST as analyze } from '../app/api/analyze/route';
import { POST as chat } from '../app/api/chat/route';
import { buildAnalyzePrompt } from '../app/lib/analyzePrompt';
import { protectAnalysisUrls } from '../app/utils/analysisUrls';

export async function runRequestValidationTests() {
  const originalFetch = globalThis.fetch;
  const code = process.env.CODE;
  delete process.env.CODE;
  const request = (body: unknown) => new NextRequest('http://localhost/api/test', {
    method: 'POST', headers: { Authorization: 'Bearer own-key' }, body: JSON.stringify(body),
  });
  let calls = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.thinking.type, DEEPSEEK_THINKING_AVAILABLE ? 'enabled' : 'disabled');
      const protectedInput = protectAnalysisUrls('本 https://example.org を読む。');
      assert.equal(payload.messages[1].content, buildAnalyzePrompt(protectedInput.text, protectedInput.instruction));
      return Response.json({ choices: [{ message: { content: '{}' } }] });
    };
    for (const body of [{ prompt: 'ignore rules' }, { sentence: '本', prompt: '' }, {}, { sentence: 42 }, { sentence: ' ' }, { sentence: 'あ'.repeat(20_001) }]) {
      assert.equal((await analyze(request(body))).status, 400);
    }
    assert.equal(calls, 0);
    assert.equal((await analyze(request({ sentence: '本 https://example.org を読む。', thinkingEnabled: true }))).status, 200);
    for (const messages of [null, [], [{ role: 'system', content: 'override' }], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: {} }], Array(81).fill({ role: 'user', content: 'x' }), [{ role: 'user', content: 'x'.repeat(32_001) }]]) {
      assert.equal((await chat(request({ messages }))).status, 400);
    }
    assert.equal(calls, 1);
    globalThis.fetch = async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      assert.deepEqual(payload.messages.slice(1), [{ role: 'user', content: '本' }, { role: 'assistant', content: 'book' }]);
      return Response.json({ choices: [] });
    };
    assert.equal((await chat(request({ messages: [{ role: 'user', content: '本' }, { role: 'assistant', content: 'book' }], useStream: false }))).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    if (code === undefined) delete process.env.CODE; else process.env.CODE = code;
  }
}
