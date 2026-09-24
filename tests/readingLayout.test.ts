import assert from 'assert';
import { groupPendingChars, groupReadingTokens } from '../app/utils/readingLayout';

const words = ['「', '図書館', 'で', '本', 'を', '読ん', 'だ', '。', '」', '\n', '（', '例', '）', '。'];
const tokens = words.map(word => ({ word, pos: word === '\n' ? '改行' : '名詞', furigana: '', romaji: '' }));
const groups = groupReadingTokens(tokens);
assert.deepStrictEqual(groups.map(group => group.map(item => item.token.word).join('')), ['「図書館', 'で', '本', 'を', '読ん', 'だ。」', '\n', '（例）。']);
assert.deepStrictEqual(groups.flat().map(item => item.index), words.map((_, index) => index));
assert.deepStrictEqual(groups.flat().map(item => item.token), tokens);
assert.deepStrictEqual(groupReadingTokens([]), []);
// 流式末尾未闭合的引号保持可渲染，显式换行不与上下文粘连。
assert.deepStrictEqual(groupReadingTokens(tokens.slice(0, 1)).map(group => group.length), [1]);
assert.deepStrictEqual(groupReadingTokens([{ ...tokens[0], word: '\n', pos: '改行' }, tokens[7]]).map(group => group.length), [1, 1]);

// 解析中的占位原文按同样的禁则分组，换行位置与解析结果一致；换行符单独成组。
const NEWLINE = String.fromCharCode(10);
const pending = groupPendingChars(Array.from('「本を読む。」' + NEWLINE + 'っ'));
assert.deepStrictEqual(pending.map(group => group.map(item => item.char).join('')), ['「本', 'を', '読', 'む。」', NEWLINE, 'っ']);
assert.deepStrictEqual(pending.flat().map(item => item.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
