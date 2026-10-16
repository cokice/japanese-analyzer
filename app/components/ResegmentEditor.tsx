'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { postLearning, type LearningModel } from '../services/learning';
import { validateCandidates, type ResegmentResult } from '../lib/learningTools';
import type { TokenData } from '../services/api';
import { LatestRequest } from '../utils/latestRequest';

export default function ResegmentEditor({ tokens, context, model, onApply, onClose }: { tokens: TokenData[]; context: string; model: LearningModel; onApply: (tokens: TokenData[]) => void; onClose: () => void }) {
  const { t, locale, errorText } = useLanguage(); const selection = tokens.map(t => t.word).join(''); const chars = Array.from(selection);
  const [breaks, setBreaks] = useState(() => { let length = 0; return new Set(tokens.slice(0, -1).map(t => length += [...t.word].length)); });
  const [candidates, setCandidates] = useState<ResegmentResult['candidates']>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const request = useRef(new LatestRequest());
  const container = useRef<HTMLElement>(null);
  useEffect(() => { container.current?.focus(); container.current?.scrollIntoView({ block: 'start' }); }, []);
  useEffect(() => { const manager = request.current; manager.cancel(); setLoading(false); setCandidates([]); return () => manager.cancel(); }, [selection, context, locale, model.endpoint, model.apiKey]);
  const segments = () => { const words: string[] = []; let start = 0; for (let i = 1; i <= chars.length; i++) if (i === chars.length || breaks.has(i)) { words.push(chars.slice(start, i).join('')); start = i; } return words; };
  const generate = async (fixed: boolean) => {
    const ticket = request.current.start(); const locked = fixed ? segments() : undefined; setLoading(true); setError(''); setCandidates([]);
    try {
      const result = validateCandidates(await postLearning('/api/resegment', { selection, context, segments: locked }, ticket.signal, model), selection, locked);
      if (ticket.isCurrent()) { setCandidates(result.candidates); if (!result.candidates.length) setError('没有可用的分词候选'); }
    } catch (e) { if (ticket.isCurrent()) setError(e instanceof Error ? e.message : '学习工具请求失败'); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  return <section ref={container} tabIndex={-1} onKeyDown={e => { if (e.key === 'Escape') onClose(); }} className="nd-card resegment-editor" role="region" aria-label={t('调整分词')}>
    <div className="learning-actions"><h3>{t('调整分词')}</h3><button className="nd-ghost-btn" onClick={onClose}>{t('关闭')}</button></div>
    <p>{t('点击字符之间的位置设置边界，再生成预览。')}</p>
    <div className="boundary-editor" lang="ja">{chars.map((char, i) => <span key={i}>{char}{i < chars.length - 1 && <button type="button" aria-label={t('切分边界 {0}', i + 1)} aria-pressed={breaks.has(i + 1)} onClick={() => { request.current.cancel(); setLoading(false); setCandidates([]); setBreaks(old => { const n = new Set(old); if (n.has(i + 1)) n.delete(i + 1); else n.add(i + 1); return n; }); }}>{breaks.has(i + 1) ? '│' : '·'}</button>}</span>)}</div>
    <div className="learning-actions"><button className="nd-soft-btn" disabled={loading} onClick={() => generate(false)}>{t('推荐分词')}</button><button className="nd-soft-btn" disabled={loading} onClick={() => generate(true)}>{t('按指定边界生成')}</button></div>
    {loading && <p role="status">{t('生成预览中…')}</p>}{error && <p role="alert">{errorText(error)}</p>}
    {candidates.map((c, i) => <div className="candidate-preview" key={i}><p lang="ja">{c.tokens.map((token, j) => <span key={j}><strong>{token.word}</strong><small>{token.furigana} · {token.pos}</small></span>)}</p><button className="nd-soft-btn" onClick={() => onApply(c.tokens)}>{t('应用此分词')}</button></div>)}
  </section>;
}
