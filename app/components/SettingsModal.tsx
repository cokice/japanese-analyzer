'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PRESETS,
  createCustomModelId,
  createCustomProfileId,
  resolveModelSelection,
  sanitizeProfiles,
  type ModelConfig,
  type ProviderProfile,
} from '../lib/aiModels';
import ModelConfigDialog from './ModelConfigDialog';
import ProviderConfigDialog from './ProviderConfigDialog';
import { Icon } from './Icons';
import { ProviderLogo } from './ProviderLogo';
import { Switch } from '@/components/ui/switch';
import SpeechServices from './SpeechServices';
import { sanitizeSpeechSettings, type SpeechSettings } from '../lib/speechServices';

interface SettingsPayload {
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  geminiApiKey: string;
  speechSettings: SpeechSettings;
  thinkingEnabled: boolean;
  useStream: boolean;
}

interface SettingsModalProps {
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  geminiApiKey: string;
  speechSettings: SpeechSettings;
  thinkingEnabled: boolean;
  useStream: boolean;
  onSaveSettings: (settings: SettingsPayload) => void;
  isModalOpen: boolean;
  onModalClose: () => void;
}

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
    jsonSchema: preset.jsonSchema !== false,
    models: preset.models.map((m) => ({ ...m, id: createCustomModelId(), caps: m.caps ? { ...m.caps } : undefined })),
  };
}

