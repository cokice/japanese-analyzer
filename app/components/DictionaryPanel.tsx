'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDictionary } from '../hooks/useDictionary';
import { externalDictionaryLinks, type DictionaryEntry, type DictionaryProvider } from '../lib/dictionary';
import { postLearning, type LearningModel } from '../services/learning';
import { validateTranslations, type SenseTranslation } from '../lib/learningTools';
import { LatestRequest } from '../utils/latestRequest';

function Entry({ entry, tags, model }: { entry: DictionaryEntry; tags?: Record<string, string>; model: LearningModel }) {
  const { t, locale, errorText } = useLanguage();
  const [count, setCount] = useState(5);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const request = useRef(new LatestRequest()); const cache = useRef(new Map<string, SenseTranslation>());
  useEffect(() => { const manager = request.current; manager.cancel(); setLoading(false); setTranslations({}); setError(''); return () => manager.cancel(); }, [entry.id, entry.source.version, entry.source.id, locale, model.endpoint, model.apiKey]);
  const translate = async () => {
    const senses = entry.senses.slice(0, Math.min(count, 10)).map(s => ({ id: s.id, text: s.glosses.join('; ') }));
    const key = JSON.stringify([entry.source.id, entry.source.version, entry.id, senses, locale, model.endpoint, model.apiKey]);
    const cached = cache.current.get(key);
    if (cached) { setTranslations(Object.fromEntries(cached.translations.map(s => [s.id, s.text]))); return; }
    const ticket = request.current.start(); setLoading(true); setError('');
    try {
      const value = validateTranslations(await postLearning('/api/dictionary/translate', { senses }, ticket.signal, model), senses);
      if (!ticket.isCurrent()) return;
      cache.current.set(key, value); if (cache.current.size > 40) cache.current.delete(cache.current.keys().next().value!);
      setTranslations(Object.fromEntries(value.translations.map(s => [s.id, s.text])));
    } catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  const label = (values: string[]) => values.map(v => tags?.[v] || v).join(' · ');
  return <article className="dictionary-entry">
    <h3 lang="ja">{entry.spellings.map(s => s.text).join('・') || entry.readings[0]?.text}</h3>
    <p lang="ja">{entry.readings.map(r => `${r.text}${r.appliesTo.includes('*') ? '' : ` (${r.appliesTo.join('・')})`}`).join('・')}</p>
    {entry.common && <small>{t('常用词')}</small>}
    <ol>{entry.senses.slice(0, count).map(s => <li key={s.id}>
      <small>{label(s.pos)}</small><p lang="en">{s.glosses.join('; ')}</p>
      {translations[s.id] && <p><small>{t('AI 译文')}</small> {translations[s.id]}</p>}
      {!s.appliesToSpellings.includes('*') && s.appliesToSpellings.length > 0 && <small>{t('适用写法')}：{s.appliesToSpellings.join('・')}</small>}
      {!s.appliesToReadings.includes('*') && s.appliesToReadings.length > 0 && <small>{t('适用读音')}：{s.appliesToReadings.join('・')}</small>}
      {(s.tags.length > 0 || s.notes.length > 0) && <p className="tool-note">{label(s.tags)} {s.notes.join('; ')}</p>}
    </li>)}</ol>
    <div className="learning-actions">
      {entry.senses.length > count && <button className="nd-ghost-btn" onClick={() => setCount(c => c + 5)}>{t('更多义项')}</button>}
      {locale !== 'en' && <button className="nd-soft-btn" disabled={loading} onClick={translate}>{t(loading ? '翻译中…' : '翻译已展开义项（最多十项）')}</button>}
    </div>
    {error && <p role="alert">{errorText(error)}</p>}
    <p className="tool-note"><a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.name}</a> · {entry.source.date} · <a href={entry.source.licenseUrl} target="_blank" rel="noreferrer">{entry.source.license}</a></p>
  </article>;
}
export default function DictionaryPanel({ word, lemma = '', reading = '', provider, model, standalone = false }: { word: string; lemma?: string; reading?: string; provider: DictionaryProvider; model: LearningModel; standalone?: boolean }) {
  const { t, errorText } = useLanguage();
  const { result, loading, error, retry, more } = useDictionary(word, lemma, reading, provider);
  const links = externalDictionaryLinks(word, lemma);
  if (!word) return null;
  const content = <>
    {loading && <p role="status">{t('正在查询词典…')}</p>}
    {error && <p role="alert">{errorText(error)} <button className="nd-ghost-btn" onClick={retry}>{t('重试')}</button></p>}
    {result?.fallback && <p role="status">{t('已回退内置词典')} · {t({ empty: '外部词典无结果', timeout: '外部词典超时', unavailable: '外部词典连接失败' }[result.fallback])}</p>}
    {result && !result.entries.length && !loading && <p>{t('未找到词条')}</p>}
    {result?.entries.map(e => <Entry key={`${e.source.id}:${e.id}`} entry={e} tags={result.tags} model={model} />)}
    {result?.hasMore && <button className="nd-soft-btn" disabled={loading} onClick={more}>{t('更多词条')}</button>}
    {result && <p className="tool-note">{result.source.name} · {result.source.version} · <a target="_blank" rel="noreferrer" href={result.source.licenseUrl}>{result.source.license}</a></p>}
    <details><summary>{t('外部查询')}</summary><div className="learning-actions"><a href={links.ichi} target="_blank" rel="noreferrer">ichi.moe</a><a href={links.wiktionary} target="_blank" rel="noreferrer">Wiktionary</a></div></details>
  </>;
  return standalone ? <section className="nd-card dictionary-results">{content}</section> : <details className="dictionary-results"><summary>{t('词典义项')}</summary>{content}</details>;
}
