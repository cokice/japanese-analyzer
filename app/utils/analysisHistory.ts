export const ANALYSIS_HISTORY_KEY = 'japaneseAnalyzer:analysisHistory:v1';
export const ANALYSIS_HISTORY_LIMIT = 50;

export interface AnalysisHistoryEntry {
  text: string;
  analyzedAt: number;
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
      .map(({ text, analyzedAt }) => ({ text, analyzedAt }));
  } catch {
    return [];
  }
}

export function addAnalysisHistoryEntry(
  entries: AnalysisHistoryEntry[],
  text: string,
  analyzedAt = Date.now(),
): AnalysisHistoryEntry[] {
  if (!text.trim()) return entries;
  return [
    { text, analyzedAt },
    ...entries.filter(entry => entry.text.trim() !== text.trim()),
  ].slice(0, ANALYSIS_HISTORY_LIMIT);
}
