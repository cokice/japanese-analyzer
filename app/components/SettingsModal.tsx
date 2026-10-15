'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { useEffect, useMemo, useState } from 'react';
import {
  PRESETS,
  createCustomModelId,
  createCustomProfileId,
  type ModelCaps,
  type ProviderProfile,
} from '../lib/aiModels';
import { Icon } from './Icons';
import { ProviderLogo } from './ProviderLogo';
import { Switch } from '@/components/ui/switch';

interface SettingsPayload {
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  geminiApiKey: string;
  thinkingEnabled: boolean;
  useStream: boolean;
}

interface SettingsModalProps {
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  geminiApiKey: string;
  thinkingEnabled: boolean;
  useStream: boolean;
  onSaveSettings: (settings: SettingsPayload) => void;
  isModalOpen: boolean;
  onModalClose: () => void;
}

type TestState = 'idle' | 'loading' | 'ok' | 'error';

function emptyService(): ProviderProfile {
  return {
    id: createCustomProfileId(),
    name: '',
    baseUrl: '',
    apiKey: '',
    jsonSchema: true,
    models: [{ id: createCustomModelId(), name: '', model: '' }],
  };
}

function fromPreset(presetId: string): ProviderProfile | null {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return {
    id: createCustomProfileId(),
    name: preset.name,
    baseUrl: preset.baseUrl,
    apiKey: '',
    jsonSchema: true,
    models: preset.models.map((m) => ({ ...m, id: createCustomModelId(), caps: m.caps ? { ...m.caps } : undefined })),
  };
}

