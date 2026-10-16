import type { TokenData } from '../services/api';
import { isPunctuationToken, type PhraseRange } from './phraseRange';

export interface SourceRange { start: number; end: number; }
export interface ReadingGroup extends SourceRange { suppressed?: boolean; }
export interface EditSnapshot { tokens: TokenData[]; groups: ReadingGroup[]; }
export interface EditState extends EditSnapshot { initial: TokenData[]; taskId: number; revision: number; history: EditSnapshot[]; }
export function withEditHistory(state: EditState, tokens: TokenData[], groups: ReadingGroup[]): EditState {
  if (JSON.stringify({ tokens, groups }) === JSON.stringify({ tokens: state.tokens, groups: state.groups })) return state;
  return { ...state, tokens, groups, revision: state.revision + 1, history: [...state.history, { tokens: state.tokens, groups: state.groups }].slice(-20) };
}
export function tokenOffsets(tokens: readonly TokenData[]): SourceRange[] {
  let offset = 0; return tokens.map(t => { const start = offset; offset += t.word.length; return { start, end: offset }; });
}
export function sourceRange(tokens: TokenData[], range: PhraseRange): SourceRange {
  const offsets = tokenOffsets(tokens); return { start: offsets[range.start].start, end: offsets[range.end].end };
}
export function applyTokenEdit(state: EditState, range: PhraseRange, replacements: TokenData[]): EditState {
  const selected = state.tokens.slice(range.start, range.end + 1).map(t => t.word).join('');
  if (!replacements.length || replacements.some(t => !t.word) || replacements.map(t => t.word).join('') !== selected) throw new Error('候选分词未保留原文或指定边界');
  const affected = sourceRange(state.tokens, range);
  return withEditHistory(state, [...state.tokens.slice(0, range.start), ...replacements, ...state.tokens.slice(range.end + 1)], state.groups.filter(g => g.end <= affected.start || g.start >= affected.end));
}
const AUXILIARIES = new Set(['いる','ある','いく','ゆく','くる','しまう','おく','みる','もらう','くれる','あげる','いただく','来る','行く','置く','見る']);
export function buildReadingGroups(tokens: TokenData[], manual: ReadingGroup[]): PhraseRange[] {
  const offsets = tokenOffsets(tokens); const groups: PhraseRange[] = [];
  const boundary = (i: number) => isPunctuationToken(tokens[i]) || /\s/.test(tokens[i].word) || tokens[i].pos === '改行';
  const overlapsManual = (a: number, b: number) => manual.some(g => g.start < offsets[b].end && g.end > offsets[a].start);
  for (let i = 0; i < tokens.length;) {
    const fixed = manual.find(g => !g.suppressed && g.start === offsets[i].start);
    if (fixed) {
      const end = offsets.findIndex(o => o.end === fixed.end);
      if (end >= i && !tokens.slice(i, end + 1).some((_, n) => boundary(i + n))) { groups.push({ start: i, end }); i = end + 1; continue; }
    }
    let end = i;
    if (!boundary(i) && /^(動詞|形容詞)$/.test(tokens[i].pos) && !overlapsManual(i, i)) {
      while (end - i < 11 && end + 1 < tokens.length && !boundary(end + 1) && !overlapsManual(end + 1, end + 1)) {
        if (tokens[end + 1].pos === '助動詞') { end++; continue; }
        if (end - i < 10 && ['て','で'].includes(tokens[end + 1].word) && tokens[end + 1].pos === '助詞' && tokens[end + 2]?.pos === '動詞' && AUXILIARIES.has(tokens[end + 2].word) && !overlapsManual(end + 2, end + 2)) { end += 2; continue; }
        break;
      }
    }
    groups.push({ start: i, end }); i = end + 1;
  }
  return groups;
}
