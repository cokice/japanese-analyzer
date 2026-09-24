import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createTranslator, LANGUAGE_LABELS, LOCALES, localizeError, normalizeLocale } from '../app/i18n';
import { messages } from '../app/i18n/messages';
import { getResponseLanguageInstruction } from '../app/lib/languagePrompts';
import { POST as analyze } from '../app/api/analyze/route';
import { POST as translate } from '../app/api/translate/route';
import { POST as wordDetail } from '../app/api/word-detail/route';
import { POST as chat } from '../app/api/chat/route';
import { POST as imageToText } from '../app/api/image-to-text/route';
import { POST as summary } from '../app/api/reasoning-summary/route';
import { streamChat } from '../app/services/api';

async function main() {
  assert.equal(normalizeLocale(undefined), 'zh-CN');
  assert.equal(normalizeLocale('invalid'), 'zh-CN');
  assert.deepEqual(Object.values(LANGUAGE_LABELS), ['简体中文', '繁體中文', 'English', '한국어']);
  assert.equal(normalizeLocale('ko'), 'ko');
  assert.equal(createTranslator('ko')('中文译文'), '한국어 번역');
  assert.equal(localizeError('查询释义失败：未知错误', 'ko'), '뜻 조회 실패: 알 수 없는 오류');
  assert.equal(createTranslator('zh-TW')('保存设置'), '儲存設定');
  assert.equal(createTranslator('en')('当前模型服务商：{0}', 'Gemini'), 'Current AI provider: Gemini');
  assert.equal(localizeError('流式翻译失败：未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥', 'en'), 'Streaming translation failed: No API key provided. Enter one in Settings or contact the administrator.');
  assert.equal(localizeError('第 2/3 段没有返回完整解析结果，请重试。', 'en'), 'Chunk 2/3 returned an incomplete analysis. Please try again.');
  assert.equal(localizeError('翻译结果连接已结束，但没有收到完整结束信号，请重新生成。', 'en'), 'The translation disconnected before completion. Please try again.');
  assert.equal(localizeError('图片文字提取连接已结束，但没有收到完整结束信号，请重新生成。', 'ko'), '이미지 글자 추출 완료 신호를 받기 전에 연결이 종료되었습니다. 다시 시도해 주세요.');
  assert.equal(localizeError('HTTP 429: upstream quota exceeded', 'zh-TW'), 'HTTP 429: upstream quota exceeded');
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
    analyze: { prompt: 'Analyze 本を読む。', thinkingEnabled: true },
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
                assert.match(prompt, locale === 'ko' ? /번역하거나 이미지 내용을 분석하지 마세요/ : locale === 'en' ? /Do not translate/ : locale === 'zh-TW' ? /不要翻譯/ : /不要翻译/);
              } else {
                assert.equal(payload.messages[0].role, 'system');
                assert.ok(payload.messages[0].content.includes(getResponseLanguageInstruction(locale)), `${name} did not select ${locale}`);
              }
              if (name === 'translate') {
                assert.equal(payload.messages[1].content, bodies.translate.text, 'Keep original Japanese paragraphs');
                assert.match(payload.messages[0].content, /Preserve exactly the original paragraph/);
              }
              if (name === 'wordDetail') {
                assert.match(payload.messages[0].content, /chineseTranslation/);
                assert.match(payload.messages[0].content, /exampleTranslation/);
                assert.equal(JSON.parse(payload.messages[1].content).word, '本');
                if (locale === 'ko') {
                  assert.match(payload.messages[0].content, /읽었다/);
                  assert.doesNotMatch(payload.messages[0].content, /讀了|中文释义|对应中文/);
                }
                if (locale === 'en') assert.doesNotMatch(payload.messages[0].content, /中文释义|对应中文/);
              }
              const content = locale === 'ko' ? '문장에 쓰인 동사의 활용과 앞뒤 단어 사이의 조사 연결 관계를 확인하는 중' : locale === 'en' ? 'Checking the verb conjugation and particle attachment' : '正在確認動詞活用與助詞接續';
              return payload.stream
                ? new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
                : Response.json({ choices: [{ message: { content } }] });
            };
            const response = await handlers[name](new NextRequest('http://localhost/api/test', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key', 'X-App-Locale': locale },
              body: JSON.stringify({ ...bodies[name], provider, stream, useStream: stream }),
            }));
            assert.equal(response.status, 200, `${name}, ${locale}, ${provider}, stream=${stream}`);
            const text = await response.text();
            if (name === 'summary' && locale === 'ko') assert.equal(JSON.parse(text).summary, '문장에 쓰인 동사의 활용과 앞뒤 단어 사이의 조사 연결 관계를 확인하는 중');
            if (name === 'summary' && locale === 'en') assert.equal(JSON.parse(text).summary, 'Checking the verb conjugation and particle attachment');
          }
        }
      }
    }
    assert.equal(requestCount, LOCALES.length * 2 * 2 * Object.keys(handlers).length);

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
