'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { externalDictionaryLinks } from '../lib/dictionary';
import { I } from './Icons';

export default function ExternalDictionaryLookup({ word, lemma = '' }: { word: string; lemma?: string }) {
  const { t } = useLanguage();
  if (!word.trim()) return null;
  const links = externalDictionaryLinks(word, lemma);
  return <details className="detail-disclosure external-dictionary">
    <summary>{t('外部查询')}</summary>
    <div className="external-dictionary-links">
      <a href={links.ichi} target="_blank" rel="noreferrer">ichi.moe<I w={14}><path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" /></I></a>
      <a href={links.wiktionary} target="_blank" rel="noreferrer">Wiktionary<I w={14}><path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" /></I></a>
    </div>
  </details>;
}
