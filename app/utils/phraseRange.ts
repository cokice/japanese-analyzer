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
 * 规范化圈选范围。a 是圈选的起点（拖动起点、Shift 点击前选中的词、长按的词），b 是终点：
 * 不跨换行（保留起点所在的那一段）、去掉首尾标点、最多 PHRASE_MAX_WORDS 个词（超出时截掉远离起点的一侧）。
 * 不足两个词时返回 null。
 */
export function normalizePhraseRange(tokens: readonly TokenData[], a: number, b: number): PhraseRange | null {
  const last = tokens.length - 1;
  const anchor = Math.min(last, Math.max(0, a));
  let start = Math.max(0, Math.min(a, b));
  let end = Math.min(last, Math.max(a, b));

  for (let i = anchor; i <= end; i++) {
    if (tokens[i].pos === '改行') {
      end = i - 1;
      break;
    }
  }
  for (let i = anchor; i >= start; i--) {
    if (tokens[i].pos === '改行') {
      start = i + 1;
      break;
    }
  }

  const words: number[] = [];
  for (let i = start; i <= end; i++) {
    if (!isPunctuationToken(tokens[i])) words.push(i);
  }
  if (words.length < 2) return null;
  // 往回选（起点在后）时保留靠后的词，否则保留靠前的词
  const kept = a > b ? words.slice(-PHRASE_MAX_WORDS) : words.slice(0, PHRASE_MAX_WORDS);
  return { start: kept[0], end: kept[kept.length - 1] };
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
