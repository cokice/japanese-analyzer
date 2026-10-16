'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { queryDictionary } from '../services/learning';
import { type DictionarySettings as Settings } from '../lib/dictionary';
import { LatestRequest } from '../utils/latestRequest';

export default function DictionarySettings({ value, onChange }: { value: Settings; onChange: (s: Settings) => void }) {
  const { t, errorText } = useLanguage();
  const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [key, setKey] = useState('');
  const [status, setStatus] = useState(''); const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState(''); const request = useRef(new LatestRequest());
  useEffect(() => { request.current.cancel(); setLoading(false); setStatus(''); }, [url, key]);
  useEffect(() => { const manager = request.current; const controller = new AbortController(); void queryDictionary({ query: '駅' }, value.providers[0], controller.signal).then(r => setMetadata(`${r.source.name} · ${r.source.date} · ${r.source.version}`)).catch(() => setMetadata(t('词典数据不可用，请重新准备词典数据'))); return () => { controller.abort(); manager.cancel(); }; }, [value.providers, t]);
  const validUrl = () => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) && !u.username && !u.password && !u.search && !u.hash; } catch { return false; } };
  const test = async () => {
    const ticket = request.current.start(); setLoading(true); setStatus('');
    try { await queryDictionary({ query: '駅' }, { id: 'test', name, adapter: 'http-v1', lookupUrl: url, apiKey: key }, ticket.signal, true); if (ticket.isCurrent()) setStatus(t('连接成功')); }
    catch (e) { if (ticket.isCurrent()) setStatus(errorText(e instanceof Error ? e.message : '外部词典连接失败')); }
    finally { if (ticket.isCurrent()) setLoading(false); }
  };
  return <section className="dictionary-settings">
    <h3>{t('词典服务')}</h3><p className="tool-note">{metadata}</p>
    <p className="tool-note">{t('内置词典随应用更新，运行时不下载数据。')}</p>
    <select className="learning-input" aria-label={t('词典服务')} value={value.activeId} onChange={e => onChange({ ...value, activeId: e.target.value })}>{value.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    {value.providers.filter(p => p.adapter !== 'builtin').map(p => <div className="learning-actions" key={p.id}><span>{p.name}</span><button type="button" className="nd-ghost-btn" onClick={() => onChange({ providers: value.providers.filter(x => x.id !== p.id), activeId: value.activeId === p.id ? 'builtin' : value.activeId })}>{t('删除')}</button></div>)}
    <details><summary>{t('添加 HTTP 词典')}</summary><div className="learning-fields">
      <label>{t('名称')}<input className="learning-input" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>{t('查询 URL')}<input className="learning-input" type="url" value={url} onChange={e => setUrl(e.target.value)} /></label>
      <label>{t('词典 API Key（可选）')}<input className="learning-input" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label>
      <p className="tool-note">{t('使用 HTTP v1 协议；不同厂商需要对应适配器。')}</p>
      <div className="learning-actions"><button type="button" className="nd-ghost-btn" disabled={!validUrl() || loading} onClick={test}>{t(loading ? '测试中…' : '测试连接')}</button><button type="button" className="nd-soft-btn" disabled={!name.trim() || !validUrl()} onClick={() => { const id = `dictionary-${Date.now()}`; onChange({ providers: [...value.providers, { id, name: name.trim(), adapter: 'http-v1', lookupUrl: url.trim(), apiKey: key }], activeId: id }); setName(''); setUrl(''); setKey(''); setStatus(''); }}>{t('添加')}</button></div>
      {status && <p role="status">{status}</p>}
    </div></details>
    <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">JMdict / EDRDG · CC BY-SA 4.0</a>
  </section>;
}
