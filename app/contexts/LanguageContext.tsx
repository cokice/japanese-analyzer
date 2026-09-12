'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createTranslator, localizeError, DEFAULT_LOCALE, LANGUAGE_STORAGE_KEY, normalizeLocale, type Locale, type Translator } from '../i18n';

const LanguageContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: Translator; errorText: (message: string) => string } | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(DEFAULT_LOCALE);
  const applyLocale = useCallback((value: Locale) => {
    document.documentElement.lang = value;
    const t = createTranslator(value);
    document.title = t('日本語文章解析器 - AI驱动');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('AI驱动・深入理解日语句子结构与词义'));
    updateLocale(value);
  }, []);

  useEffect(() => {
    try { applyLocale(normalizeLocale(localStorage.getItem(LANGUAGE_STORAGE_KEY))); }
    catch { applyLocale(DEFAULT_LOCALE); }
    const onStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) applyLocale(normalizeLocale(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [applyLocale]);

  const setLocale = useCallback((value: Locale) => {
    const next = normalizeLocale(value);
    applyLocale(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* Session-only preference when storage is unavailable. */ }
  }, [applyLocale]);
  const value = useMemo(() => ({ locale, setLocale, t: createTranslator(locale), errorText: (message: string) => localizeError(message, locale) }), [locale, setLocale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
