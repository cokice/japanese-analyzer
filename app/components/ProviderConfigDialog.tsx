'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ProviderProfile } from '../lib/aiModels';
import { Icon } from './Icons';
import { Switch } from '@/components/ui/switch';

export type TestState = 'idle' | 'loading' | 'ok' | 'error';

export interface TestResult {
  state: TestState;
  message: string;
}

interface ProviderConfigDialogProps {
  /** 正在编辑的服务商；为 null 时不渲染 */
  service: ProviderProfile;
  /** 新增时标题显示「服务商配置」，编辑时显示「编辑服务商」 */
  mode: 'create' | 'edit';
  /** 父级维护的测试结果（按 service.id 索引） */
  testResult?: TestResult;
  onTestConnection: (service: ProviderProfile) => void;
  onSave: (serviceId: string, patch: Partial<ProviderProfile>) => void;
  onClose: () => void;
}

export default function ProviderConfigDialog({ service, mode, testResult, onTestConnection, onSave, onClose }: ProviderConfigDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(service.name);
  const [baseUrl, setBaseUrl] = useState(service.baseUrl);
  const [apiKey, setApiKey] = useState(service.apiKey);
  const [jsonSchema, setJsonSchema] = useState(service.jsonSchema !== false);

  // 打开的是另一个服务商时同步表单
  useEffect(() => {
    setName(service.name);
    setBaseUrl(service.baseUrl);
    setApiKey(service.apiKey);
    setJsonSchema(service.jsonSchema !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    onSave(service.id, { name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), jsonSchema });
    onClose();
  };

  return (
    <div
      className="settings-config-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-config-dialog" role="dialog" aria-modal="true" aria-label={t('服务商配置')}>
        <button
          type="button"
          className="settings-modal-close-button"
          onClick={onClose}
          aria-label={t('关闭设置')}
        >
          {Icon.x}
        </button>

        <div className="mb-4">
          <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{mode === 'edit' ? t('编辑服务商') : t('服务商配置')}</h3>
          <p className="m-0 mt-1 text-sm leading-6" style={{ color: 'var(--ink-3)' }}>{t('兼容 OpenAI 的端点，密钥只保存在此浏览器。')}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="providerCfgName" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('服务名称')}
            </label>
            <input
              id="providerCfgName"
              className="nd-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="providerCfgBaseUrl" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('基础地址（Base URL）')}
            </label>
            <input
              id="providerCfgBaseUrl"
              className="nd-input"
              placeholder="https://api.deepseek.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="providerCfgApiKey" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('API 密钥')}
            </label>
            <input
              id="providerCfgApiKey"
              type="password"
              className="nd-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="settings-option-row" style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('使用严格结构化输出（json_schema）')}</label>
                <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('部分网关只接受 json_object，可关闭此项。')}</p>
              </div>
              <Switch
                aria-label={t('使用严格结构化输出（json_schema）')}
                checked={jsonSchema}
                onCheckedChange={setJsonSchema}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="nd-soft-btn"
              disabled={testResult?.state === 'loading'}
              onClick={() => onTestConnection({ ...service, name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), jsonSchema })}
            >
              {testResult?.state === 'loading' ? t('测试中…') : t('测试连接')}
            </button>
            {testResult?.state === 'ok' && (
              <span className="text-xs" style={{ color: 'var(--primary)' }}>{testResult.message}</span>
            )}
            {testResult?.state === 'error' && (
              <span className="text-xs" style={{ color: 'var(--pos-p)' }}>{testResult.message}</span>
            )}
          </div>
        </div>

        <div className="settings-actions">
          <button type="button" className="nd-ghost-btn" onClick={onClose}>
            {t('取消')}
          </button>
          <button type="button" className="nd-primary-btn" onClick={handleSave}>
            {t('保存')}
          </button>
        </div>
      </div>
    </div>
  );
}
