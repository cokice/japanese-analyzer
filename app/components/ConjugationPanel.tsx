'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { postLearning, type LearningModel } from '../services/learning';
import { validateConjugation, type ConjugationResult } from '../lib/learningTools';
import { LatestRequest } from '../utils/latestRequest';

const conjugationCache = new Map<string, ConjugationResult>();

export default function ConjugationPanel({ surface, lemma, context, model }: { surface: string; lemma: string; context: string; model: LearningModel }) {
  const { t, locale, errorText } = useLanguage(); const [result, setResult] = useState<ConjugationResult | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const request = useRef(new LatestRequest());
  useEffect(() => { const manager = request.current; manager.cancel(); setResult(null); setLoading(false); setError(''); return () => manager.cancel(); }, [surface, lemma, context, locale, model.endpoint, model.apiKey]);
  const load = async () => {
    const key = JSON.stringify([surface, lemma, context, locale, model.endpoint, model.apiKey]);
    const cached = conjugationCache.get(key); if (cached) { setResult(cached); return; }
    const ticket = request.current.start(); setLoading(true); setError('');
    try { const value = validateConjugation(await postLearning('/api/conjugation', { surface, dictionaryForm: lemma, context }, ticket.signal, model), surface); if (ticket.isCurrent()) { conjugationCache.set(key, value); if (conjugationCache.size > 40) conjugationCache.delete(conjugationCache.keys().next().value!); setResult(value); } }
    catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  return <details className="detail-disclosure conjugation-tool"><summary>{t('词形变化')}<span className="disclosure-hint">{t('原形 → 句中形式')}</span></summary>
    <p className="tool-note">{t('说明原形如何变成句中形式，以及否定、过去等变化带来的含义。')}</p>
    <p className="conjugation-example">{t('例如：食べる → 食べた（过去）。')}</p>
    <small className="tool-note">{t('AI 生成')}</small>
    {!result && <div className="learning-actions"><button className="nd-ghost-btn" disabled={loading} onClick={load}>{t(loading ? '加载中…' : '查看变化过程')}</button></div>}
    {result && <div>{result.insufficient && <p>{t('信息不足，请选择完整的活用表达。')}</p>}{result.analyses.map((a, i) => <div key={i}><ol className="conjugation-chain">{a.steps.map((s, j) => <li key={j}><span lang="ja">{s.form}</span><small>{s.label}</small></li>)}</ol><p>{a.note}</p></div>)}</div>}
    {error && <p role="alert">{errorText(error)}</p>}
  </details>;
}
