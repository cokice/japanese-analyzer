import assert from 'assert';
import { parseWordDetailResponseContent } from '../app/services/api';
import { getStructuredResponseFormat } from '../app/api/_utils/providerConfig';

const legacy = {
  originalWord: '読んだ',
  chineseTranslation: '读了',
  pos: '動詞',
  furigana: 'よんだ',
  romaji: 'yonda',
  dictionaryForm: '読む',
  explanation: '表示读书这一动作已经完成。',
};
const entry = {
  ...legacy,
  conjugation: '読む → 読んだ；五段动词的过去普通形。',
  example: '昨日、本を読んだ。',
  exampleTranslation: '昨天看了书。',
};

// 新字段必须在完整响应和宽松 JSON 恢复中保留，不能混入本句用法。
assert.deepStrictEqual(parseWordDetailResponseContent(JSON.stringify(entry)), entry);
const loose = JSON.stringify(entry).replace(legacy.explanation, '与英语"read"相应。');
const recovered = parseWordDetailResponseContent(loose);
assert.strictEqual(recovered.explanation, '与英语"read"相应。');
assert.strictEqual(recovered.conjugation, entry.conjugation);
assert.strictEqual(recovered.example, entry.example);
assert.strictEqual(recovered.exampleTranslation, entry.exampleTranslation);

// 历史七字段响应和无需活用的名词仍能正常读取。
const oldEntry = parseWordDetailResponseContent(JSON.stringify(legacy));
assert.strictEqual(oldEntry.explanation, legacy.explanation);
assert.strictEqual(oldEntry.example, '');
assert.strictEqual(oldEntry.conjugation, '');
const noConjugation = parseWordDetailResponseContent(JSON.stringify({ ...entry, conjugation: '' }));
assert.strictEqual(noConjugation.conjugation, '');
assert.strictEqual(noConjugation.example, entry.example);

// 字段顺序不影响严格 JSON 解析；双重转义沿用原来的归一化规则。
const reordered = parseWordDetailResponseContent(JSON.stringify({
  exampleTranslation: '昨天看了书。', example: '昨日、\\n本を読んだ。', ...legacy,
}));
assert.strictEqual(reordered.example, '昨日、\n本を読んだ。');
assert.throws(() => parseWordDetailResponseContent(JSON.stringify({ ...entry, example: [] })), /example 必须是字符串/);
assert.throws(() => parseWordDetailResponseContent(JSON.stringify({ ...entry, explanation: undefined })), /缺少 explanation/);

// Gemini 的严格响应格式必须允许并要求这些字段，否则会静默丢失例句。
const format = getStructuredResponseFormat('gemini', 'wordDetail') as {
  json_schema: { schema: { required: string[]; properties: Record<string, unknown> } };
};
for (const field of ['conjugation', 'example', 'exampleTranslation']) {
  assert.ok(format.json_schema.schema.required.includes(field));
  assert.ok(field in format.json_schema.schema.properties);
}
