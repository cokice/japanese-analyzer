'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDictionary } from '../hooks/useDictionary';
import { dictionaryMatch, type DictionaryEntry, type DictionaryMatch, type DictionaryProvider } from '../lib/dictionary';
import { postLearning, type LearningModel } from '../services/learning';
import { validateTranslations, type SenseTranslation } from '../lib/learningTools';
import { LatestRequest } from '../utils/latestRequest';
import { credentialScope } from '../utils/sentenceCache';

const translationCache = new Map<string, SenseTranslation>();

function Entry({ entry, tags, model, match, showSource }: { entry: DictionaryEntry; tags?: Record<string, string>; model: LearningModel; match: DictionaryMatch; showSource: boolean }) {
  const { t, locale, errorText } = useLanguage();
  const [count, setCount] = useState(5);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const request = useRef(new LatestRequest());
  useEffect(() => { const manager = request.current; manager.cancel(); setLoading(false); setTranslations({}); setError(''); return () => manager.cancel(); }, [entry.id, entry.source.version, entry.source.id, locale, model.endpoint, model.apiKey]);
  const translate = async () => {
    const senses = entry.senses.slice(0, Math.min(count, 10)).map(s => ({ id: s.id, text: s.glosses.join('; ') }));
    const key = JSON.stringify([entry.source.id, entry.source.version, entry.id, senses, locale, model.endpoint, credentialScope(model.apiKey)]);
    const cached = translationCache.get(key);
    if (cached) { setTranslations(Object.fromEntries(cached.translations.map(s => [s.id, s.text]))); return; }
    const ticket = request.current.start(); setLoading(true); setError('');
    try {
      const value = validateTranslations(await postLearning('/api/dictionary/translate', { senses }, ticket.signal, model), senses);
      if (!ticket.isCurrent()) return;
      translationCache.set(key, value); if (translationCache.size > 40) translationCache.delete(translationCache.keys().next().value!);
      setTranslations(Object.fromEntries(value.translations.map(s => [s.id, s.text])));
    } catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  const label = (values: string[]) => values.map(v => typeof tags?.[v] === 'string' ? tags[v] : v).join(' · ');
  return <article className="dictionary-entry" data-match={match}>
    <header className="dictionary-entry-heading">
      <h3 lang="ja">{entry.spellings.map(s => s.text).join('・') || entry.readings[0]?.text}</h3>
      <div className="dictionary-entry-badges">{entry.common && <small>{t('常用词')}</small>}{match !== 'surface' && <small>{t({ lemma: '原形匹配', reading: '读音匹配', other: '其他匹配' }[match])}</small>}</div>
    </header>
    <p className="dictionary-entry-reading" lang="ja">{entry.readings.map(r => `${r.text}${r.appliesTo.includes('*') ? '' : ` (${r.appliesTo.join('・')})`}`).join('・')}</p>
    <ol>{entry.senses.slice(0, count).map(s => <li key={s.id}>
      <small>{label(s.pos)}</small><p lang="en">{s.glosses.join('; ')}</p>
      {translations[s.id] && <p><small>{t('AI 译文')}</small> {translations[s.id]}</p>}
      {!s.appliesToSpellings.includes('*') && s.appliesToSpellings.length > 0 && <small>{t('适用写法')}：{s.appliesToSpellings.join('・')}</small>}
      {!s.appliesToReadings.includes('*') && s.appliesToReadings.length > 0 && <small>{t('适用读音')}：{s.appliesToReadings.join('・')}</small>}
      {(s.tags.length > 0 || s.notes.length > 0) && <p className="tool-note">{label(s.tags)} {s.notes.join('; ')}</p>}
    </li>)}</ol>
    <div className="learning-actions dictionary-entry-actions">
      {entry.senses.length > count && <button className="nd-ghost-btn" onClick={() => setCount(c => c + 5)}>{t('更多义项')}</button>}
      {locale !== 'en' && <button className="nd-ghost-btn" disabled={loading} onClick={translate}>{t(loading ? '翻译中…' : '翻译已展开义项（最多十项）')}</button>}
    </div>
    {error && <p role="alert">{errorText(error)}</p>}
    {showSource && <p className="tool-note dictionary-source"><a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.name}</a> · {entry.source.date} · {entry.source.version} · <a href={entry.source.licenseUrl} target="_blank" rel="noreferrer">{entry.source.license}</a></p>}
  </article>;
}
export default function DictionaryPanel({ word, lemma = '', reading = '', provider, model, standalone = false, onEmptyChange }: { word: string; lemma?: string; reading?: string; provider: DictionaryProvider; model: LearningModel; standalone?: boolean; onEmptyChange?: (empty: boolean) => void }) {
  const { t, errorText } = useLanguage();
  const { result, loading, error, retry, more } = useDictionary(word, lemma, reading, provider);
  const matches = (result?.entries ?? []).map(entry => ({ entry, match: dictionaryMatch(entry, word, lemma, reading) }));
  const primary = matches.filter(value => value.match === 'surface' || value.match === 'lemma');
  const related = matches.filter(value => value.match === 'reading' || value.match === 'other');
  const hasPrimary = primary.length > 0;
  useEffect(() => { onEmptyChange?.(!!result && !hasPrimary && !loading && !error); }, [result, hasPrimary, loading, error, onEmptyChange]);
  if (!word) return null;
  const renderEntry = ({ entry, match }: typeof matches[number]) => <Entry key={`${entry.source.id}:${entry.source.version}:${entry.id}`} entry={entry} match={match} tags={result?.tags} model={model} showSource={JSON.stringify(entry.source) !== JSON.stringify(result?.source)} />;
  const content = <>
    {loading && <p role="status">{t('正在查询词典…')}</p>}
    {error && <p role="alert">{errorText(error)} <button className="nd-ghost-btn" onClick={retry}>{t('重试')}</button></p>}
    {result?.fallback && <p role="status">{t('已回退内置词典')} · {t({ empty: '外部词典无结果', timeout: '外部词典超时', unavailable: '外部词典连接失败' }[result.fallback])}</p>}
    {result && !result.entries.length && !loading && <p>{t('未找到词条')}</p>}
    {primary.map(renderEntry)}
    {related.length > 0 && <>
      {!primary.length && <p className="tool-note">{t('没有本词或原形的精确匹配，请展开其他匹配核对。')}</p>}
      <details className="dictionary-related detail-disclosure"><summary>{t('同音及其他匹配（{0}）', related.length)}</summary>
        <p className="tool-note">{t('这些词条来自读音等扩展检索，不代表当前选词的含义。')}</p>
        {related.map(renderEntry)}
      </details>
    </>}
    {result?.hasMore && <button className="nd-soft-btn" disabled={loading} onClick={more}>{t('更多词条')}</button>}
    {result && <footer className="tool-note dictionary-source"><a target="_blank" rel="noreferrer" href={result.source.url}>{result.source.name}</a><span>{result.source.date} · {result.source.version}</span><a target="_blank" rel="noreferrer" href={result.source.licenseUrl}>{result.source.license}</a></footer>}
  </>;
  return standalone ? <section className="dictionary-results dictionary-results-standalone"><h2 className="dictionary-results-title">{t('词典义项')}</h2>{content}</section> : <details className="dictionary-results detail-disclosure"><summary>{t('词典义项')}</summary>{content}</details>;
}
