'use client';

import { useEffect, useState } from 'react';
import type { AIProvider } from '../services/api';
import { Icon } from './Icons';

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

const PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
};

const PROVIDER_PLACEHOLDERS: Record<AIProvider, string> = {
  gemini: '例如: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  deepseek: '例如: https://api.deepseek.com/chat/completions',
};

function ProviderLogo({ provider }: { provider: AIProvider }) {
  if (provider === 'gemini') {
    const geminiPath = 'M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z';

    return (
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={geminiPath} fill="#3186FF" />
        <path d={geminiPath} fill="url(#gemini-provider-logo-gradient-0)" />
        <path d={geminiPath} fill="url(#gemini-provider-logo-gradient-1)" />
        <path d={geminiPath} fill="url(#gemini-provider-logo-gradient-2)" />
        <defs>
          <linearGradient id="gemini-provider-logo-gradient-0" x1="7" x2="11" y1="15.5" y2="12" gradientUnits="userSpaceOnUse">
            <stop stopColor="#08B962" />
            <stop offset="1" stopColor="#08B962" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gemini-provider-logo-gradient-1" x1="8" x2="11.5" y1="5.5" y2="11" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F94543" />
            <stop offset="1" stopColor="#F94543" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gemini-provider-logo-gradient-2" x1="3.5" x2="17.5" y1="13.5" y2="12" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FABC12" />
            <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4D6BFE"
        d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"
      />
    </svg>
  );
}

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
