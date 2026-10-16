'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { postLearning, type LearningModel } from '../services/learning';
import { validateConjugation, type ConjugationResult } from '../lib/learningTools';
import { LatestRequest } from '../utils/latestRequest';

export default function ConjugationPanel({ surface, lemma, context, model }: { surface: string; lemma: string; context: string; model: LearningModel }) {
  const { t, locale, errorText } = useLanguage(); const [result, setResult] = useState<ConjugationResult | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const request = useRef(new LatestRequest()); const cache = useRef(new Map<string, ConjugationResult>());
  useEffect(() => { const manager = request.current; manager.cancel(); setResult(null); setLoading(false); setError(''); return () => manager.cancel(); }, [surface, lemma, context, locale, model.endpoint, model.apiKey]);
  const load = async () => {
    const key = JSON.stringify([surface, lemma, context, locale, model.endpoint, model.apiKey]);
    const cached = cache.current.get(key); if (cached) { setResult(cached); return; }
    const ticket = request.current.start(); setLoading(true); setError('');
    try { const value = validateConjugation(await postLearning('/api/conjugation', { surface, dictionaryForm: lemma, context }, ticket.signal, model), surface); if (ticket.isCurrent()) { cache.current.set(key, value); if (cache.current.size > 40) cache.current.delete(cache.current.keys().next().value!); setResult(value); } }
    catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  return <section className="learning-detail"><button className="nd-ghost-btn" disabled={loading} onClick={load}>{t(loading ? '加载中…' : '展开活用过程')}</button>
    {result && <div><small>{t('AI 生成')}</small>{result.insufficient && <p>{t('信息不足，请选择完整的活用表达。')}</p>}{result.analyses.map((a, i) => <div key={i}><ol className="conjugation-chain">{a.steps.map((s, j) => <li key={j}><span lang="ja">{s.form}</span><small>{s.label}</small></li>)}</ol><p>{a.note}</p></div>)}</div>}
    {error && <p role="alert">{errorText(error)}</p>}
  </section>;
}
