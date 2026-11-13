import { API_ERROR_MESSAGES, isApiErrorCode, type ApiErrorPayload } from '../lib/apiErrors';
import { messages } from './messages';

export const LOCALES = ['zh-CN', 'zh-TW', 'en', 'ko'] as const;
export type Locale = typeof LOCALES[number];
export const DEFAULT_LOCALE: Locale = 'zh-CN';
export const LANGUAGE_STORAGE_KEY = 'language';
export const LANGUAGE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ko: '한국어',
};

export function normalizeLocale(value: unknown): Locale {
  return LOCALES.includes(value as Locale) ? value as Locale : DEFAULT_LOCALE;
}

export function getClientLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  return normalizeLocale(document.documentElement.lang);
}

export type Translator = (key: string, ...values: (string | number)[]) => string;

export function createTranslator(locale: Locale): Translator {
  return (key, ...values) => {
    const entry = messages[key as keyof typeof messages];
    const text = locale === 'zh-CN' ? key : entry?.[locale] ?? key;
    return text.replace(/\{(\d+)\}/g, (match, index) => String(values[Number(index)] ?? match));
  };
}

/** Errors cross the API boundary as stable codes, never language-dependent templates. */
export function localizeError(error: string | Error | ApiErrorPayload, locale: Locale): string {
  const t = createTranslator(locale);
  if (typeof error === 'object' && 'code' in error && isApiErrorCode(error.code)) {
    return t(API_ERROR_MESSAGES[error.code], ...('params' in error && Array.isArray(error.params) ? error.params : []));
  }
  return t(typeof error === 'string' ? error : error instanceof Error ? error.message : API_ERROR_MESSAGES.SERVER_ERROR);
}