export default function SettingsModal({
  services: initialServices,
  activeServiceId: initialActiveServiceId,
  activeModelId: initialActiveModelId,
  geminiApiKey,
  speechSettings: initialSpeechSettings,
  thinkingEnabled: initialThinkingEnabled,
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const { t } = useLanguage();
  const [services, setServices] = useState<ProviderProfile[]>(initialServices);
  const [activeServiceId, setActiveServiceId] = useState(initialActiveServiceId);
  const [activeModelId, setActiveModelId] = useState(initialActiveModelId);
  const [collapsedServiceIds, setCollapsedServiceIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [speechSettings, setSpeechSettings] = useState(initialSpeechSettings);
  const [thinkingEnabled, setThinkingEnabled] = useState(initialThinkingEnabled);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [defaultMenuOpen, setDefaultMenuOpen] = useState(false);
  const [editingService, setEditingService] = useState<ProviderProfile | null>(null);
  const [editingServiceMode, setEditingServiceMode] = useState<'create' | 'edit'>('edit');
  const [editingModel, setEditingModel] = useState<{ serviceId: string; model: ModelConfig; isNew: boolean } | null>(null);
  const [menuServiceId, setMenuServiceId] = useState<string | null>(null);
  const defaultMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  const { service: activeService, model: activeModel } = useMemo(
    () => resolveModelSelection(services, activeServiceId, activeModelId),
    [services, activeServiceId, activeModelId]
  );
  const editingModelItem = useMemo(() => {
    if (!editingModel) return null;
    const service = services.find((s) => s.id === editingModel.serviceId);
    const model = editingModel.model;
    return service && model ? { service, model } : null;
  }, [services, editingModel]);

  // 打开弹窗时重置本地编辑态：默认展开当前服务商
  useEffect(() => {
    if (!isModalOpen) return;
    setServices(initialServices);
    setActiveServiceId(initialActiveServiceId);
    setActiveModelId(initialActiveModelId);
    const first = initialServices.find((s) => s.id === initialActiveServiceId) ?? initialServices[0] ?? null;
    setCollapsedServiceIds(initialServices.filter((s) => first && s.id !== first.id).map((s) => s.id));
    setSearchQuery('');
    setSpeechSettings(initialSpeechSettings);
    setThinkingEnabled(initialThinkingEnabled);
    setStreamEnabled(useStream);
    setStatus('');
    setError('');
    setDefaultMenuOpen(false);
    setEditingService(null);
    setEditingModel(null);
    setMenuServiceId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  // 点击外部 / Esc 关闭默认模型菜单与行内菜单
  useEffect(() => {
    if (!defaultMenuOpen && !menuServiceId) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (defaultMenuRef.current && !defaultMenuRef.current.contains(e.target as Node)) setDefaultMenuOpen(false);
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) setMenuServiceId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDefaultMenuOpen(false);
        setMenuServiceId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [defaultMenuOpen, menuServiceId]);

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onModalClose();
  };

  const updateService = (id: string, patch: Partial<ProviderProfile>) => {
    setServices((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const updateModel = (serviceId: string, modelId: string, patch: Partial<ModelConfig>) => {
    setServices((list) => list.map((s) => s.id === serviceId
      ? { ...s, models: s.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m)) }
      : s));
  };

  const removeService = (id: string) => {
    const remaining = services.filter((s) => s.id !== id);
    setServices(remaining);
    if (activeServiceId === id) {
      const next = remaining[0] ?? null;
      setActiveServiceId(next?.id ?? '');
      setActiveModelId(next?.models[0]?.id ?? '');
    }
    setError('');
  };

  const addService = (service: ProviderProfile, mode: 'create' | 'edit') => {
    setEditingService(service);
    setEditingServiceMode(mode);
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
    setMenuServiceId(null);
    setError('');
  };

  const addModel = (serviceId: string) => {
    const target = services.find((s) => s.id === serviceId);
    if (!target) return;
    const model = { id: createCustomModelId(), name: '', model: '' };
    setEditingModel({ serviceId, model, isNew: true });
    setError('');
  };

  const setModelActive = (serviceId: string, modelId: string) => {
    setActiveServiceId(serviceId);
    setActiveModelId(modelId);
    setError('');
  };

  const toggleCollapse = (serviceId: string) => {
    setCollapsedServiceIds((ids) => ids.includes(serviceId) ? ids.filter((id) => id !== serviceId) : [...ids, serviceId]);
  };

  const handleSaveSettings = () => {
    const valid = sanitizeProfiles(services);
    const { service, model } = resolveModelSelection(valid, activeServiceId, activeModelId);

    onSaveSettings({
      services: valid,
      activeServiceId: service?.id ?? '',
      activeModelId: model?.id ?? '',
      geminiApiKey: speechSettings.services.find((item) => item.id === 'gemini')?.apiKey ?? geminiApiKey,
      speechSettings: sanitizeSpeechSettings(speechSettings)!,
      thinkingEnabled,
      useStream: streamEnabled,
    });

    setStatus(t('设置已保存'));
    setTimeout(() => onModalClose(), 900);
  };

  const isThinkingAvailable = !!activeModel?.caps?.thinking;

  const query = searchQuery.trim().toLowerCase();
  const matchesService = (service: ProviderProfile) => {
    if (!query) return true;
    const haystack = [
      service.name,
      service.id,
      ...service.models.map((m) => `${m.name} ${m.model}`),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  };
  const visibleServices = services.filter(matchesService);

  const presetExists = (presetId: string) => services.some((s) => s.name.trim().toLowerCase() === (PRESETS.find((p) => p.id === presetId)?.name ?? '').toLowerCase());

  const handlePresetClick = (presetId: string) => {
    const existing = services.find((s) => s.name.trim().toLowerCase() === (PRESETS.find((p) => p.id === presetId)?.name ?? '').toLowerCase());
    if (existing) {
      setCollapsedServiceIds((ids) => ids.filter((id) => id !== existing.id));
      setEditingService(existing);
      setEditingServiceMode('edit');
      return;
    }
    const service = fromPreset(presetId);
    if (service) addService(service, 'create');
  };

  const defaultLabel = activeService && activeModel
    ? `${activeService.name || activeService.id} · ${activeModel.name || activeModel.model}`
    : t('未配置模型');

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

        {/* 工具栏：标题 + 搜索 + 新增服务商 */}
        <div className="settings-toolbar">
          <div className="min-w-0">
            <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{t('模型与语音')}</h3>
            <p className="m-0 text-sm leading-6" style={{ color: 'var(--ink-3)' }}>
              {t('配置解析、翻译与朗读服务。')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="settings-search relative">
              <span className="settings-search-icon" aria-hidden="true">{Icon.search}</span>
              <input
                type="search"
                className="nd-input settings-search-input"
                placeholder={t('搜索模型或服务商…')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('搜索模型或服务商…')}
              />
            </div>
            <button
              type="button"
              className="nd-primary-btn settings-toolbar-add"
              onClick={() => addService(emptyService(), 'create')}
            >
              {Icon.plus}<span>{t('新增服务商')}</span>
            </button>
          </div>
        </div>

        {/* 预设图标墙 */}
        <div className="preset-icon-wall" role="group" aria-label={t('从预设创建…')}>
          {PRESETS.map((preset) => {
            const exists = presetExists(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                className="preset-icon"
                title={preset.name}
                aria-label={`${preset.name}${exists ? ` · ${t('已添加')}` : ''}`}
                onClick={() => handlePresetClick(preset.id)}
              >
                <ProviderLogo profile={{ id: preset.id, name: preset.name, baseUrl: preset.baseUrl, apiKey: '', models: [] }} className="h-5 w-5" />
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* 默认模型行 */}
        <div className="settings-row" ref={defaultMenuRef}>
          <div className="min-w-0">
            <span className="settings-row-title">{t('默认模型')}</span>
            <span className="settings-row-desc">{t('解析与翻译时使用的模型。')}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              className="nd-soft-btn settings-row-trigger"
              aria-haspopup="menu"
              aria-expanded={defaultMenuOpen}
              onClick={() => setDefaultMenuOpen((v) => !v)}
            >
              <span className="min-w-0 truncate">{defaultLabel}</span>
              <span style={{ transform: defaultMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} aria-hidden="true">
                {Icon.chev}
              </span>
            </button>
            {defaultMenuOpen && (
              <div className="settings-row-menu" role="menu" aria-label={t('默认模型')}>
                {services.map((service) => (
                  <div key={service.id} className="model-switch-group">
                    <div className="model-switch-group-label">
                      <ProviderLogo profile={service} className="h-3.5 w-3.5" />
                      <span>{service.name || service.id}</span>
                    </div>
                    {service.models.map((model) => {
                      const isActive = service.id === activeService?.id && model.id === activeModel?.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          className="model-switch-item"
                          style={isActive ? { color: 'var(--primary)', background: 'var(--primary-soft)' } : undefined}
                          onClick={() => { setModelActive(service.id, model.id); setDefaultMenuOpen(false); }}
                        >
                          <span className="min-w-0 flex-1 truncate">{model.name || model.model || t('未命名模型')}</span>
                          {isActive && <span aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 服务商分组列表 */}
        <div className="settings-group" role="group" aria-label={t('模型配置')}>
          <p className="settings-group-label">{t('模型服务')}</p>

          {visibleServices.length === 0 ? (
            <div className="rounded-[10px] p-4 text-sm" style={{ background: 'var(--bg)', border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
              {query ? t('没有匹配「{0}」的服务商或模型。', searchQuery.trim()) : t('还没有模型服务，点「新增服务商」或从预设创建。')}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleServices.map((service) => {
                const isCollapsed = collapsedServiceIds.includes(service.id);
                return (
                  <section key={service.id} className="provider-group-card" aria-label={service.name || service.id}>
                    <header className="provider-group-header">
                      <button
                        type="button"
                        className="provider-group-title"
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleCollapse(service.id)}
                      >
                        <ProviderLogo profile={service} className="h-4 w-4" />
                        <span className="truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                          {service.name || t('未命名服务商')}
                        </span>
                        {service.baseUrl && (
                          <span className="hidden truncate text-xs sm:inline" style={{ color: 'var(--ink-3)' }}>{service.baseUrl}</span>
                        )}
                        <span className="provider-group-count">{t('{0} 个模型', service.models.length)}</span>
                        <span
                          className="provider-group-chevron"
                          aria-hidden="true"
                          style={{ transform: isCollapsed ? 'none' : 'rotate(90deg)' }}
                        >
                          {Icon.chev}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="nd-ghost-btn"
                          onClick={() => { setEditingService(service); setEditingServiceMode('edit'); }}
                        >
                          {Icon.pencil}<span>{t('编辑配置')}</span>
                        </button>
                        <button
                          type="button"
                          className="nd-ghost-btn"
                          onClick={() => addModel(service.id)}
                        >
                          {Icon.plus}<span>{t('新增模型')}</span>
                        </button>
                        <button
                          type="button"
                          className="nd-ghost-btn provider-danger"
                          onClick={() => removeService(service.id)}
                        >
                          {t('删除此服务')}
                        </button>
                      </div>
                    </header>

                    {!isCollapsed && (
                      <div className="provider-model-list">
                        {service.models.length === 0 ? (
                          <div className="rounded-[10px] p-3 text-sm" style={{ background: 'var(--bg)', border: '1px dashed var(--line)', color: 'var(--ink-3)' }}>
                            {t('还没有模型，点「新增模型」添加。')}
                          </div>
                        ) : (
                          service.models.map((model) => {
                            const modelIsCurrent = service.id === activeService?.id && model.id === activeModel?.id;
                            const menuOpen = menuServiceId === model.id;
                            return (
                              <div key={model.id} className="model-row" ref={menuOpen ? rowMenuRef : undefined}>
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>
                                    {model.name || model.model || t('未命名模型')}
                                  </span>
                                  {model.caps?.thinking === true && (
                                    <span className="model-row-cap-badge">{t('深度思考')}</span>
                                  )}
                                  {modelIsCurrent && (
                                    <span
                                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
                                    >
                                      {t('当前')}
                                    </span>
                                  )}
                                </div>
                                {!modelIsCurrent && (
                                  <button
                                    type="button"
                                    className="nd-ghost-btn shrink-0"
                                    onClick={() => setModelActive(service.id, model.id)}
                                  >
                                    {t('设为当前')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="nd-ghost-btn shrink-0"
                                  onClick={() => { setMenuServiceId(null); setEditingModel({ serviceId: service.id, model, isNew: false }); }}
                                >
                                  {Icon.pencil}<span>{t('模型设置')}</span>
                                </button>
                                <div className="relative">
                                  <button
                                    type="button"
                                    className="nd-ghost-btn shrink-0"
                                    style={{ padding: '6px 8px' }}
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    aria-label={t('更多操作')}
                                    onClick={() => setMenuServiceId(menuOpen ? null : model.id)}
                                  >
                                    {Icon.more}
                                  </button>
                                  {menuOpen && (
                                    <div className="model-row-menu" role="menu" aria-label={t('更多操作')}>
                                      {!modelIsCurrent && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="model-row-menu-item"
                                          onClick={() => { setModelActive(service.id, model.id); setMenuServiceId(null); }}
                                        >
                                          {t('设为当前')}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="model-row-menu-item"
                                        style={{ color: 'var(--pos-p)' }}
                                        onClick={() => removeModel(service.id, model.id)}
                                      >
                                        {t('删除此模型')}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </section>
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

        {isModalOpen && <SpeechServices settings={speechSettings} onChange={setSpeechSettings} />}

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

      {isModalOpen && editingService && (
        <ProviderConfigDialog
          key={editingService.id}
          service={editingService}
          mode={editingServiceMode}
          onSave={(id, patch) => {
            if (editingServiceMode === 'create') {
              setServices((list) => [{ ...editingService, ...patch }, ...list]);
              setCollapsedServiceIds((ids) => ids.filter((value) => value !== id));
              setSearchQuery('');
            } else updateService(id, patch);
          }}
          onClose={() => { setEditingService(null); setEditingServiceMode('edit'); }}
        />
      )}

      {isModalOpen && editingModelItem && (
        <ModelConfigDialog
          key={`${editingModelItem.service.id}:${editingModelItem.model.id}`}
          serviceId={editingModelItem.service.id}
          serviceName={editingModelItem.service.name || editingModelItem.service.id}
          model={editingModelItem.model}
          onSave={(serviceId, modelId, patch) => {
            if (editingModel?.isNew) {
              updateService(serviceId, { models: [...editingModelItem.service.models, { ...editingModelItem.model, ...patch }] });
              setCollapsedServiceIds((ids) => ids.filter((id) => id !== serviceId));
              setSearchQuery('');
            } else updateModel(serviceId, modelId, patch);
          }}
          onDelete={editingModel?.isNew ? undefined : () => {
            removeModel(editingModelItem.service.id, editingModelItem.model.id);
            setEditingModel(null);
          }}
          onClose={() => setEditingModel(null)}
        />
      )}
    </div>
  );
}
