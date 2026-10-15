'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ModelCaps, ModelConfig } from '../lib/aiModels';
import { Icon } from './Icons';
import { Switch } from '@/components/ui/switch';

interface ModelConfigDialogProps {
  /** 所属服务商 id 与名称 */
  serviceId: string;
  serviceName: string;
  /** 正在编辑的模型 */
  model: ModelConfig;
  onSave: (serviceId: string, modelId: string, patch: Partial<ModelConfig>) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function ModelConfigDialog({ serviceId, serviceName, model, onSave, onDelete, onClose }: ModelConfigDialogProps) {
  const { t } = useLanguage();
  const [modelName, setModelName] = useState(model.model);
  const [thinking, setThinking] = useState(model.caps?.thinking === true);
  const [reasoningEffort, setReasoningEffort] = useState(model.caps?.reasoningEffort ?? '');

  // 打开的是另一个模型时同步表单
  useEffect(() => {
    setModelName(model.model);
    setThinking(model.caps?.thinking === true);
    setReasoningEffort(model.caps?.reasoningEffort ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    const trimmed = modelName.trim();
    const caps: ModelCaps = { thinking };
    if (thinking && trimmed) {
      const effort = reasoningEffort.trim();
      if (effort) caps.reasoningEffort = effort;
    }
    onSave(serviceId, model.id, { model: trimmed, name: trimmed, caps });
    onClose();
  };

  return (
    <div
      className="settings-config-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-config-dialog" role="dialog" aria-modal="true" aria-label={t('模型设置')}>
        <button
          type="button"
          className="settings-modal-close-button"
          onClick={onClose}
          aria-label={t('关闭设置')}
        >
          {Icon.x}
        </button>

        <div className="mb-4">
          <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)' }}>{t('模型设置')}</h3>
          <p className="m-0 mt-1 text-sm leading-6" style={{ color: 'var(--ink-3)' }}>{t('属于「{0}」下的模型。', serviceName)}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="modelCfgName" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
              {t('模型名称')}
            </label>
            <input
              id="modelCfgName"
              className="nd-input"
              placeholder="deepseek-chat"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            />
          </div>
          <div className="settings-option-row" style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <label className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('支持思考 / 推理参数')}</label>
                <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('开启后该模型可启用「深度思考」。')}</p>
              </div>
              <Switch
                aria-label={t('支持思考 / 推理参数')}
                checked={thinking}
                onCheckedChange={setThinking}
              />
            </div>
          </div>
          {thinking && (
            <div>
              <label htmlFor="modelCfgEffort" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                {t('思考强度（reasoning_effort，可选）')}
              </label>
              <input
                id="modelCfgEffort"
                className="nd-input"
                placeholder={t('如 xhigh / medium / low；留空用服务商默认')}
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
              />
              <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>{t('不同服务商接受的值不同，请按该服务商文档填写。')}</p>
            </div>
          )}
        </div>

        <div className="settings-actions">
          {onDelete && (
            <button type="button" className="nd-ghost-btn provider-danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
              {t('删除此模型')}
            </button>
          )}
          <button type="button" className="nd-ghost-btn" onClick={onClose}>
            {t('取消')}
          </button>
          <button type="button" className="nd-primary-btn" onClick={handleSave} disabled={!modelName.trim()}>
            {t('保存')}
          </button>
        </div>
      </div>
    </div>
  );
}
