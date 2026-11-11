'use client';

import type { TokenData } from '../services/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ANALYSIS_HISTORY_KEY,
  LEGACY_ANALYSIS_HISTORY_KEY,
  addAnalysisHistoryEntry,
  parseAnalysisHistory,
  type AnalysisHistoryEntry,
} from '../utils/analysisHistory';

export function useAnalysisHistory() {
  const [entries, setEntries] = useState<AnalysisHistoryEntry[]>([]);
  const entriesRef = useRef<AnalysisHistoryEntry[]>([]);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  useEffect(() => {
    const reload = () => {
      try {
        const current = localStorage.getItem(ANALYSIS_HISTORY_KEY);
        const legacy = current === null ? localStorage.getItem(LEGACY_ANALYSIS_HISTORY_KEY) : null;
        const loaded = parseAnalysisHistory(current ?? legacy);
        entriesRef.current = loaded;
        setEntries(loaded);
        if (current === null && legacy !== null) localStorage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(loaded));
        setStorageUnavailable(false);
      } catch {
        setStorageUnavailable(true);
      }
    };
    reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === ANALYSIS_HISTORY_KEY || event.key === LEGACY_ANALYSIS_HISTORY_KEY || event.key === null) reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((next: AnalysisHistoryEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    try {
      localStorage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(next));
      setStorageUnavailable(false);
    } catch {
      // Keep history usable for this session even if persistence is unavailable.
      setStorageUnavailable(true);
    }
  }, []);

  const record = useCallback((text: string, tokens: TokenData[]) => {
    save(addAnalysisHistoryEntry(entriesRef.current, text, Date.now(), tokens));
  }, [save]);
  const clear = useCallback(() => save([]), [save]);

  return { entries, record, clear, storageUnavailable };
}
