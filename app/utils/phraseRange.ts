import type { TokenData } from '../services/api';
import { getLocalRomaji } from './romaji';

/** 一次最多圈选的词数（不含标点） */
export const PHRASE_MAX_WORDS = 12;

export interface PhraseRange {
  start: number;
  end: number;
}

const PUNCTUATION_ONLY_RE = /^[\s。、，,.!?？！:：;；「」『』（）()[\]【】〈〉《》…・･〜～\-—―]+$/;

export function isPunctuationToken(token: TokenData): boolean {
  const pos = token.pos || '';
  return pos.includes('記号')
    || pos.includes('標点')
    || pos.includes('标点')
    || pos.includes('句読点')
    || pos.includes('符号')
    || PUNCTUATION_ONLY_RE.test(token.word);
}

/**
 * 规范化圈选范围：不跨换行（以起点所在段为准）、去掉首尾标点、最多 PHRASE_MAX_WORDS 个词。
 * 不足两个词时返回 null。
 */
export function normalizePhraseRange(tokens: readonly TokenData[], a: number, b: number): PhraseRange | null {
  let start = Math.max(0, Math.min(a, b));
  let end = Math.min(tokens.length - 1, Math.max(a, b));

  for (let i = start; i <= end; i++) {
    if (tokens[i].pos === '改行') {
      end = i - 1;
      break;
    }
  }
  while (start <= end && isPunctuationToken(tokens[start])) start++;
  while (end >= start && isPunctuationToken(tokens[end])) end--;

  let words = 0;
  for (let i = start; i <= end; i++) {
    if (isPunctuationToken(tokens[i])) continue;
    words++;
    if (words > PHRASE_MAX_WORDS) {
      end = i - 1;
      words--;
      break;
    }
  }
  while (end >= start && isPunctuationToken(tokens[end])) end--;

  return words >= 2 ? { start, end } : null;
}

export function getPhraseText(tokens: readonly TokenData[], range: PhraseRange): string {
  return tokens.slice(range.start, range.end + 1).map((token) => token.word).join('');
}

/** 整段读音：有注音的词用注音，其余用原文 */
export function getPhraseReading(tokens: readonly TokenData[], range: PhraseRange): string {
  return tokens.slice(range.start, range.end + 1).map((token) => token.furigana || token.word).join('');
}

/** 把被拆开的一个词合并回单个词项；词性、读音取 AI 给出的结果 */
export function mergePhraseTokens(
  tokens: readonly TokenData[],
  range: PhraseRange,
  merged: { pos?: string; furigana?: string },
): TokenData[] {
  const word = getPhraseText(tokens, range);
  const pos = merged.pos?.trim() || '名詞';
  const furigana = merged.furigana?.trim() || getPhraseReading(tokens, range);
  return [
    ...tokens.slice(0, range.start),
    { word, pos, furigana, romaji: getLocalRomaji(word, furigana, pos) },
    ...tokens.slice(range.end + 1),
  ];
}
