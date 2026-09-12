import assert from 'node:assert/strict';
import { protectAnalysisUrls } from '../app/utils/analysisUrls';
import { analyzeSentence, parseAnalyzeResponseContent, streamAnalyzeSentence } from '../app/services/api';

export async function runAnalysisUrlTests() {
  const url = 'https://search.example/search?p=%E3%81%A6%E3%81%A3&other=$&';
  const article = `「算数」の相談を送ったのは、[てっちゃん](${url})です。`;
  const originalFetch = globalThis.fetch;
  let malformed = false;
  let omitLink = false;
  let omitWhitespace = false;
  let requests = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      requests++;
      const body = JSON.parse(init?.body as string);
      const source = JSON.parse(body.prompt.match(/待解析句子.*： (.*)$/u)[1]) as string;
      assert.ok(!source.includes('https://'), 'Encoded URLs never go to the model');
      const words = (omitWhitespace ? source.replace(/\s/gu, '') : source).split(/(X*JAURL\d+END)/u).filter(Boolean);
      const tokens = words.filter(word => !omitLink || !/JAURL\d+END/u.test(word))
        .map(word => ({ word, pos: '記号', furigana: '' }));
      const content = JSON.stringify({ tokens });
      if (!body.stream) return Response.json({ choices: [{ message: { content } }] });
      const output = malformed ? content.slice(0, -2) : content;
      const events = [...output].map(char => `data: ${JSON.stringify({ choices: [{ delta: { content: char } }] })}\n\n`).join('');
      return new Response(events + 'data: [DONE]\n\n');
    };

    for (const source of [article, article.repeat(12), `参照：https://example.org/a_(b)。\n次です。`, `JAURL0END と "引用" [記事](${url})`]) {
      const tokens = await analyzeSentence(source, undefined, 'deepseek');
      assert.equal(tokens.map(token => token.word).join(''), source);
      let completed = false;
      await streamAnalyzeSentence(source, (content, done) => {
        if (!done) return;
        completed = true;
        assert.equal(parseAnalyzeResponseContent(content).map(token => token.word).join(''), source);
      }, error => { throw error; }, undefined, 'deepseek');
      assert.ok(completed, 'Streaming output restores exact URLs in single and multiple chunks');
    }
    assert.ok(requests > 8, 'Long articles exercise multiple requests');

    omitWhitespace = true;
    const spacedSource = '本の題名　AERA with Kids\nを読みます。';
    assert.equal((await analyzeSentence(spacedSource, undefined, 'deepseek')).map(token => token.word).join(''), spacedSource);
    let restored = '';
    await streamAnalyzeSentence(spacedSource, (content, done) => {
      if (done) restored = parseAnalyzeResponseContent(content).map(token => token.word).join('');
    }, error => { throw error; }, undefined, 'deepseek');
    assert.equal(restored, spacedSource, 'Single-chunk completion restores original whitespace too');
    omitWhitespace = false;

    for (const failure of ['malformed', 'omitted']) {
      malformed = failure === 'malformed';
      omitLink = failure === 'omitted';
      let error: Error | undefined;
      let completed = false;
      await streamAnalyzeSentence(article, (_content, done) => { completed ||= done; }, value => { error = value; }, undefined, 'deepseek');
      assert.ok(error, 'Incomplete JSON or missing source text must still fail');
      assert.equal(completed, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  const protectedInput = protectAnalysisUrls(`[一](${url}) [二](https://example.org/a_(b))。`);
  assert.equal(protectedInput.text, 'JAURL0END一JAURL1END JAURL2END二JAURL3END。');
  assert.equal(protectAnalysisUrls('今日は晴れ。').text, '今日は晴れ。');
  assert.equal(protectAnalysisUrls('JAURL0END https://example.org').text, 'JAURL0END XJAURL0END');
  const escaped = protectAnalysisUrls('https://example.org/a\\b');
  assert.equal(JSON.parse(escaped.restoreContent('{"word":"JAURL0END"}')).word, 'https://example.org/a\\b');
  assert.equal(escaped.restoreContent('{"word":"JAURL0'), '{"word":"JAURL0', 'Do not repair truncated JSON');
}
