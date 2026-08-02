'use client';

import type { AIModelName, AIProvider } from '../services/api';
import ThemeToggle from './ThemeToggle';
import { Icon } from './Icons';
import { ProviderLogo, PROVIDER_LABELS } from './ProviderLogo';

interface HeaderProps {
  thinking: boolean;
  aiModel: AIModelName;
  onSettingsClick?: () => void;
}

const MODEL_LABELS: Record<AIModelName, string> = {
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
};

export default function Header({ aiModel, onSettingsClick }: HeaderProps) {
  const modelLabel = MODEL_LABELS[aiModel];
  const provider: AIProvider = aiModel.startsWith('deepseek') ? 'deepseek' : 'gemini';

  return (
    <header className="masthead">
      <div className="masthead-brand">
        <span className="masthead-seal" aria-hidden="true">語</span>
        <h1>日本語文章解析</h1>
      </div>
      <div className="masthead-right">
        <span
          className="provider-indicator masthead-engine"
          data-provider={provider}
          title={`当前模型：${modelLabel}`}
          aria-label={`当前模型：${modelLabel}`}
        >
          <ProviderLogo provider={provider} className="masthead-provider-logo" />
          <b>{PROVIDER_LABELS[provider]}</b>
        </span>
        <div className="masthead-actions">
          {process.env.NODE_ENV !== 'production' && (
            <a
              href="/debug/logs"
              title="开发日志"
              aria-label="打开开发日志"
              className="masthead-action"
            >
              {Icon.logs}
            </a>
          )}
          <a
            href="https://github.com/cokice/japanese-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub 仓库"
            className="masthead-action"
          >
            {Icon.github}
          </a>
          <ThemeToggle />
          <button
            onClick={onSettingsClick}
            title="设置"
            className="masthead-action"
          >
            {Icon.gear}
          </button>
        </div>
      </div>
    </header>
  );
}
