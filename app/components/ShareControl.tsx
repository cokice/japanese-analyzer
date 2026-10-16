'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { browserStorage } from '../utils/storage';
import { isLocalShareAddress, makeShareLink, SHARE_BASE_KEY, type ReadingPreferences } from '../utils/readingPreferences';

export default function ShareControl({ text, preferences }: { text: string; preferences: ReadingPreferences }) {
  const { t, errorText } = useLanguage(); const [open, setOpen] = useState(false); const [base, setBase] = useState(''); const [needsBase, setNeedsBase] = useState(false);
  const [copyValue, setCopyValue] = useState(''); const [status, setStatus] = useState('');
  useEffect(() => { const local = isLocalShareAddress(window.location.href); setNeedsBase(local); setBase(local ? browserStorage.getItem(SHARE_BASE_KEY) || '' : window.location.origin + window.location.pathname); }, []);
  const copy = async (value: string) => { setCopyValue(value); try { await navigator.clipboard.writeText(value); setStatus(t('已复制')); } catch { setStatus(t('请手动复制')); } };
  const share = () => { try { const link = makeShareLink(base, text, preferences); if (needsBase) browserStorage.setItem(SHARE_BASE_KEY, base); void copy(link); } catch (e) { setStatus(errorText(e instanceof Error ? e.message : '分享失败')); setCopyValue(''); } };
  return <div className="share-control" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}><button className="nd-ghost-btn" disabled={!text.trim()} aria-expanded={open} onClick={() => { setOpen(!open); setStatus(''); setCopyValue(''); }}>{t('分享原文')}</button>
    {open && <div className="nd-card learning-fields">{needsBase && <label>{t('公开分享地址')}<input className="learning-input" type="url" value={base} onChange={e => setBase(e.target.value)} placeholder="https://example.com/" /></label>}
      <p className="tool-note">{t('链接仅包含原文和显示选项，打开后需手动解析。')}</p>
      <div className="learning-actions"><button className="nd-soft-btn" onClick={share}>{t('复制链接')}</button><button className="nd-ghost-btn" onClick={() => void copy(text)}>{t('复制原文')}</button></div>
      {status && <p role="status">{status}</p>}{copyValue && <textarea className="learning-input" aria-label={t('复制内容')} readOnly value={copyValue} onFocus={e => e.target.select()} />}
    </div>}
  </div>;
}
