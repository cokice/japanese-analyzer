'use client';

import { useEffect, useState } from 'react';
import { DEEPSEEK_MODEL_OPTIONS, GEMINI_MODEL_OPTIONS, getModelName, type AIModelName, type AIProvider } from '../services/api';
import { Icon } from './Icons';
import { ProviderLogo, PROVIDER_LABELS } from './ProviderLogo';

interface SettingsPayload {
  aiProvider: AIProvider;
  aiModel: AIModelName;
  geminiApiKey: string;
  deepseekApiKey: string;
  deepseekThinkingEnabled: boolean;
  useStream: boolean;
}

interface SettingsModalProps {
  aiProvider: AIProvider;
  aiModel: AIModelName;
  geminiApiKey: string;
  deepseekApiKey: string;
  deepseekThinkingEnabled: boolean;
  useStream: boolean;
  onSaveSettings: (settings: SettingsPayload) => void;
  isModalOpen: boolean;
  onModalClose: () => void;
}

export default function SettingsModal({
  aiProvider,
  aiModel,
  geminiApiKey,
  deepseekApiKey,
  deepseekThinkingEnabled,
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(aiProvider);
  const [selectedModel, setSelectedModel] = useState<AIModelName>(getModelName(aiProvider, aiModel));
  const [geminiKey, setGeminiKey] = useState(geminiApiKey);
  const [deepseekKey, setDeepseekKey] = useState(deepseekApiKey);
  const [thinkingEnabled, setThinkingEnabled] = useState(deepseekThinkingEnabled);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setSelectedProvider(aiProvider);
    setSelectedModel(getModelName(aiProvider, aiModel));
    setGeminiKey(geminiApiKey);
    setDeepseekKey(deepseekApiKey);
    setThinkingEnabled(deepseekThinkingEnabled);
    setStreamEnabled(useStream);
  }, [aiProvider, aiModel, geminiApiKey, deepseekApiKey, deepseekThinkingEnabled, useStream]);

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onModalClose();
    }
  };

  const currentApiKey = selectedProvider === 'gemini' ? geminiKey : deepseekKey;
  const currentModelName = getModelName(selectedProvider, selectedModel);
  const currentModelOptions = selectedProvider === 'deepseek' ? DEEPSEEK_MODEL_OPTIONS : GEMINI_MODEL_OPTIONS;

  const setCurrentApiKey = (value: string) => {
    if (selectedProvider === 'gemini') {
      setGeminiKey(value);
    } else {
      setDeepseekKey(value);
    }
  };

  const handleSaveSettings = () => {
    onSaveSettings({
      aiProvider: selectedProvider,
      aiModel: currentModelName,
      geminiApiKey: geminiKey.trim(),
      deepseekApiKey: deepseekKey.trim(),
      deepseekThinkingEnabled: thinkingEnabled,
      useStream: streamEnabled,
    });

    setStatus('设置已保存');
    setTimeout(() => onModalClose(), 900);
  };

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
          aria-label="关闭设置"
        >
          &times;
        </button>

        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              {Icon.gear}
            </span>
            <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)' }}>自定义 API 设置</h3>
          </div>
          <p className="m-0 text-sm leading-6" style={{ color: 'var(--ink-3)' }}>
            应用默认使用服务器端密钥，也可以为 Gemini 和 DeepSeek 分别配置浏览器本地密钥。上游端点由服务器配置。
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
            文本模型服务商
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-[3px] p-1" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            {(['gemini', 'deepseek'] as AIProvider[]).map((provider) => {
              const active = selectedProvider === provider;
              return (
                <button
                  key={provider}
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-[3px] px-3 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--bg-2)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--ink-3)',
                  }}
                  onClick={() => setSelectedProvider(provider)}
                >
                  <ProviderLogo provider={provider} />
                  {PROVIDER_LABELS[provider]}
                </button>
              );
            })}
          </div>
          {selectedProvider === 'deepseek' && (
            <p
              className="mt-2 flex items-start gap-2 rounded-[3px] p-2 text-xs leading-5"
              style={{
                background: 'color-mix(in oklab, var(--pos-adj) 12%, transparent)',
                color: 'var(--ink-2)',
              }}
            >
              <span
                className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[11px] font-bold leading-none"
                style={{ background: 'var(--pos-adj)', color: '#fff' }}
                aria-hidden="true"
              >
                !
              </span>
              <span>DeepSeek 当前不支持图片识别；选择后上传图片和粘贴图片识别会自动关闭。</span>
            </p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="modalModelSelect" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            模型版本
          </label>
          <select
            id="modalModelSelect"
            className="nd-input"
            value={currentModelName}
            onChange={(e) => setSelectedModel(getModelName(selectedProvider, e.target.value))}
            style={{
              color: 'var(--ink)',
              background: 'var(--bg-2)',
            }}
          >
            {currentModelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="modalApiKeyInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            {PROVIDER_LABELS[selectedProvider]} API 密钥（可选）
          </label>
          <input
            type="password"
            id="modalApiKeyInput"
            className="nd-input"
            placeholder={`输入您的 ${PROVIDER_LABELS[selectedProvider]} API 密钥`}
            value={currentApiKey}
            onChange={(e) => setCurrentApiKey(e.target.value)}
          />
        </div>

        <div className="mb-5 rounded-[3px] p-3" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <label htmlFor="useStreamToggle" className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                启用流式输出
              </label>
              <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
                实时显示解析结果，网络不稳定时可关闭。
              </p>
            </div>
            <button
              id="useStreamToggle"
              type="button"
              className="nd-toggle"
              aria-pressed={streamEnabled}
              onClick={() => setStreamEnabled(!streamEnabled)}
            >
              <span className="nd-toggle-knob" />
            </button>
          </div>
        </div>

        {selectedProvider === 'deepseek' && (
          <div className="mb-5 rounded-[3px] p-3" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="deepseekThinkingToggle" className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  启用深度思考
                </label>
                <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
                  句子解析时使用 High 强度；开启流式输出可实时查看思考全文。
                </p>
              </div>
              <button
                id="deepseekThinkingToggle"
                type="button"
                className="nd-toggle"
                aria-pressed={thinkingEnabled}
                onClick={() => setThinkingEnabled(!thinkingEnabled)}
              >
                <span className="nd-toggle-knob" />
              </button>
            </div>
          </div>
        )}

        <button
          id="saveSettingsButton"
          className="nd-primary-btn w-full"
          onClick={handleSaveSettings}
          type="button"
        >
          {Icon.check}
          <span>保存设置</span>
        </button>

        {status && (
          <div id="settingsStatus" className="mt-3 text-center text-sm" style={{ color: 'var(--primary)' }}>
            {status}
          </div>
        )}

        <p className="mb-0 mt-4 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
          注意：自定义设置仅存储在您的浏览器中，并会随请求用于调用所选模型接口。
        </p>
      </div>
    </div>
  );
}
