import assert from 'assert';
import { kanaToRomaji, getLocalRomaji } from '../app/utils/romaji';
import { AnalyzeStreamParser } from '../app/utils/analyzeStreamParser';
import { parseAnalyzeResponseContent, parseWordDetailResponseContent, readOpenAIContentStream, getWordDetails, streamWordDetails, streamTranslateText } from '../app/services/api';
import { getStructuredResponseFormat } from '../app/api/_utils/providerConfig';
import { runAnalysisUrlTests } from './analysisUrls.test';
import './pastedText.test';

for (const [reading, expected] of [
  ['としょかん','toshokan'], ['よんだ','yonda'], ['きょう','kyou'], ['がっこう','gakkou'],
  ['きって','kitte'], ['まっちゃ','matcha'], ['しんよう',"shin'you"], ['かんい',"kan'i"],
  ['こんにゃく','konnyaku'], ['スーパー','suupaa'], ['ティッシュ','tisshu'],
  ['ヴァイオリン','vaiorin'], ['パーティー','paatii'], ['ﾁｮｯﾄ','chotto'], ['ｶﾞｯｺｳ','gakkou'],
  ['買う',''], ['待っ',''], ['まっ','mat'], ['すゞき','suzuki'], ['ＡＢＣ','ABC'],
]) assert.strictEqual(kanaToRomaji(reading), expected, reading);
assert.strictEqual(getLocalRomaji('は','','助詞'), 'wa');
assert.strictEqual(getLocalRomaji('は','','名詞'), 'ha');
assert.strictEqual(getLocalRomaji('へ','','格助詞'), 'e');
assert.strictEqual(getLocalRomaji('を','','助詞'), 'o');
assert.strictEqual(getLocalRomaji('。','','記号'), '');
assert.strictEqual(getLocalRomaji('今日','きょう','名詞'), 'kyou');

const tokens = [{word:'今日',pos:'名詞',furigana:'きょう'}, {word:'は',pos:'助詞',furigana:''}, {word:'"},[',pos:'記号',furigana:''}];
const source = JSON.stringify({tokens});
const parser = new AnalyzeStreamParser();
let snapshot = parser.push('');
for (let i = 1; i <= source.length; i++) snapshot = parser.push(source.slice(0, i));
assert.deepStrictEqual(snapshot, parseAnalyzeResponseContent(source));
assert.strictEqual(parser.push(source), snapshot, '不重复创建没有新词项的快照');
const first = new AnalyzeStreamParser();
const firstObject = '{"tokens":[' + JSON.stringify(tokens[0]);
assert.strictEqual(first.push(firstObject).length, 1, '第一个对象闭合就显示，无需等待逗号');
assert.strictEqual(first.push(firstObject + ',{"word":"次').length, 1);
assert.strictEqual(first.push(JSON.stringify({tokens: [tokens[1]]}))[0].romaji, 'wa', '替换快照重新开始');
const merged = new AnalyzeStreamParser();
merged.push(JSON.stringify({tokens: tokens.slice(0,1)}));
assert.deepStrictEqual(merged.push(source), snapshot, '分块拼接快照不能漏词或重复');

const compact = {chineseTranslation:'读了',dictionaryForm:'読む',explanation:'过去发生的读书动作。',conjugation:'読む → 読んだ',example:'本を読んだ。',exampleTranslation:'读了书。',pos:'',furigana:''};
const context = {word:'読んだ',pos:'動詞',furigana:'よんだ'};
const detail = parseWordDetailResponseContent(JSON.stringify(compact),context);
assert.strictEqual(detail.originalWord,'読んだ');
assert.strictEqual(detail.romaji,'yonda');
assert.strictEqual(detail.pos,'動詞');
const corrected = parseWordDetailResponseContent(JSON.stringify({...compact,pos:'動詞（五段・他動）',furigana:'よんだ'}),{...context,furigana:'どくんだ'});
assert.strictEqual(corrected.romaji,'yonda');
assert.strictEqual(corrected.pos,'動詞（五段・他動）');
const loose = JSON.stringify(compact).replace(compact.explanation,'对应英语"read"。');
assert.strictEqual(parseWordDetailResponseContent(loose,context).explanation,'对应英语"read"。');
const schema = (getStructuredResponseFormat('gemini','analysisTokens') as {json_schema:{schema:{properties:{tokens:{items:{properties:Record<string, unknown>}}}}}}).json_schema.schema;
assert.ok(!('romaji' in schema.properties.tokens.items.properties));
const detailSchema = (getStructuredResponseFormat('gemini','wordDetail') as {json_schema:{schema:{properties:Record<string, unknown>}}}).json_schema.schema;
assert.ok(!('originalWord' in detailSchema.properties));
assert.ok(!('romaji' in detailSchema.properties));

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const encoder = new TextEncoder();
const event = (text: string) => encoder.encode('data: ' + JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]}) + '\n\n');

