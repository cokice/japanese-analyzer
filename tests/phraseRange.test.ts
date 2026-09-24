import assert from 'node:assert/strict';
import { getPhraseReading, getPhraseText, mergePhraseTokens, normalizePhraseRange, PHRASE_MAX_WORDS } from '../app/utils/phraseRange';

const token = (word: string, pos = '名詞', furigana = '') => ({ word, pos, furigana });
// 明日は早く起きなければならない。
const tokens = [
  token('明日', '名詞', 'あした'), token('は', '助詞'), token('早く', '形容詞', 'はやく'), token('起き', '動詞', 'おき'),
  token('なけれ', '助動詞'), token('ば', '助詞'), token('なら', '動詞'), token('ない', '助動詞'), token('。', '記号'),
];

// 顺序无关，首尾标点去掉
assert.deepEqual(normalizePhraseRange(tokens, 7, 4), { start: 4, end: 7 });
assert.deepEqual(normalizePhraseRange(tokens, 4, 8), { start: 4, end: 7 });
// 不足两个词（单词加标点）不成立
assert.equal(normalizePhraseRange(tokens, 7, 8), null);
assert.equal(normalizePhraseRange(tokens, 3, 3), null);
// 不跨换行：截到换行之前
const withBreak = [token('今日'), token('は', '助詞'), token('\n', '改行'), token('明日'), token('も', '助詞')];
assert.deepEqual(normalizePhraseRange(withBreak, 0, 4), { start: 0, end: 1 });
// 最多 PHRASE_MAX_WORDS 个词
const long = Array.from({ length: PHRASE_MAX_WORDS + 5 }, (_, i) => token(`語${i}`));
assert.deepEqual(normalizePhraseRange(long, 0, long.length - 1), { start: 0, end: PHRASE_MAX_WORDS - 1 });

const range = { start: 4, end: 7 };
assert.equal(getPhraseText(tokens, range), 'なければならない');
assert.equal(getPhraseReading(tokens, { start: 2, end: 3 }), 'はやくおき');

// 合并：被拆开的一个词合回单个词项，词性、读音取 AI 结果，前后词不变
const split = [token('図書', '名詞', 'としょ'), token('館', '名詞', 'かん'), token('で', '助詞')];
const merged = mergePhraseTokens(split, { start: 0, end: 1 }, { pos: '名詞', furigana: 'としょかん' });
assert.equal(merged.length, 2);
assert.deepEqual({ word: merged[0].word, pos: merged[0].pos, furigana: merged[0].furigana }, { word: '図書館', pos: '名詞', furigana: 'としょかん' });
assert.equal(merged[1].word, 'で');

console.log('Phrase range tests passed');
