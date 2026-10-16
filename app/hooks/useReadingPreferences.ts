'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserStorage } from '../utils/storage';
import { DEFAULT_READING_PREFERENCES, parseReadingPreferences, parseSharedText, READING_PREFERENCES_KEY, type ReadingPreferences } from '../utils/readingPreferences';

export function useReadingPreferences(onSharedText: (text: string) => void) {
  const [preferences, setPreferences] = useState(DEFAULT_READING_PREFERENCES);
  const hydrated = useRef(false); const sharedSession = useRef(false); const receiver = useRef(onSharedText); receiver.current = onSharedText;
  useEffect(() => {
    const shared = parseSharedText(window.location.hash);
    sharedSession.current = !!shared;
    setPreferences(shared?.preferences ?? parseReadingPreferences(browserStorage.getItem(READING_PREFERENCES_KEY)));
    if (shared) receiver.current(shared.text);
    hydrated.current = true;
  }, []);
  const change = useCallback(<K extends keyof ReadingPreferences>(key: K, value: ReadingPreferences[K]) => {
    setPreferences(previous => { const next = { ...previous, [key]: value }; if (hydrated.current && !sharedSession.current) browserStorage.setItem(READING_PREFERENCES_KEY, JSON.stringify(next)); return next; });
  }, []);
  return { preferences, change };
}
