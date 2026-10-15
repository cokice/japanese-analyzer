'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { createSpeechService, SPEECH_PRESETS, SPEECH_VOICES, type SpeechService, type SpeechSettings, type SpeechProtocol } from '../lib/speechServices';
import { getJapaneseTtsAudioUrl } from '../utils/helpers';
import { Icon } from './Icons';

export default function SpeechServices({ settings, onChange }: { settings: SpeechSettings; onChange: (settings: SpeechSettings) => void }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<SpeechService | null>(null);
  const remove = (id: string) => onChange({ services: settings.services.filter((item) => item.id !== id), activeId: settings.activeId === id ? 'edge' : settings.activeId });
  return <section className="settings-group" aria-label={t('语音服务')}>
    <div className="speech-services-heading">
      <div><h4 className="m-0 text-base font-semibold">{t('语音服务')}</h4><p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('独立配置朗读使用的模型、密钥和音色。')}</p></div>
      <button type="button" className="nd-soft-btn" onClick={() => setEditing({ ...createSpeechService(), name: '' })}>{Icon.plus}{t('新增语音服务')}</button>
    </div>
    <div className="preset-icon-wall mt-3" role="group" aria-label={t('语音服务预设')}>
      {SPEECH_PRESETS.filter((preset) => preset.provider !== 'edge').map((preset) => <button type="button" className="preset-icon" key={preset.id} onClick={() => setEditing(createSpeechService(preset.provider))}>{preset.name}</button>)}
    </div>
    <div className="space-y-2">
      {settings.services.map((service) => <div className="speech-service-row" key={service.id}>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
          <input type="radio" name="defaultSpeechService" checked={settings.activeId === service.id} onChange={() => onChange({ ...settings, activeId: service.id })} aria-label={t('使用语音服务：{0}', service.name)} />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{service.name}</span><span className="block truncate text-xs" style={{ color: 'var(--ink-3)' }}>{service.model} · {service.voice}</span></span>
        </label>
        {service.provider === 'edge' ? <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{t('内置')}</span> : <>
          <button type="button" className="nd-ghost-btn" onClick={() => setEditing(service)} aria-label={t('编辑语音服务：{0}', service.name)}>{t('编辑配置')}</button>
          <button type="button" className="nd-ghost-btn provider-danger" onClick={() => remove(service.id)} aria-label={t('删除语音服务：{0}', service.name)}>{t('删除此服务')}</button>
        </>}
      </div>)}
    </div>
    {editing && <SpeechServiceDialog key={editing.id} initial={editing} onClose={() => setEditing(null)} onSave={(service) => {
      const exists = settings.services.some((item) => item.id === service.id);
      onChange({ ...settings, services: exists ? settings.services.map((item) => item.id === service.id ? service : item) : [...settings.services, service] });
      setEditing(null);
    }} />}
  </section>;
}

function SpeechServiceDialog({ initial, onSave, onClose }: { initial: SpeechService; onSave: (service: SpeechService) => void; onClose: () => void }) {
  const { t, errorText } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [audio, setAudio] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const update = (patch: Partial<SpeechService>) => setDraft((value) => ({ ...value, ...patch }));
  useEffect(() => {
    setError(''); setAudio(''); setTesting(false);
    return () => { controller.current?.abort(); };
  }, [draft]);
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio); }, [audio]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  const valid = [draft.baseUrl, draft.model, draft.voice].every((value) => value.trim());
  const preview = async () => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setTesting(true); setError(''); setAudio('');
    try {
      const url = await getJapaneseTtsAudioUrl('こんにちは。日本語の音声テストです。', draft.apiKey.trim(), draft.provider, { baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), voice: draft.voice.trim(), speed: draft.speed, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]) });
      if (request.signal.aborted) URL.revokeObjectURL(url); else setAudio(url);
    } catch (error) {
      if (!request.signal.aborted) setError(error instanceof Error && error.name === 'TimeoutError' ? t('连接测试超时，请检查地址或稍后重试') : errorText(error instanceof Error ? error.message : t('无法连接到服务器，请检查网络')));
    } finally { if (!request.signal.aborted) setTesting(false); }
  };
  return <div className="settings-config-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="settings-config-dialog" role="dialog" aria-modal="true" aria-label={t('语音服务配置')}>
      <button type="button" className="settings-modal-close-button" onClick={onClose} aria-label={t('关闭设置')}>{Icon.x}</button>
      <h3 className="m-0 mb-4 text-lg font-semibold">{t('语音服务配置')}</h3>
      <div className="space-y-3">
        <label className="block text-sm">{t('服务名称')}<input className="nd-input mt-1" value={draft.name} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="block text-sm">{t('接口类型')}<select className="nd-input mt-1" value={draft.provider} onChange={(event) => {
          const provider = event.target.value as SpeechProtocol;
          const preset = SPEECH_PRESETS.find((item) => item.provider === provider)!;
          // A provider's credentials must never be reused for another endpoint.
          update({ provider, baseUrl: preset.baseUrl, model: preset.model, voice: preset.voice, apiKey: '', speed: 1 });
        }}><option value="openai">OpenAI {t('兼容接口')}</option><option value="gemini">Gemini</option><option value="minimax">MiniMax</option></select></label>
        <label className="block text-sm">{t('基础地址（Base URL）')}<input className="nd-input mt-1" value={draft.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} /></label>
        <label className="block text-sm">{t('API 密钥')}<input type="password" className="nd-input mt-1" value={draft.apiKey} onChange={(event) => update({ apiKey: event.target.value })} /></label>
        <label className="block text-sm">{t('模型名称')}<input className="nd-input mt-1" value={draft.model} onChange={(event) => update({ model: event.target.value })} /></label>
        <label className="block text-sm">{t('音色 ID')}<input list="speechVoiceOptions" className="nd-input mt-1" value={draft.voice} onChange={(event) => update({ voice: event.target.value })} /><datalist id="speechVoiceOptions">{SPEECH_VOICES[draft.provider].map((voice) => <option key={voice} value={voice} />)}</datalist></label>
        {draft.provider !== 'gemini' && <label className="block text-sm">{t('语速倍率')}<input type="number" min="0.5" max="2" step="0.1" className="nd-input mt-1" value={draft.speed} onChange={(event) => update({ speed: Number(event.target.value) })} /></label>}
        <p className="m-0 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('测试会合成一小段日语，可能产生少量费用。')}</p>
        <button type="button" className="nd-soft-btn" disabled={!valid || !draft.apiKey.trim() || testing} onClick={preview}>{testing ? t('测试中…') : t('测试并试听')}</button>
        {error && <p role="alert" className="text-xs" style={{ color: 'var(--pos-p)' }}>{error}</p>}
        {audio && <audio controls autoPlay src={audio} className="w-full" aria-label={t('语音测试结果')} />}
      </div>
      <div className="settings-actions"><button type="button" className="nd-ghost-btn" onClick={onClose}>{t('取消')}</button><button type="button" className="nd-primary-btn" disabled={!valid || !Number.isFinite(draft.speed) || draft.speed < 0.5 || draft.speed > 2} onClick={() => onSave({ ...draft, name: draft.name.trim() || draft.model.trim(), baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim(), model: draft.model.trim(), voice: draft.voice.trim() })}>{t('保存')}</button></div>
    </div>
  </div>;
}
