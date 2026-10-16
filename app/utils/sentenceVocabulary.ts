import type { TokenData } from '../services/api';
import { isPunctuationToken } from './phraseRange';

export interface VocabularyOccurrence { tokenIndex: number; start: number; end: number; }
export interface SentenceVocabularyItem {
  key: string;
  token: TokenData;
  lemma: string;
  occurrences: VocabularyOccurrence[];
}

// Keep homographs with different readings or grammatical roles separate.
export const vocabularyKey = (token: TokenData) => JSON.stringify([token.word, token.furigana || '', token.pos]);

export function collectSentenceVocabulary(sentence: string, tokens: readonly TokenData[], forms: Record<string, string> = {}): SentenceVocabularyItem[] {
  if (!sentence || tokens.map(token => token.word).join('') !== sentence) return [];
  const items = new Map<string, SentenceVocabularyItem>();
  let offset = 0;
  tokens.forEach((token, tokenIndex) => {
    const start = offset;
    offset += token.word.length;
    if (!token.word.trim() || token.pos === '改行' || isPunctuationToken(token)) return;
    const key = vocabularyKey(token);
    let item = items.get(key);
    if (!item) {
      item = { key, token, lemma: forms[key] || '', occurrences: [] };
      items.set(key, item);
    }
    item.occurrences.push({ tokenIndex, start, end: offset });
  });
  return [...items.values()];
}

export function vocabularyContext(sentence: string, occurrence: VocabularyOccurrence) {
  const before = Array.from(sentence.slice(0, occurrence.start));
  const after = Array.from(sentence.slice(occurrence.end));
  return {
    before: `${before.length > 24 ? '…' : ''}${before.slice(-24).join('')}`,
    word: sentence.slice(occurrence.start, occurrence.end),
    after: `${after.slice(0, 24).join('')}${after.length > 24 ? '…' : ''}`,
  };
}
