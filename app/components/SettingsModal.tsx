'use client';

import { useState, useEffect } from 'react';
import { FaCog, FaGithub, FaSave, FaMoon, FaSun } from 'react-icons/fa';

interface SettingsModalProps {
  userApiKey: string;
  userApiUrl: string;
  defaultApiUrl: string;
  useStream: boolean;
  onSaveSettings: (apiKey: string, apiUrl: string, useStream: boolean) => void;
  isModalOpen: boolean;
  onModalClose: () => void;
}

export default function SettingsModal({ 
  userApiKey, 
  userApiUrl,
  defaultApiUrl,
  useStream,
  onSaveSettings,
  isModalOpen,
  onModalClose
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(userApiKey);
  const [apiUrl, setApiUrl] = useState(userApiUrl === defaultApiUrl ? '' : userApiUrl);
  const [streamEnabled, setStreamEnabled] = useState(useStream);
  const [status, setStatus] = useState('');
  const [statusClass, setStatusClass] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setApiKey(userApiKey);
    setApiUrl(userApiUrl === defaultApiUrl ? '' : userApiUrl);
    setStreamEnabled(useStream);
  }, [userApiKey, userApiUrl, defaultApiUrl, useStream]);

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const isDark = storedTheme === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const closeModal = () => {
    onModalClose();
  };

  const handleOutsideClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  };

  const handleSaveSettings = () => {
    const trimmedApiKey = apiKey.trim();
    const trimmedApiUrl = apiUrl.trim();
    
    onSaveSettings(
      trimmedApiKey, 
      trimmedApiUrl || defaultApiUrl,
      streamEnabled
    );
    
    setStatus('设置已保存！');
    setStatusClass('mt-3 text-sm text-green-600');
    setTimeout(() => closeModal(), 1500);
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <>
      <button
        id="settingsButton"
        title="API 设置"
        onClick={onModalClose}
        className="fixed top-6 right-6 z-1000 bg-white text-[#007AFF] border border-[#007AFF] rounded-full w-10 h-10 flex items-center justify-center shadow-md hover:bg-gray-50 transition-all"
      >
        <FaCog />
      </button>

      <a
        id="githubButton"
        href="https://github.com/cokice/japanese-analyzer"
        target="_blank"
        rel="noopener noreferrer"
        title="GitHub 仓库"
        className="fixed top-6 right-20 z-1000 bg-white text-gray-800 border border-gray-800 rounded-full w-10 h-10 flex items-center justify-center shadow-md hover:bg-gray-50 transition-all"
      >
        <FaGithub />
      </a>

      <button
        id="themeToggleButton"
        title="切换主题"
        onClick={toggleDarkMode}
        className="fixed top-6 right-36 z-1000 bg-white text-gray-800 border border-gray-800 rounded-full w-10 h-10 flex items-center justify-center shadow-md hover:bg-gray-50 transition-all"
      >
        {darkMode ? <FaSun /> : <FaMoon />}
      </button>

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
              应用默认使用服务器端API密钥，无需配置即可使用。如需使用自己的密钥和API，请在下方配置。
            </p>
            
            <label htmlFor="modalApiKeyInput" className="block text-sm font-medium text-gray-700 mb-1">
              自定义 API 密钥 (可选):
            </label>
            <input
              type="password"
              id="modalApiKeyInput"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              placeholder="输入您的 API 密钥"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="modalApiUrlInput" className="block text-sm font-medium text-gray-700 mb-1">
              自定义 API URL (可选):
            </label>
            <input
              type="text"
              id="modalApiUrlInput"
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              placeholder="例如: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              留空则使用默认端点。若使用自定义域名，请在域名后加
              <code className="px-1 py-0.5 bg-gray-100 rounded">v1/chat/completions</code>
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
            <p>注意：自定义设置仅存储在您的浏览器中，不会传输到我们的服务器。</p>
          </div>
        </div>
      </div>
    </>
  );
} 