'use client';

import { useState, useEffect } from 'react';
import { FaSave } from 'react-icons/fa';
import type { AIProvider } from '../services/api';

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
  const [statusClass, setStatusClass] = useState('');

  useEffect(() => {
    setSelectedProvider(aiProvider);
    setGeminiKey(geminiApiKey);
    setGeminiUrl(geminiApiUrl === defaultApiUrl ? '' : geminiApiUrl);
    setDeepseekKey(deepseekApiKey);
    setDeepseekUrl(deepseekApiUrl === defaultApiUrl ? '' : deepseekApiUrl);
    setStreamEnabled(useStream);
  }, [aiProvider, geminiApiKey, geminiApiUrl, deepseekApiKey, deepseekApiUrl, defaultApiUrl, useStream]);

  const closeModal = () => {
    onModalClose();
  };

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeModal();
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

    setStatus('设置已保存！');
    setStatusClass('mt-3 text-sm text-green-600');
    setTimeout(() => closeModal(), 1500);
  };

  return (
    <>
      <div
        id="settingsModal"
        className="settings-modal"
        style={{ display: isModalOpen ? 'flex' : 'none' }}
        onClick={handleOutsideClick}
      >
        <div className="settings-modal-content">
          <span
            id="closeSettingsModal"
            className="settings-modal-close-button"
            onClick={closeModal}
          >
            &times;
          </span>
          <h3 className="text-xl font-semibold text-gray-700 mb-4">自定义API设置</h3>

          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-3">
              应用默认使用服务器端API密钥。也可以为 Gemini 和 DeepSeek 分别配置自己的密钥与接口地址。
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              文本模型服务商:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['gemini', 'deepseek'] as AIProvider[]).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                    selectedProvider === provider
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedProvider(provider)}
                >
                  {PROVIDER_LABELS[provider]}
                </button>
              ))}
            </div>
            {selectedProvider === 'deepseek' && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-md p-2 mt-2">
                DeepSeek 当前不支持图片识别；选择后上传图片和粘贴图片识别会自动关闭。
              </p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="modalApiKeyInput" className="block text-sm font-medium text-gray-700 mb-1">
              {PROVIDER_LABELS[selectedProvider]} API 密钥 (可选):
            </label>
            <input
              type="password"
              id="modalApiKeyInput"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder={`输入您的 ${PROVIDER_LABELS[selectedProvider]} API 密钥`}
              value={currentApiKey}
              onChange={(e) => setCurrentApiKey(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="modalApiUrlInput" className="block text-sm font-medium text-gray-700 mb-1">
              {PROVIDER_LABELS[selectedProvider]} API URL (可选):
            </label>
            <input
              type="text"
              id="modalApiUrlInput"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder={PROVIDER_PLACEHOLDERS[selectedProvider]}
              value={currentApiUrl}
              onChange={(e) => setCurrentApiUrl(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              留空则使用服务器端默认端点；自定义地址需是 OpenAI 兼容的 chat completions 接口。
            </p>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between">
              <label htmlFor="useStreamToggle" className="block text-sm font-medium text-gray-700">
                启用流式输出:
              </label>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="useStreamToggle"
                  className="sr-only peer"
                  checked={streamEnabled}
                  onChange={() => setStreamEnabled(!streamEnabled)}
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              流式输出可以实时显示解析结果，但可能在某些网络环境下不稳定。
            </p>
          </div>

          <button
            id="saveSettingsButton"
            className="premium-button premium-button-success w-full"
            onClick={handleSaveSettings}
          >
            <FaSave className="mr-2" />保存设置
          </button>
          {status && <div id="settingsStatus" className={statusClass}>{status}</div>}

          <div className="mt-4 text-xs text-gray-500">
            <p>注意：自定义设置仅存储在您的浏览器中，并会随请求用于调用所选模型接口。</p>
          </div>
        </div>
      </div>
    </>
  );
}
