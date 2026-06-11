'use client';

import Image from 'next/image';
import type { AIProvider } from '../services/api';
import ThemeToggle from './ThemeToggle';
import { Icon } from './Icons';
import { ProviderLogo, PROVIDER_LABELS } from './ProviderLogo';

interface HeaderProps {
  thinking: boolean;
  aiProvider: AIProvider;
  onSettingsClick?: () => void;
}

export default function Header({ aiProvider, onSettingsClick }: HeaderProps) {
  const providerLabel = PROVIDER_LABELS[aiProvider];

  return (
    <header className="flex items-center px-4 py-4 sm:px-9 sm:py-5">
      <div className="flex min-w-0 items-center">
        <Image
          src="/logo/logo-text.png"
          alt="日本語文章解析"
          width={1323}
          height={330}
          priority
          sizes="(min-width: 640px) 290px, 210px"
          className="h-9 w-auto max-w-[210px] object-contain sm:h-11 sm:max-w-[290px]"
        />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 sm:gap-2">
        <span
          className="provider-indicator"
          title={`当前模型服务商：${providerLabel}`}
          aria-label={`当前模型服务商：${providerLabel}`}
        >
          <ProviderLogo provider={aiProvider} className="h-4 w-4 sm:h-5 sm:w-5" />
          <span>{providerLabel}</span>
        </span>
        <a
          href="https://github.com/cokice/japanese-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub 仓库"
          className="grid h-10 w-10 place-items-center rounded-[10px] transition-colors hover:text-[var(--primary)]"
          style={{ color: 'var(--ink-2)' }}
        >
          {Icon.github}
        </a>
        <ThemeToggle />
        <button
          onClick={onSettingsClick}
          title="设置"
          className="grid h-10 w-10 cursor-pointer place-items-center rounded-[10px] border-none bg-transparent transition-colors hover:text-[var(--primary)]"
          style={{ color: 'var(--ink-2)' }}
        >
          {Icon.gear}
        </button>
      </div>
    </header>
  );
}
