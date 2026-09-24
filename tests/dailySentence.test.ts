import assert from 'node:assert/strict';
import { buildDailySentencePrompt, validateDailySentence } from '../app/api/_utils/dailySentence';
import {
  DAILY_SENTENCES,
  getDayNumber,
  getFallbackDailySentence,
  getJstDateKey,
  secondsUntilJstMidnight,
} from '../app/utils/dailySentences';

// 日本时间：UTC 14:59 仍是当天，15:00 起算次日
assert.equal(getJstDateKey(new Date('2026-09-24T14:59:00Z')), '2026-09-24');
assert.equal(getJstDateKey(new Date('2026-09-24T15:00:00Z')), '2026-09-25');
assert.equal(secondsUntilJstMidnight(new Date('2026-09-24T14:00:00Z')), 3600);
assert.equal(getDayNumber('2026-09-25') - getDayNumber('2026-09-24'), 1);

// 备用句本身必须合格：分词能拼回原句、四种译文齐全
for (const sentence of DAILY_SENTENCES) {
  assert.doesNotThrow(() => validateDailySentence(sentence), sentence.text);
}
assert.ok(DAILY_SENTENCES.includes(getFallbackDailySentence(new Date('2026-09-24T03:00:00Z'))));

// 生成结果校验：分词拼不回原句、缺译文都要拒绝
const sample = DAILY_SENTENCES[0];
assert.throws(() => validateDailySentence({ ...sample, tokens: sample.tokens.slice(1) }), /拼回原句/);
assert.throws(() => validateDailySentence({ ...sample, translation: { ...sample.translation, ko: '' } }), /ko/);

// 格式约束：必须以「。」结尾，不含数字、字母、引号、括号
const withText = (text: string) => ({ ...sample, text, tokens: [{ word: text, pos: '名詞' }] });
assert.throws(() => validateDailySentence(withText('朝7時に起きます。')), /数字/);
assert.throws(() => validateDailySentence(withText('天気がいいから散歩しましょう')), /结尾/);
assert.throws(() => validateDailySentence(withText('「おはよう」と言いました。')), /引号/);
assert.throws(() => validateDailySentence(withText('Ｔシャツを買いました。')), /字母/);
assert.doesNotThrow(() => validateDailySentence(withText('今日はいい天気ですね。')));

// 相邻两天的提示词主题/语法不同，且带上当天日期与季节
const today = buildDailySentencePrompt('2026-09-24');
assert.notEqual(today, buildDailySentencePrompt('2026-09-25'));
assert.match(today, /2026-09-24/);
assert.match(today, /季节是秋/);
assert.match(buildDailySentencePrompt('2026-01-10'), /季节是冬/);

console.log('Daily sentence tests passed');
