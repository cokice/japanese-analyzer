import { type TokenData } from '../lib/apiTypes';

export const LEGACY_ANALYSIS_HISTORY_KEY = 'japaneseAnalyzer:analysisHistory:v1';
export const ANALYSIS_HISTORY_KEY = 'japaneseAnalyzer:analysisHistory:v2';
export const ANALYSIS_HISTORY_LIMIT = 50;

export interface AnalysisHistoryEntry {
  text: string;
  analyzedAt: number;
  tokens?: TokenData[];
}

function validTokens(text: string, tokens: unknown): TokenData[] | undefined {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => !token || typeof token !== 'object'
    || typeof token.word !== 'string' || !token.word || typeof token.pos !== 'string'
    || (token.furigana !== undefined && typeof token.furigana !== 'string')
    || (token.romaji !== undefined && typeof token.romaji !== 'string'))
    || tokens.map(token => token.word).join('') !== text) return undefined;
  return tokens.map(({ word, pos, furigana, romaji }) => ({ word, pos,
    ...(furigana !== undefined ? { furigana } : {}), ...(romaji !== undefined ? { romaji } : {}) }));
}

function isHistoryEntry(value: unknown): value is AnalysisHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AnalysisHistoryEntry>;
  return typeof entry.text === 'string' && entry.text.trim().length > 0
    && typeof entry.analyzedAt === 'number' && entry.analyzedAt > 0
    && Number.isFinite(new Date(entry.analyzedAt).getTime());
}

export function parseAnalysisHistory(raw: string | null): AnalysisHistoryEntry[] {
  try {
    const entries: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(entries)) return [];
    const seen = new Set<string>();
    return entries.filter(isHistoryEntry)
      .sort((a, b) => b.analyzedAt - a.analyzedAt)
      .filter(entry => {
        const key = entry.text.trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, ANALYSIS_HISTORY_LIMIT)
      .map(({ text, analyzedAt, tokens }) => {
        const cached = validTokens(text, tokens);
        return { text, analyzedAt, ...(cached ? { tokens: cached } : {}) };
      });
  } catch {
    return [];
  }
}

export function addAnalysisHistoryEntry(
  entries: AnalysisHistoryEntry[],
  text: string,
  analyzedAt = Date.now(),
  tokens?: TokenData[],
): AnalysisHistoryEntry[] {
  if (!text.trim()) return entries;
  const cached = validTokens(text, tokens);
  return [
    { text, analyzedAt, ...(cached ? { tokens: cached } : {}) },
    ...entries.filter(entry => entry.text.trim() !== text.trim()),
  ].slice(0, ANALYSIS_HISTORY_LIMIT);
}
