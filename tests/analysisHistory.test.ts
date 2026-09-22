import assert from 'node:assert/strict';
import {
  ANALYSIS_HISTORY_LIMIT,
  addAnalysisHistoryEntry,
  parseAnalysisHistory,
  type AnalysisHistoryEntry,
} from '../app/utils/analysisHistory';

let entries: AnalysisHistoryEntry[] = [];
for (let i = 1; i <= 55; i++) {
  entries = addAnalysisHistoryEntry(entries, `文章 ${i}`, i);
}
assert.equal(entries.length, ANALYSIS_HISTORY_LIMIT);
assert.equal(entries[0].text, '文章 55');
assert.equal(entries.at(-1)?.text, '文章 6', 'Evict the oldest entries beyond 50');

entries = addAnalysisHistoryEntry(entries, ' 文章 20 ', 100);
assert.equal(entries.length, 50, 'Reanalyzing a sentence does not use another slot');
assert.deepEqual(entries[0], { text: ' 文章 20 ', analyzedAt: 100 });
assert.equal(entries.filter(entry => entry.text.trim() === '文章 20').length, 1);
assert.deepEqual(addAnalysisHistoryEntry(entries, '\n\t '), entries);

const article = '「日本語」\n\n原文の段落と　空白。\nhttps://example.org';
entries = addAnalysisHistoryEntry(entries, article, 200);
assert.deepEqual(parseAnalysisHistory(JSON.stringify(entries)), entries, 'Round trip retains original text and times');

for (const raw of [null, '', '{broken', 'null', '{}', '42', '"text"']) {
  assert.deepEqual(parseAnalysisHistory(raw), [], 'Missing or corrupt storage must not crash the page');
}
assert.deepEqual(parseAnalysisHistory(JSON.stringify([
  null, {}, { text: '', analyzedAt: 1 }, { text: ' ', analyzedAt: 1 },
  { text: 123, analyzedAt: 1 }, { text: 'invalid date', analyzedAt: 1e20 },
  { text: 'invalid date', analyzedAt: 'today' }, { text: 'invalid date', analyzedAt: -1 },
  { text: '重複', analyzedAt: 1 }, { text: '重複', analyzedAt: 3 },
  { text: '最初', analyzedAt: 2, extra: 'discard' },
])), [{ text: '重複', analyzedAt: 3 }, { text: '最初', analyzedAt: 2 }]);

const oversized = Array.from({ length: 60 }, (_, i) => ({ text: `文 ${i}`, analyzedAt: i + 1 }));
const restored = parseAnalysisHistory(JSON.stringify(oversized));
assert.equal(restored.length, 50);
assert.equal(restored[0].text, '文 59');
assert.equal(restored.at(-1)?.text, '文 10');
assert.deepEqual(parseAnalysisHistory('[]'), [], 'Cleared history stays empty after reload');
console.log('Analysis history tests passed');
