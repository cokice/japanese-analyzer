'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import { PRESETS, createCustomProfileId, type ProviderProfile } from '../lib/aiModels';
import { Icon } from './Icons';
import { ProviderLogo } from './ProviderLogo';
import { Switch } from '@/components/ui/switch';

interface SettingsPayload {
  profiles: ProviderProfile[];
  activeId: string;
  geminiApiKey: string;
  thinkingEnabled: boolean;
  useStream: boolean;
}

interface SettingsModalProps {
  profiles: ProviderProfile[];
  activeId: string;
  geminiApiKey: string;
  thinkingEnabled: boolean;
  useStream: boolean;
  onSaveSettings: (settings: SettingsPayload) => void;
  isModalOpen: boolean;
  onModalClose: () => void;
}

function capJsonSchema(profile: ProviderProfile): boolean {
  return profile.caps?.jsonSchema !== false;
}

function capThinking(profile: ProviderProfile): boolean {
  return profile.caps?.thinking === true;
}

function emptyProfile(): ProviderProfile {
  return { id: createCustomProfileId(), name: '', baseUrl: '', apiKey: '', model: '', caps: { jsonSchema: true, thinking: false } };
}

export default function SettingsModal({
  profiles: initialProfiles,
  activeId: initialActiveId,
  geminiApiKey,
  thinkingEnabled: initialThinkingEnabled,
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const { t } = useLanguage();
  const [profiles, setProfiles] = useState<ProviderProfile[]>(initialProfiles);
  const [activeId, setActiveId] = useState(initialActiveId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftBaseUrl, setDraftBaseUrl] = useState('');
  const [draftApiKey, setDraftApiKey] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [draftJsonSchema, setDraftJsonSchema] = useState(true);
  const [draftThinking, setDraftThinking] = useState(false);
  const [geminiKey, setGeminiKey] = useState(geminiApiKey);
  const [thinkingEnabled, setThinkingEnabled] = useState(initialThinkingEnabled);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null,
    [profiles, activeId]
  );

  // 打开弹窗时重置本地编辑态
  useEffect(() => {
    if (!isModalOpen) return;
    setProfiles(initialProfiles);
    setActiveId(initialActiveId);
    const first = initialProfiles.find((p) => p.id === initialActiveId) ?? initialProfiles[0] ?? null;
    setEditingId(first?.id ?? null);
    setGeminiKey(geminiApiKey);
    setThinkingEnabled(initialThinkingEnabled);
    setStreamEnabled(useStream);
    setStatus('');
    setError('');
    if (first) {
      setDraftName(first.name);
      setDraftBaseUrl(first.baseUrl);
      setDraftApiKey(first.apiKey);
      setDraftModel(first.model);
      setDraftJsonSchema(capJsonSchema(first));
      setDraftThinking(capThinking(first));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  // 切换编辑对象时同步表单
  useEffect(() => {
    if (!isModalOpen || !editingId) return;
    const target = profiles.find((p) => p.id === editingId);
    if (!target) return;
    setDraftName(target.name);
    setDraftBaseUrl(target.baseUrl);
    setDraftApiKey(target.apiKey);
    setDraftModel(target.model);
    setDraftJsonSchema(capJsonSchema(target));
    setDraftThinking(capThinking(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onModalClose();
  };

  const commitDraft = (id: string, next: ProviderProfile): void => {
    setProfiles((list) => list.map((p) => (p.id === id ? next : p)));
  };

  const handleEditChange = (patch: Partial<ProviderProfile>) => {
    if (!editingId) return;
    const current = profiles.find((p) => p.id === editingId);
    if (!current) return;
    commitDraft(editingId, { ...current, ...patch });
  };

  const addFromPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const profile: ProviderProfile = {
      id: createCustomProfileId(),
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: '',
      model: preset.model,
      caps: preset.caps ? { ...preset.caps } : { jsonSchema: true, thinking: false },
    };
    setProfiles((list) => [...list, profile]);
    setEditingId(profile.id);
    setDraftName(profile.name);
    setDraftBaseUrl(profile.baseUrl);
    setDraftApiKey(profile.apiKey);
    setDraftModel(profile.model);
    setDraftJsonSchema(capJsonSchema(profile));
    setDraftThinking(capThinking(profile));
    setError('');
  };

  const addBlank = () => {
    const profile = emptyProfile();
    setProfiles((list) => [...list, profile]);
    setEditingId(profile.id);
    setDraftName('');
    setDraftBaseUrl('');
    setDraftApiKey('');
    setDraftModel('');
    setDraftJsonSchema(true);
    setDraftThinking(false);
    setError('');
  };

  const removeEditing = () => {
    if (!editingId) return;
    const remaining = profiles.filter((p) => p.id !== editingId);
    setProfiles(remaining);
    if (activeId === editingId) {
      setActiveId(remaining[0]?.id ?? '');
    }
    setEditingId(remaining[0]?.id ?? null);
    if (remaining[0]) {
      setDraftName(remaining[0].name);
      setDraftBaseUrl(remaining[0].baseUrl);
      setDraftApiKey(remaining[0].apiKey);
      setDraftModel(remaining[0].model);
      setDraftJsonSchema(capJsonSchema(remaining[0]));
      setDraftThinking(capThinking(remaining[0]));
    } else {
      setDraftName('');
      setDraftBaseUrl('');
      setDraftApiKey('');
      setDraftModel('');
    }
    setError('');
  };

  const handleSaveSettings = () => {
    if (editingId) {
      const current = profiles.find((p) => p.id === editingId);
      if (current) {
        commitDraft(editingId, {
          ...current,
          name: draftName.trim(),
          baseUrl: draftBaseUrl.trim(),
          apiKey: draftApiKey.trim(),
          model: draftModel.trim(),
          caps: { jsonSchema: draftJsonSchema, thinking: draftThinking },
        });
      }
    }

    // 去掉没有 baseUrl / model 的无效配置
    const valid = profiles.filter((p) => p.baseUrl.trim() && p.model.trim());
    let nextActive = activeId;
    if (!valid.some((p) => p.id === nextActive)) {
      nextActive = valid[0]?.id ?? '';
    }

    onSaveSettings({
      profiles: valid,
      activeId: nextActive,
      geminiApiKey: geminiKey.trim(),
      thinkingEnabled,
      useStream: streamEnabled,
    });

    setStatus(t('设置已保存'));
    setTimeout(() => onModalClose(), 900);
  };

  const isThinkingAvailable = !!activeProfile?.caps?.thinking;

  return (
    <div
      id="settingsModal"
      className="settings-modal"
      style={{ display: isModalOpen ? 'flex' : 'none' }}
      onClick={handleOutsideClick}
    >
      <div className="settings-modal-content">
        <button
          id="closeSettingsModal"
          type="button"
          className="settings-modal-close-button"
          onClick={onModalClose}
          aria-label={t('关闭设置')}
        >
          {Icon.x}
        </button>

        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{t('模型与 API')}</h3>
          </div>
          <p className="m-0 text-sm leading-6" style={{ color: 'var(--ink-3)' }}>
            {t('配置自己的模型服务（兼容 OpenAI）与 API 密钥。')}
          </p>
        </div>

        <div className="settings-group" role="group" aria-label={t('模型配置')}>
          <p className="settings-group-label">{t('模型服务')}</p>

          {profiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {profiles.map((profile) => {
                const isActive = profile.id === activeProfile?.id;
                const isEditing = profile.id === editingId;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors"
                    style={{
                      borderColor: isEditing ? 'var(--primary)' : 'var(--line)',
                      background: isEditing ? 'var(--bg-2)' : 'transparent',
                      color: isEditing ? 'var(--ink)' : 'var(--ink-3)',
                    }}
                    onClick={() => setEditingId(profile.id)}
                  >
                    <ProviderLogo profile={profile} className="h-4 w-4" />
                    <span>{profile.name || profile.id}</span>
                    {isActive && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                      >
                        {t('当前')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" className="nd-ghost-btn" onClick={addBlank}>
              {Icon.plus}<span>{t('新增服务')}</span>
            </button>
            <select
              className="nd-input"
              style={{ width: 'auto', minHeight: 38 }}
              value=""
              onChange={(e) => { if (e.target.value) addFromPreset(e.target.value); e.target.value = ''; }}
            >
              <option value="" disabled>{t('从预设创建…')}</option>
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>

          {editingId ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="profileNameInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  {t('服务名称')}
                </label>
                <input
                  id="profileNameInput"
                  className="nd-input"
                  value={draftName}
                  onChange={(e) => { setDraftName(e.target.value); handleEditChange({ name: e.target.value }); }}
                />
              </div>
              <div>
                <label htmlFor="profileBaseUrlInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  {t('基础地址（Base URL）')}
                </label>
                <input
                  id="profileBaseUrlInput"
                  className="nd-input"
                  placeholder="https://api.deepseek.com"
                  value={draftBaseUrl}
                  onChange={(e) => { setDraftBaseUrl(e.target.value); handleEditChange({ baseUrl: e.target.value }); }}
                />
              </div>
              <div>
                <label htmlFor="profileApiKeyInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  {t('API 密钥')}
                </label>
                <input
                  id="profileApiKeyInput"
                  type="password"
                  className="nd-input"
                  value={draftApiKey}
                  onChange={(e) => { setDraftApiKey(e.target.value); handleEditChange({ apiKey: e.target.value }); }}
                />
              </div>
              <div>
                <label htmlFor="profileModelInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  {t('模型名称')}
                </label>
                <input
                  id="profileModelInput"
                  className="nd-input"
                  placeholder="deepseek-chat"
                  value={draftModel}
                  onChange={(e) => { setDraftModel(e.target.value); handleEditChange({ model: e.target.value }); }}
                />
              </div>
              <div className="settings-option-row">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('使用严格结构化输出（json_schema）')}</label>
                    <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('部分网关只接受 json_object，可关闭此项。')}</p>
                  </div>
                  <Switch
                    aria-label={t('使用严格结构化输出（json_schema）')}
                    checked={draftJsonSchema}
                    onCheckedChange={(v) => { setDraftJsonSchema(v); handleEditChange({ caps: { jsonSchema: v, thinking: draftThinking } }); }}
                  />
                </div>
              </div>
              <div className="settings-option-row">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('支持思考 / 推理参数')}</label>
                    <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('开启后该服务可启用「深度思考」。')}</p>
                  </div>
                  <Switch
                    aria-label={t('支持思考 / 推理参数')}
                    checked={draftThinking}
                    onCheckedChange={(v) => { setDraftThinking(v); handleEditChange({ caps: { ...activeProfile?.caps, thinking: v } }); }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {activeProfile?.id !== editingId && (
                  <button type="button" className="nd-ghost-btn" onClick={() => setActiveId(editingId)}>
                    {t('设为当前')}
                  </button>
                )}
                <button type="button" className="nd-ghost-btn" onClick={removeEditing} style={{ color: 'var(--pos-p)' }}>
                  {t('删除此服务')}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-[10px] p-4 text-sm" style={{ background: 'var(--bg)', border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
              {t('还没有模型服务，点「新增服务」或从预设创建。')}
            </div>
          )}
        </div>

        <div className="settings-group" role="group" aria-label={t('输出方式')}>
          <p className="settings-group-label">{t('输出方式')}</p>
          <div className="settings-option-row">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="useStreamToggle" className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {t('流式输出')}
                </label>
                <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
                  {t('实时显示解析结果，网络不稳定时可关闭。')}
                </p>
              </div>
              <Switch
                id="useStreamToggle"
                aria-label={t('流式输出')}
                checked={streamEnabled}
                onCheckedChange={setStreamEnabled}
              />
            </div>
          </div>

          {isThinkingAvailable ? (
            <div className="settings-option-row">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('深度思考')}</label>
                  <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('解析前先让模型展开推理。')}</p>
                </div>
                <Switch aria-label={t('深度思考')} checked={thinkingEnabled} onCheckedChange={setThinkingEnabled} />
              </div>
            </div>
          ) : (
            <div className="settings-unavailable-row">
              <span>{t('深度思考')}</span><span>{t('暂不可用')}</span>
            </div>
          )}
        </div>

        <div className="settings-group" role="group" aria-label={t('语音')}>
          <p className="settings-group-label">{t('语音')}</p>
          <div>
            <label htmlFor="geminiTtsKeyInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('Gemini TTS API 密钥（可选）')}
            </label>
            <input
              id="geminiTtsKeyInput"
              type="password"
              className="nd-input"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-actions">
          <button
            id="saveSettingsButton"
            className="nd-primary-btn"
            onClick={handleSaveSettings}
            type="button"
          >
            <span>{t('保存设置')}</span>
          </button>
        </div>

        {error && (
          <div className="mt-3 text-center text-sm" style={{ color: 'var(--pos-p)' }}>
            {t(error)}
          </div>
        )}

        {status && (
          <div id="settingsStatus" className="mt-3 text-center text-sm" style={{ color: 'var(--primary)' }}>
            {t(status)}
          </div>
        )}

        <p className="mb-0 mt-4 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
          {t('密钥保存在此浏览器中，随请求发送用于调用模型。')}
        </p>
      </div>
    </div>
  );
}
