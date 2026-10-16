import type { TokenData } from '../services/api';
import { getLocalRomaji } from '../utils/romaji';

export interface ConjugationResult { analyses: { dictionaryForm: string; steps: { form: string; label: string }[]; note: string }[]; insufficient: boolean; }
export interface ResegmentResult { candidates: { tokens: TokenData[] }[]; }
export interface SenseTranslation { translations: { id: string; text: string }[]; }
export const SCHOOL_POS = ['名詞','代名詞','動詞','形容詞','形容動詞','副詞','連体詞','接続詞','感動詞','助詞','助動詞','記号','改行'];
export function validateCandidates(value: unknown, selection: string, segments?: string[]): ResegmentResult {
  const candidates = (value as ResegmentResult)?.candidates;
  if (!Array.isArray(candidates) || candidates.length > 3) throw new Error('分词候选格式无效');
  const seen = new Set<string>();
  return { candidates: candidates.map(c => {
    if (!Array.isArray(c.tokens) || !c.tokens.length || !c.tokens.every(t => t && typeof t.word === 'string' && !!t.word && SCHOOL_POS.includes(t.pos) && typeof t.furigana === 'string') || c.tokens.map(t => t.word).join('') !== selection || segments && (c.tokens.length !== segments.length || c.tokens.some((t, i) => t.word !== segments[i]))) throw new Error('候选分词未保留原文或指定边界');
    const key = JSON.stringify(c.tokens.map(t => t.word)); if (seen.has(key)) throw new Error('分词候选重复'); seen.add(key);
    return { tokens: c.tokens.map(t => ({ ...t, romaji: getLocalRomaji(t.word, t.furigana, t.pos) })) };
  }) };
}
export function validateConjugation(value: unknown, surface: string): ConjugationResult {
  const result = value as ConjugationResult;
  if (!result || typeof result.insufficient !== 'boolean' || !Array.isArray(result.analyses) || result.analyses.length > 5 || !result.analyses.every(a => typeof a.dictionaryForm === 'string' && typeof a.note === 'string' && Array.isArray(a.steps) && a.steps.length > 0 && a.steps.length <= 12 && a.steps.every(s => typeof s.form === 'string' && typeof s.label === 'string') && a.steps[0].form === a.dictionaryForm && a.steps.at(-1)?.form === surface) || !result.insufficient && !result.analyses.length) throw new Error('活用过程格式无效');
  return result;
}
export function validateTranslations(value: unknown, senses: { id: string }[]): SenseTranslation {
  const result = value as SenseTranslation;
  const ids = new Set(senses.map(s => s.id));
  if (!Array.isArray(result?.translations) || result.translations.length !== senses.length || new Set(result.translations.map(t => t.id)).size !== ids.size || !result.translations.every(t => ids.has(t.id) && typeof t.text === 'string' && t.text.trim())) throw new Error('译文与词典义项不匹配');
  return result;
}