export async function runLocalOutputTests() {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({start(c){streamController=c;}}));
  const events: {text:string;done:boolean}[] = [];
  const pending = readOpenAIContentStream(response,(text,done)=>events.push({text,done}),error=>{throw error;},{debounceMs:20});
  streamController.enqueue(event('a')); await delay(5);
  assert.strictEqual(events[0]?.text,'a','首段立即推送');
  for (let i=0;i<8;i++){streamController.enqueue(event('b'));await delay(5);}
  assert.ok(events.length>=2 && events.length<9,'持续生成时定时合并，不等待流静默');
  streamController.enqueue(encoder.encode('data: [DONE]\n\n'));streamController.close();
  await pending;
  assert.deepStrictEqual(events.at(-1),{text:'abbbbbbbb',done:true});
  const count=events.length;await delay(30);assert.strictEqual(events.length,count,'结束后没有延迟回调');

  let cancelled=false;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const abortController=new AbortController();
  const abortEvents:string[]=[];
  const task=readOpenAIContentStream(new Response(new ReadableStream<Uint8Array>({start(c){controller=c;},cancel(){cancelled=true;}})),text=>abortEvents.push(text),error=>{throw error;},{signal:abortController.signal,debounceMs:50});
  controller.enqueue(event('first'));await delay(2);controller.enqueue(event('pending'));await delay(2);
  abortController.abort();await task;const afterAbort=abortEvents.length;await delay(60);
  assert.ok(cancelled);assert.strictEqual(abortEvents.length,afterAbort,'取消后不得继续刷新');

  // 检查非流式和流式发送的结构、上下文合并、AbortSignal 传递。
  const originalFetch=globalThis.fetch;
  const signal=new AbortController().signal;
  try {
    globalThis.fetch=async (_url, options)=>{
      assert.strictEqual(options?.signal,signal);
      const body=JSON.parse(options?.body as string);assert.ok(!('romaji' in body));
      if(body.useStream) return new Response(new ReadableStream({start(c){c.enqueue(event(JSON.stringify(compact)));c.enqueue(encoder.encode('data: [DONE]\n\n'));c.close();}}));
      return Response.json({choices:[{message:{content:JSON.stringify(compact)}}]});
    };
    assert.strictEqual((await getWordDetails('読んだ','動詞','本を読んだ。','よんだ',undefined,'deepseek',undefined,signal)).romaji,'yonda');
    let final='';
    await streamWordDetails('読んだ','動詞','本を読んだ。',(text,done)=>{if(done)final=text;},error=>{throw error;},'よんだ',undefined,'deepseek',undefined,signal);
    assert.strictEqual(final,JSON.stringify(compact));
    // A server/proxy failure may return plain text, HTML, an empty body, or null.
    // Preserve the HTTP error instead of surfacing a secondary JSON parse error.
    const originalConsoleError = console.error;
    try {
      console.error = () => {};
      for (const body of ['Internal Server Error', '<html>Bad Gateway</html>', '', 'null', '{"error":{"message":"upstream unavailable"}}']) {
        globalThis.fetch = async () => new Response(body, { status: 500 });
        const message = body.includes('upstream unavailable') ? 'upstream unavailable' : 'HTTP 500';
        await assert.rejects(getWordDetails('本', '名詞', '本を読む。'), error => {
          assert.ok(error instanceof Error);
          assert.strictEqual(error.message, `查询释义失败：${message}`);
          return true;
        });
        const failures: Error[] = [];
        await streamWordDetails('本', '名詞', '本を読む。', () => assert.fail('Failed requests must not emit content'), error => failures.push(error));
        assert.strictEqual(failures.length, 1);
        assert.strictEqual(failures[0].message, `流式查询释义失败：${message}`);
      }
    } finally {
      console.error = originalConsoleError;
    }
    globalThis.fetch=async (_url, options)=>new Promise<Response>((_resolve,reject)=>{
      const requestSignal=options?.signal;
      assert.ok(requestSignal);
      const abort=()=>reject(new DOMException('Aborted','AbortError'));
      if(requestSignal.aborted) abort();
      else requestSignal.addEventListener('abort',abort,{once:true});
    });
    const stopped=new AbortController();
    let callbacks=0;
    const stopWord=streamWordDetails('読んだ','動詞','本を読んだ。',()=>callbacks++,()=>callbacks++,'よんだ',undefined,'deepseek',undefined,stopped.signal);
    const stopTranslation=streamTranslateText('本を読んだ。',()=>callbacks++,()=>callbacks++,undefined,'deepseek',undefined,stopped.signal);
    stopped.abort();await Promise.all([stopWord,stopTranslation]);
    assert.strictEqual(callbacks,0,'请求头尚未返回时也可取消，且不触发错误或内容回调');
  } finally { globalThis.fetch=originalFetch; }
  await runAnalysisUrlTests();
}