export default function SettingsModal({
  services: initialServices,
  activeServiceId: initialActiveServiceId,
  activeModelId: initialActiveModelId,
  geminiApiKey,
  thinkingEnabled: initialThinkingEnabled,
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const { t, errorText } = useLanguage();
  const [services, setServices] = useState<ProviderProfile[]>(initialServices);
  const [activeServiceId, setActiveServiceId] = useState(initialActiveServiceId);
  const [activeModelId, setActiveModelId] = useState(initialActiveModelId);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState(geminiApiKey);
  const [thinkingEnabled, setThinkingEnabled] = useState(initialThinkingEnabled);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [testResults, setTestResults] = useState<Record<string, { state: TestState; message: string }>>({});

  const activeService = useMemo(
    () => services.find((s) => s.id === activeServiceId) ?? services[0] ?? null,
    [services, activeServiceId]
  );
  const activeModel = useMemo(
    () => activeService?.models.find((m) => m.id === activeModelId) ?? activeService?.models[0] ?? null,
    [activeService, activeModelId]
  );

  // 打开弹窗时重置本地编辑态：默认展开当前服务商
  useEffect(() => {
    if (!isModalOpen) return;
    setServices(initialServices);
    setActiveServiceId(initialActiveServiceId);
    setActiveModelId(initialActiveModelId);
    const first = initialServices.find((s) => s.id === initialActiveServiceId) ?? initialServices[0] ?? null;
    setExpandedServiceId(first?.id ?? null);
    setExpandedModelId(null);
    setGeminiKey(geminiApiKey);
    setThinkingEnabled(initialThinkingEnabled);
    setStreamEnabled(useStream);
    setStatus('');
    setError('');
    setTestResults({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onModalClose();
  };

  const updateService = (id: string, patch: Partial<ProviderProfile>) => {
    setServices((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateModel = (serviceId: string, modelId: string, patch: Partial<ProviderProfile['models'][number]>) => {
    setServices((list) => list.map((s) => s.id === serviceId
      ? { ...s, models: s.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m)) }
      : s));
  };

  const updateModelCaps = (serviceId: string, modelId: string, caps: ModelCaps) => {
    updateModel(serviceId, modelId, { caps });
  };

  const removeService = (id: string) => {
    const remaining = services.filter((s) => s.id !== id);
    setServices(remaining);
    if (activeServiceId === id) {
      const next = remaining[0] ?? null;
      setActiveServiceId(next?.id ?? '');
      setActiveModelId(next?.models[0]?.id ?? '');
    }
    if (expandedServiceId === id) {
      setExpandedServiceId(remaining[0]?.id ?? null);
      setExpandedModelId(null);
    }
    setError('');
  };

  const addService = (service: ProviderProfile) => {
    setServices((list) => [...list, service]);
    setExpandedServiceId(service.id);
    setExpandedModelId(null);
    setError('');
  };

  const removeModel = (serviceId: string, modelId: string) => {
    const target = services.find((s) => s.id === serviceId);
    if (!target) return;
    const remaining = target.models.filter((m) => m.id !== modelId);
    updateService(serviceId, { models: remaining });
    if (activeServiceId === serviceId && activeModelId === modelId) {
      setActiveModelId(remaining[0]?.id ?? '');
    }
    if (expandedModelId === modelId) setExpandedModelId(null);
    setError('');
  };

  const addModel = (serviceId: string) => {
    const target = services.find((s) => s.id === serviceId);
    if (!target) return;
    const model = { id: createCustomModelId(), name: '', model: '' };
    updateService(serviceId, { models: [...target.models, model] });
    setExpandedModelId(model.id);
    setError('');
  };

  const setModelActive = (serviceId: string, modelId: string) => {
    setActiveServiceId(serviceId);
    setActiveModelId(modelId);
    setError('');
  };

  const handleTestConnection = async (service: ProviderProfile) => {
    if (!service.baseUrl.trim() || !service.models.some((m) => m.model.trim())) {
      setTestResults((map) => ({ ...map, [service.id]: { state: 'error', message: t('请先填写基础地址和至少一个模型') } }));
      return;
    }
    setTestResults((map) => ({ ...map, [service.id]: { state: 'loading', message: '' } }));
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${service.apiKey.trim()}`,
        },
        body: JSON.stringify({
          prompt: 'ping',
          stream: false,
          baseUrl: service.baseUrl,
          model: service.models.find((m) => m.model.trim())?.model,
          caps: { jsonSchema: service.jsonSchema !== false },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setTestResults((map) => ({ ...map, [service.id]: { state: 'ok', message: t('连接成功') } }));
      } else {
        const raw = typeof data?.error?.message === 'string' ? data.error.message : `HTTP ${response.status}`;
        setTestResults((map) => ({ ...map, [service.id]: { state: 'error', message: errorText(raw) } }));
      }
    } catch {
      setTestResults((map) => ({ ...map, [service.id]: { state: 'error', message: t('无法连接到服务器，请检查网络') } }));
    }
  };

  const handleSaveSettings = () => {
    // 去掉没有 baseUrl / 没有有效模型的无效配置
    const valid = services
      .map((s) => ({ ...s, models: s.models.filter((m) => m.model.trim()) }))
      .filter((s) => s.baseUrl.trim() && s.models.length > 0);
    let nextServiceId = activeServiceId;
    let nextModelId = activeModelId;
    if (!valid.some((s) => s.id === nextServiceId)) {
      const first = valid[0];
      nextServiceId = first?.id ?? '';
      nextModelId = first?.models[0]?.id ?? '';
    } else if (!valid.find((s) => s.id === nextServiceId)?.models.some((m) => m.id === nextModelId)) {
      nextModelId = valid.find((s) => s.id === nextServiceId)?.models[0]?.id ?? '';
    }

    onSaveSettings({
      services: valid,
      activeServiceId: nextServiceId,
      activeModelId: nextModelId,
      geminiApiKey: geminiKey.trim(),
      thinkingEnabled,
      useStream: streamEnabled,
    });

    setStatus(t('设置已保存'));
    setTimeout(() => onModalClose(), 900);
  };

  const isThinkingAvailable = !!activeModel?.caps?.thinking;

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

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button type="button" className="nd-ghost-btn" onClick={() => addService(emptyService())}>
              {Icon.plus}<span>{t('新增服务商')}</span>
            </button>
            <select
              className="nd-input"
              style={{ width: 'auto', minHeight: 38 }}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const service = fromPreset(e.target.value);
                if (service) addService(service);
                e.target.value = '';
              }}
            >
              <option value="" disabled>{t('从预设创建…')}</option>
              {PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </div>

          {services.length === 0 ? (
            <div className="rounded-[10px] p-4 text-sm" style={{ background: 'var(--bg)', border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
              {t('还没有模型服务，点「新增服务商」或从预设创建。')}
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((service) => {
                const isExpanded = expandedServiceId === service.id;
                const isCurrent = service.id === activeService?.id;
                const serviceModelCount = service.models.length;
                return (
                  <div
                    key={service.id}
                    className="service-card"
                    style={{
                      border: `1px solid ${isExpanded ? 'var(--primary)' : 'var(--line)'}`,
                      background: isExpanded ? 'var(--bg-2)' : 'var(--bg)',
                    }}
                  >
                    <div className="flex w-full items-center gap-2 rounded-[10px]" onClick={() => setExpandedServiceId(isExpanded ? null : service.id)}>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
                        aria-expanded={isExpanded}
                      >
                        <ProviderLogo profile={service} className="h-4 w-4" />
                        <span className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {service.name || service.id}
                        </span>
                        {service.baseUrl && (
                          <span className="hidden truncate text-xs sm:inline" style={{ color: 'var(--ink-3)' }}>{service.baseUrl}</span>
                        )}
                        {isCurrent && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                          >
                            {t('当前')}
                          </span>
                        )}
                      </button>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--ink-3)' }}>{t('{0} 个模型', serviceModelCount)}</span>
                      <button
                        type="button"
                        className="nd-ghost-btn shrink-0"
                        style={{ color: 'var(--pos-p)' }}
                        onClick={(e) => { e.stopPropagation(); removeService(service.id); }}
                      >
                        {t('删除此服务')}
                      </button>
                      <span
                        className="shrink-0 text-xs"
                        style={{ color: 'var(--ink-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="space-y-3 pt-3">
                        <div>
                          <label htmlFor="profileNameInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                            {t('服务名称')}
                          </label>
                          <input
                            id="profileNameInput"
                            className="nd-input"
                            value={service.name}
                            onChange={(e) => updateService(service.id, { name: e.target.value })}
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
                            value={service.baseUrl}
                            onChange={(e) => updateService(service.id, { baseUrl: e.target.value })}
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
                            value={service.apiKey}
                            onChange={(e) => updateService(service.id, { apiKey: e.target.value })}
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
                              checked={service.jsonSchema !== false}
                              onCheckedChange={(v) => updateService(service.id, { jsonSchema: v })}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="nd-ghost-btn"
                            disabled={testResults[service.id]?.state === 'loading'}
                            onClick={(e) => { e.stopPropagation(); handleTestConnection(service); }}
                          >
                            {testResults[service.id]?.state === 'loading' ? t('测试中…') : t('测试连接')}
                          </button>
                          {testResults[service.id]?.state === 'ok' && (
                            <span className="text-xs" style={{ color: 'var(--primary)' }}>{testResults[service.id].message}</span>
                          )}
                          {testResults[service.id]?.state === 'error' && (
                            <span className="text-xs" style={{ color: 'var(--pos-p)' }}>{testResults[service.id].message}</span>
                          )}
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('模型')}</label>
                            <button type="button" className="nd-ghost-btn" onClick={() => addModel(service.id)}>
                              {Icon.plus}<span>{t('新增模型')}</span>
                            </button>
                          </div>
                          {service.models.length === 0 ? (
                            <div className="rounded-[10px] p-3 text-sm" style={{ background: 'var(--bg)', border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
                              {t('还没有模型，点「新增模型」添加。')}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {service.models.map((model) => {
                                const modelIsExpanded = expandedModelId === model.id;
                                const modelIsCurrent = service.id === activeService?.id && model.id === activeModel?.id;
                                return (
                                  <div
                                    key={model.id}
                                    className="model-row"
                                    style={{
                                      border: `1px solid ${modelIsExpanded ? 'var(--primary)' : 'var(--line)'}`,
                                      background: 'var(--bg)',
                                    }}
                                  >
                                    <div className="flex w-full items-center gap-2" onClick={() => setExpandedModelId(modelIsExpanded ? null : model.id)}>
                                      <button
                                        type="button"
                                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
                                        aria-expanded={modelIsExpanded}
                                      >
                                        <span className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                                          {model.name || model.model || t('未命名模型')}
                                        </span>
                                        {modelIsCurrent && (
                                          <span
                                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                                          >
                                            {t('当前')}
                                          </span>
                                        )}
                                      </button>
                                      {!modelIsCurrent && (
                                        <button
                                          type="button"
                                          className="nd-ghost-btn shrink-0"
                                          onClick={(e) => { e.stopPropagation(); setModelActive(service.id, model.id); }}
                                        >
                                          {t('设为当前')}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="nd-ghost-btn shrink-0"
                                        style={{ color: 'var(--pos-p)' }}
                                        onClick={(e) => { e.stopPropagation(); removeModel(service.id, model.id); }}
                                      >
                                        {t('删除此模型')}
                                      </button>
                                      <span
                                        className="shrink-0 text-xs"
                                        style={{ color: 'var(--ink-3)', transform: modelIsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
                                        aria-hidden="true"
                                      >
                                        ▼
                                      </span>
                                    </div>

                                    {modelIsExpanded && (
                                      <div className="space-y-3 pt-3">
                                        <div>
                                          <label htmlFor={`model-name-${model.id}`} className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                                            {t('模型名称')}
                                          </label>
                                          <input
                                            id={`model-name-${model.id}`}
                                            className="nd-input"
                                            placeholder="deepseek-chat"
                                            value={model.model}
                                            onChange={(e) => updateModel(service.id, model.id, {
                                              model: e.target.value,
                                              name: e.target.value,
                                            })}
                                          />
                                        </div>
                                        <div className="settings-option-row">
                                          <div className="flex items-center justify-between gap-4">
                                            <div>
                                              <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('支持思考 / 推理参数')}</label>
                                              <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('开启后该模型可启用「深度思考」。')}</p>
                                            </div>
                                            <Switch
                                              aria-label={t('支持思考 / 推理参数')}
                                              checked={model.caps?.thinking === true}
                                              onCheckedChange={(v) => updateModelCaps(service.id, model.id, {
                                                ...model.caps,
                                                thinking: v,
                                              })}
                                            />
                                          </div>
                                        </div>
                                        {model.caps?.thinking === true && (
                                          <div>
                                            <label htmlFor={`model-effort-${model.id}`} className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                                              {t('思考强度（reasoning_effort，可选）')}
                                            </label>
                                            <input
                                              id={`model-effort-${model.id}`}
                                              className="nd-input"
                                              placeholder={t('如 xhigh / medium / low；留空用服务商默认')}
                                              value={model.caps?.reasoningEffort ?? ''}
                                              onChange={(e) => updateModelCaps(service.id, model.id, {
                                                ...model.caps,
                                                reasoningEffort: e.target.value,
                                              })}
                                            />
                                            <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('不同服务商接受的值不同，请按该服务商文档填写。')}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
