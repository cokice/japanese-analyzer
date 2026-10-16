import { createHash } from 'node:crypto';

export const bucket = value => createHash('sha256').update(value).digest('hex').slice(0, 2);
export const normalizeKey = value => value.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).trim();
export function convertWord(word) {
  return {
    id: String(word.id),
    spellings: word.kanji.map(k => ({ text: k.text, common: k.common, tags: k.tags })),
    readings: word.kana.map(k => ({ text: k.text, common: k.common, appliesTo: k.appliesToKanji, tags: k.tags })),
    common: [...word.kanji, ...word.kana].some(k => k.common),
    senses: word.sense.map((s, i) => ({
      id: `${word.id}:${i}`, pos: s.partOfSpeech, glosses: s.gloss.filter(g => g.lang === 'eng').map(g => g.text),
      appliesToSpellings: s.appliesToKanji, appliesToReadings: s.appliesToKana,
      tags: [...s.field, ...s.dialect, ...s.misc], notes: s.info,
    })),
  };
}
