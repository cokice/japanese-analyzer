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

// Match application-owned error templates, retaining unknown upstream diagnostics verbatim.
const errorTemplates = Object.keys(messages).filter(key => /\{\d+\}/.test(key)).map(key => {
  const pattern = key.split(/\{\d+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)');
  return { key, pattern: new RegExp(`^${pattern}$`, 's') };
});

export function localizeError(message: string, locale: Locale, depth = 0): string {
  const t = createTranslator(locale);
  if (locale === 'zh-CN' || depth > 4) return message;
  if (message in messages) return t(message);
  for (const { key, pattern } of errorTemplates) {
    const match = pattern.exec(message);
    if (match) return t(key, ...match.slice(1).map(value => localizeError(value, locale, depth + 1)));
  }
  return message;
}
