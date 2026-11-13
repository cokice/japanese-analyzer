import assert from 'node:assert/strict';
import { DEEPSEEK_THINKING_AVAILABLE } from '../app/lib/aiModels';
import { NextRequest } from 'next/server';
import { createTranslator, LANGUAGE_LABELS, LOCALES, localizeError, normalizeLocale } from '../app/i18n';
import { messages } from '../app/i18n/messages';
import { getResponseLanguageInstruction, getReasoningSummaryPrompt } from '../app/lib/languagePrompts';
import { getPhraseDetailSystemPrompt } from '../app/lib/phraseDetailPrompt';
import { POST as analyze } from '../app/api/analyze/route';
import { POST as translate } from '../app/api/translate/route';
import { POST as wordDetail } from '../app/api/word-detail/route';
import { POST as chat } from '../app/api/chat/route';
import { POST as imageToText } from '../app/api/image-to-text/route';
import { POST as summary } from '../app/api/reasoning-summary/route';
import { streamChat } from '../app/services/chat';

async function main() {
  assert.equal(normalizeLocale(undefined), 'zh-CN');
  assert.equal(normalizeLocale('invalid'), 'zh-CN');
  assert.deepEqual(Object.values(LANGUAGE_LABELS), ['简体中文', '繁體中文', 'English', '한국어', '日本語']);
  assert.equal(normalizeLocale('ja'), 'ja');
  assert.equal(createTranslator('ja')('保存设置'), '設定を保存');
  assert.equal(createTranslator('ja')('中文译文'), 'やさしい日本語');
  assert.equal(localizeError({ code: 'RATE_LIMITED' }, 'ja'), 'リクエストが多すぎます。しばらくしてからお試しください。');
  assert.equal(createTranslator('ja')('当前模型服务商：{0}', 'Gemini'), '現在のAIプロバイダー：Gemini');
  assert.match(getReasoningSummaryPrompt('ja'), /Japanese characters/);
  assert.ok(getPhraseDetailSystemPrompt('ja').includes(getResponseLanguageInstruction('ja')));
  assert.match(getPhraseDetailSystemPrompt('ja'), /宿題をする必要があります/);
  assert.equal(normalizeLocale('ko'), 'ko');
  assert.equal(localizeError({ code: 'INVALID_API_KEY' }, 'en'), 'Invalid API key. Check it in Settings.');
  assert.equal(localizeError({ code: 'UPSTREAM_TIMEOUT' }, 'ko'), '요청 시간이 초과되었습니다. 잠시 후 다시 시도하세요.');
  assert.equal(createTranslator('ko')('中文译文'), '한국어 번역');
  assert.equal(createTranslator('zh-TW')('保存设置'), '儲存設定');
  assert.equal(createTranslator('en')('当前模型服务商：{0}', 'Gemini'), 'Current AI provider: Gemini');
  assert.equal(localizeError('HTTP 429: upstream quota exceeded', 'zh-TW'), 'HTTP 429: upstream quota exceeded');
  assert.equal(createTranslator('en')('正在连接模型…'), 'Connecting to the model…');
  for (const [key, translations] of Object.entries(messages)) {
    assert.deepEqual(Object.keys(translations).sort(), LOCALES.filter(locale => locale !== 'zh-CN').sort(), `Missing locale: ${key}`);
    for (const value of Object.values(translations)) {
      assert.ok(value.trim(), `Empty translation: ${key}`);
      assert.deepEqual(value.match(/\{\d+\}/g)?.sort() ?? [], key.match(/\{\d+\}/g)?.sort() ?? [], `Interpolation mismatch: ${key}`);
      assert.doesNotMatch(value, /台灣|臺灣|台湾|Taiwan/, `Regional label leaked into UI: ${key}`);
    }
  }

  const originalFetch = globalThis.fetch;
  const originalCode = process.env.CODE;
  delete process.env.CODE;
  const bodies = {
    analyze: { sentence: '本を読む。', thinkingEnabled: true },
    translate: { text: '本を読む。\n図書館で勉強する。' },
    wordDetail: { word: '本', pos: '名詞', sentence: '本を読む。', furigana: 'ほん' },
    chat: { messages: [{ role: 'user', content: 'Explain を' }] },
    imageToText: { imageData: 'data:image/png;base64,dGVzdA==' },
    summary: { reasoningSnippet: 'Checking the verb conjugation and particle attachment.' },
  };
  const handlers = { analyze, translate, wordDetail, chat, imageToText, summary };
  let requestCount = 0;
  try {
    for (const locale of LOCALES) {
      for (const provider of ['gemini', 'deepseek']) {
        for (const stream of [false, true]) {
          for (const name of Object.keys(handlers) as (keyof typeof handlers)[]) {
            globalThis.fetch = async (_url, init) => {
              requestCount++;
              const payload = JSON.parse(init?.body as string);
              assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key');
              if (name === 'imageToText') {
                const prompt = payload.messages[0].content[0].text;
                assert.match(prompt, /OCR/);
                assert.match(prompt, locale === 'ja' ? /翻訳や画像内容の分析はしない/ : locale === 'ko' ? /번역하거나 이미지 내용을 분석하지 마세요/ : locale === 'en' ? /Do not translate/ : locale === 'zh-TW' ? /不要翻譯/ : /不要翻译/);
              } else {
                assert.equal(payload.messages[0].role, 'system');
                assert.ok(payload.messages[0].content.includes(getResponseLanguageInstruction(locale)), `${name} did not select ${locale}`);
              }
              if (name === 'translate') {
                assert.equal(payload.messages[1].content, bodies.translate.text, 'Keep original Japanese paragraphs');
                assert.match(payload.messages[0].content, /Preserve exactly the original paragraph/);
                if (locale === 'ja') assert.match(payload.messages[0].content, /simpler, natural Japanese/);
              }
              if (name === 'wordDetail') {
                assert.match(payload.messages[0].content, /translation/);
                assert.match(payload.messages[0].content, /exampleTranslation/);
                assert.equal(JSON.parse(payload.messages[1].content).word, '本');
                if (locale === 'ko') {
                  assert.match(payload.messages[0].content, /읽었다/);
                  assert.doesNotMatch(payload.messages[0].content, /讀了|中文释义|对应中文/);
                }
                if (locale === 'en') assert.doesNotMatch(payload.messages[0].content, /中文释义|对应中文/);
                if (locale === 'ja') {
                  assert.match(payload.messages[0].content, /過去を表すた形/);
                  assert.doesNotMatch(payload.messages[0].content, /中文释义|对应中文/);
                }
              }
              const content = locale === 'ja' ? '動詞の活用と助詞の接続を確認中' : locale === 'ko' ? '문장에 쓰인 동사의 활용과 앞뒤 단어 사이의 조사 연결 관계를 확인하는 중' : locale === 'en' ? 'Checking the verb conjugation and particle attachment' : '正在確認動詞活用與助詞接續';
              return payload.stream
                ? new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
                : Response.json({ choices: [{ message: { content } }] });
            };
            const response = await handlers[name](new NextRequest('http://localhost/api/test', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key', 'X-App-Locale': locale },
              body: JSON.stringify({ ...bodies[name], provider, stream, useStream: stream }),
            }));
            if (name === 'summary' && !DEEPSEEK_THINKING_AVAILABLE) { assert.equal(response.status, 404); continue; }
            assert.equal(response.status, 200, `${name}, ${locale}, ${provider}, stream=${stream}`);
            const text = await response.text();
            if (name === 'summary' && locale === 'ko') assert.equal(JSON.parse(text).summary, '문장에 쓰인 동사의 활용과 앞뒤 단어 사이의 조사 연결 관계를 확인하는 중');
            if (name === 'summary' && locale === 'en') assert.equal(JSON.parse(text).summary, 'Checking the verb conjugation and particle attachment');
            if (name === 'summary' && locale === 'ja') assert.equal(JSON.parse(text).summary, '動詞の活用と助詞の接続を確認中');
          }
        }
      }
    }
    assert.equal(requestCount, LOCALES.length * 2 * 2 * (Object.keys(handlers).length - (DEEPSEEK_THINKING_AVAILABLE ? 0 : 1)));

    // Switching languages cancels a pending chat request without reporting an error.
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const controller = new AbortController();
    let callbacks = 0;
    const pending = streamChat([{ role: 'user', content: 'Explain を' }], () => callbacks++, () => callbacks++, undefined, 'deepseek', undefined, controller.signal);
    controller.abort();
    await pending;
    assert.equal(callbacks, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCode === undefined) delete process.env.CODE;
    else process.env.CODE = originalCode;
  }
  console.log(`i18n tests passed (${requestCount} provider/locale/stream route combinations)`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
