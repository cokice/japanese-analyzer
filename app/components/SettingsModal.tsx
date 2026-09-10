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
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(aiProvider);
  const [selectedModel, setSelectedModel] = useState<AIModelName>(getModelName(aiProvider, aiModel));
  const [geminiKey, setGeminiKey] = useState(geminiApiKey);
  const [deepseekKey, setDeepseekKey] = useState(deepseekApiKey);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setSelectedProvider(aiProvider);
    setSelectedModel(getModelName(aiProvider, aiModel));
    setGeminiKey(geminiApiKey);
    setDeepseekKey(deepseekApiKey);
    setStreamEnabled(useStream);
  }, [aiProvider, aiModel, geminiApiKey, deepseekApiKey, useStream]);

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
      deepseekThinkingEnabled: false,
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
          {Icon.x}
        </button>

        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--ink)' }}>模型与 API</h3>
          </div>
          <p className="m-0 text-sm leading-6" style={{ color: 'var(--ink-3)' }}>
            使用默认配置，或填写自己的 API 密钥。
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            模型服务
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-[12px] p-1" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            {(['gemini', 'deepseek'] as AIProvider[]).map((provider) => {
              const active = selectedProvider === provider;
              return (
                <button
                  key={provider}
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors"
                  aria-pressed={active}
                  style={{
                    background: active ? 'var(--bg-2)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-3)',
                    boxShadow: active ? '0 1px 2px rgba(20,10,40,.06)' : 'none',
                  }}
                  onClick={() => setSelectedProvider(provider)}
                >
                  <ProviderLogo provider={provider} />
                  {PROVIDER_LABELS[provider]}
                </button>
              );
            })}
          </div>
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

        <div className="settings-option-row">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label htmlFor="useStreamToggle" className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                流式输出
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
          <div className="settings-option-row">
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="deepseekThinkingToggle" className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  深度思考
                </label>
                <p className="m-0 mt-1 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
                  暂不可用。
                </p>
              </div>
              <button
                id="deepseekThinkingToggle"
                type="button"
                className="nd-toggle"
                aria-pressed={false}
                disabled
              >
                <span className="nd-toggle-knob" />
              </button>
            </div>
          </div>
        )}

        <div className="settings-actions">
          <button
            id="saveSettingsButton"
            className="nd-primary-btn"
            onClick={handleSaveSettings}
            type="button"
          >
            <span>保存设置</span>
          </button>
        </div>

        {status && (
          <div id="settingsStatus" className="mt-3 text-center text-sm" style={{ color: 'var(--primary)' }}>
            {status}
          </div>
        )}

        <p className="mb-0 mt-4 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
          密钥保存在此浏览器中，随请求发送用于调用模型。留空则使用默认配置。
        </p>
      </div>
    </div>
  );
}
