'use client';

import { useEffect, useRef, useState } from 'react';
import { getJapaneseTtsAudioUrl } from '../utils/helpers';
import { useLanguage } from '../contexts/LanguageContext';
import { Icon } from './Icons';

export default function ReadAloud({ text, apiKey }: { text: string; apiKey?: string }) {
  const { t, errorText } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState('stella');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, [text, apiKey]);
  useEffect(() => { setUrl(null); setLoading(false); setError(''); }, [text, apiKey]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const speak = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setUrl(null);
    try {
      const audio = await getJapaneseTtsAudioUrl(text, apiKey, 'deepseek', { voice, signal: controller.signal });
      if (controller.signal.aborted) URL.revokeObjectURL(audio); else setUrl(audio);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause instanceof Error ? cause : t('未知错误')));
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return <div className="mt-ui-2">
    <div className="flex items-center gap-ui-2">
      <button type="button" className="input-tool-button" title={t('朗读回答（DeepSeek）')} aria-label={t('朗读回答（DeepSeek）')}
        onClick={() => loading ? (request.current?.abort(), setLoading(false)) : void speak()}>{loading ? Icon.xSm : Icon.speaker}</button>
      <select aria-label={t('音色')} value={voice} disabled={loading} onChange={event => setVoice(event.target.value)} className="bg-panel text-muted text-ui-sm rounded-ui-sm">
        <option value="stella">{t('海星 · 女声')}</option><option value="tide">{t('暗潮 · 男声')}</option>
      </select>
      {loading && <span role="status" className="text-ui-xs text-muted">{t('正在合成语音…')}</span>}
    </div>
    {error && <p role="alert" className="text-ui-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
    {url && <audio src={url} controls autoPlay className="w-full mt-ui-2" />}
  </div>;
}
