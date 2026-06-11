'use client';

import { useEffect, useState } from 'react';
import type { AIProvider } from '../services/api';
import { Icon } from './Icons';
import { ProviderLogo, PROVIDER_LABELS } from './ProviderLogo';

interface SettingsPayload {
  aiProvider: AIProvider;
  geminiApiKey: string;
  geminiApiUrl: string;
  deepseekApiKey: string;
  deepseekApiUrl: string;
  useStream: boolean;
}

interface SettingsModalProps {
  aiProvider: AIProvider;
  geminiApiKey: string;
  geminiApiUrl: string;
  deepseekApiKey: string;
  deepseekApiUrl: string;
  defaultApiUrl: string;
  useStream: boolean;
  onSaveSettings: (settings: SettingsPayload) => void;
  isModalOpen: boolean;
  onModalClose: () => void;
}

const PROVIDER_PLACEHOLDERS: Record<AIProvider, string> = {
  gemini: '例如: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  deepseek: '例如: https://api.deepseek.com/chat/completions',
};

export default function SettingsModal({
  aiProvider,
  geminiApiKey,
  geminiApiUrl,
  deepseekApiKey,
  deepseekApiUrl,
  defaultApiUrl,
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(aiProvider);
  const [geminiKey, setGeminiKey] = useState(geminiApiKey);
  const [geminiUrl, setGeminiUrl] = useState(geminiApiUrl === defaultApiUrl ? '' : geminiApiUrl);
  const [deepseekKey, setDeepseekKey] = useState(deepseekApiKey);
  const [deepseekUrl, setDeepseekUrl] = useState(deepseekApiUrl === defaultApiUrl ? '' : deepseekApiUrl);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setSelectedProvider(aiProvider);
    setGeminiKey(geminiApiKey);
    setGeminiUrl(geminiApiUrl === defaultApiUrl ? '' : geminiApiUrl);
    setDeepseekKey(deepseekApiKey);
    setDeepseekUrl(deepseekApiUrl === defaultApiUrl ? '' : deepseekApiUrl);
    setStreamEnabled(useStream);
  }, [aiProvider, geminiApiKey, geminiApiUrl, deepseekApiKey, deepseekApiUrl, defaultApiUrl, useStream]);

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onModalClose();
    }
  };

  const currentApiKey = selectedProvider === 'gemini' ? geminiKey : deepseekKey;
  const currentApiUrl = selectedProvider === 'gemini' ? geminiUrl : deepseekUrl;

  const setCurrentApiKey = (value: string) => {
    if (selectedProvider === 'gemini') {
      setGeminiKey(value);
    } else {
      setDeepseekKey(value);
    }
  };

  const setCurrentApiUrl = (value: string) => {
    if (selectedProvider === 'gemini') {
      setGeminiUrl(value);
    } else {
      setDeepseekUrl(value);
    }
  };

  const handleSaveSettings = () => {
    onSaveSettings({
      aiProvider: selectedProvider,
      geminiApiKey: geminiKey.trim(),
      geminiApiUrl: geminiUrl.trim() || defaultApiUrl,
      deepseekApiKey: deepseekKey.trim(),
      deepseekApiUrl: deepseekUrl.trim() || defaultApiUrl,
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
            应用默认使用服务器端密钥，也可以为 Gemini 和 DeepSeek 分别配置浏览器本地设置。
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[.08em]" style={{ color: 'var(--ink-3)' }}>
            文本模型服务商
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-[12px] p-1" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            {(['gemini', 'deepseek'] as AIProvider[]).map((provider) => {
              const active = selectedProvider === provider;
              return (
                <button
                  key={provider}
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: active ? 'var(--bg-2)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--ink-3)',
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
          {selectedProvider === 'deepseek' && (
            <p
              className="mt-2 flex items-start gap-2 rounded-[10px] p-2 text-xs leading-5"
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

        <div className="mb-4">
          <label htmlFor="modalApiUrlInput" className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            {PROVIDER_LABELS[selectedProvider]} API URL（可选）
          </label>
          <input
            type="text"
            id="modalApiUrlInput"
            className="nd-input"
            placeholder={PROVIDER_PLACEHOLDERS[selectedProvider]}
            value={currentApiUrl}
            onChange={(e) => setCurrentApiUrl(e.target.value)}
          />
          <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--ink-3)' }}>
            留空则使用服务器端默认端点；自定义地址需是 OpenAI 兼容的 chat completions 接口。
          </p>
        </div>

        <div className="mb-5 rounded-[12px] p-3" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
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
