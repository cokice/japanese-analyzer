import assert from 'assert';
import { selectWordDetailContext } from '../app/utils/wordDetailContext';

function select(source: string, offset: number, word: string): string {
  return selectWordDetailContext(source, [{ word: source.slice(0, offset) }, { word }], 1);
}

const short = 'あ'.repeat(999) + '。';
assert.strictEqual(select(short, 500, 'あ'), short);
const unicodeShort = '😀'.repeat(999) + '猫';
assert.strictEqual(select(unicodeShort, unicodeShort.length - 1, '猫'), unicodeShort);

const introduction = '昔の話です。'.repeat(150) + '\r\n\r\n';
const targetParagraph = '猫がいます。\r\n';
const ending = '別の話です。'.repeat(150);
const article = introduction + targetParagraph + ending;
assert.strictEqual(select(article, introduction.length, '猫'), targetParagraph);

// Exactly 1001 characters triggers paragraph selection.
const boundary = 'あ'.repeat(998) + '。\n猫';
assert.strictEqual(Array.from(boundary).length, 1001);
assert.strictEqual(select(boundary, boundary.length - 1, '猫'), '猫');

// Locate the clicked occurrence, even when the same word appeared earlier.
const repeated = '猫です。'.repeat(260) + '\n\n次の猫です。';
assert.strictEqual(select(repeated, repeated.lastIndexOf('猫'), '猫'), '次の猫です。');

const sentences = Array.from({ length: 30 }, (_, index) => `${index}番目の${'長い話'.repeat(15)}です。`);
const longParagraph = sentences.join('');
const offset = sentences.slice(0, 15).join('').length;
assert.strictEqual(select(longParagraph, offset, '15'), sentences.slice(13, 18).join(''));
assert.strictEqual(select(longParagraph, 0, '0'), sentences.slice(0, 3).join(''));
assert.strictEqual(
  select(longParagraph, sentences.slice(0, 29).join('').length, '29'),
  sentences.slice(27).join('')
);

// Quotes and a single very long sentence remain intact, even above the soft limit.
const quote = `「${'猫です。'.repeat(300)}」と言いました。`;
assert.strictEqual(select(quote, 1, '猫'), quote);
const unpunctuated = 'あ'.repeat(1500);
assert.strictEqual(select(unpunctuated, 700, 'あ'), unpunctuated);

// Failed alignment and invalid selections fall back to the untouched source.
assert.strictEqual(selectWordDetailContext(article, [{ word: '違う' }, { word: '猫' }], 1), article);
assert.strictEqual(selectWordDetailContext(article, [], 0), article);
assert.strictEqual(selectWordDetailContext(article, [{ word: '猫' }], -1), article);
