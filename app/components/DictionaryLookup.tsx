'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { DictionaryProvider } from '../lib/dictionary';
import { getWordDetails } from '../services/api';
import type { LearningModel } from '../services/learning';
import { LatestRequest } from '../utils/latestRequest';
import DictionaryPanel from './DictionaryPanel';

export default function DictionaryLookup({ draft, onDraftChange, provider, model }: { draft: string; onDraftChange: (s: string) => void; provider: DictionaryProvider; model: LearningModel }) {
  const { t, locale, errorText } = useLanguage(); const [query, setQuery] = useState(''); const [lemma, setLemma] = useState('');
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const request = useRef(new LatestRequest());
  useEffect(() => { const manager = request.current; manager.cancel(); setLoading(false); setLemma(''); setError(''); return () => manager.cancel(); }, [locale, model.endpoint, model.apiKey, query, provider]);
  const findLemma = async () => {
    const ticket = request.current.start(); setLoading(true); setError('');
    try {
      const detail = await getWordDetails(query, '', '', '', model.apiKey, model.endpoint, ticket.signal, 'lookup');
      if (ticket.isCurrent()) setLemma(detail.dictionaryForm || '');
    } catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  return <section>
    <form className="nd-card learning-actions" onSubmit={e => { e.preventDefault(); setLemma(''); setQuery(draft.trim()); }}>
      <label className="flex-1">{t('查词')}<input className="learning-input" lang="ja" value={draft} onChange={e => onDraftChange(e.target.value)} maxLength={240} /></label>
      <button className="nd-soft-btn" disabled={!draft.trim() || [...draft.trim()].length > 120}>{t('查询')}</button>
    </form>
    {query && <><div className="learning-actions"><button className="nd-ghost-btn" disabled={loading} onClick={findLemma}>{t(loading ? '查找中…' : 'AI 查找原形')}</button>{lemma && <span>{t('AI 推断原形')}：<span lang="ja">{lemma}</span></span>}</div><DictionaryPanel word={query} lemma={lemma} provider={provider} model={model} standalone /></>}
    {error && <p role="alert">{errorText(error)}</p>}
  </section>;
}
