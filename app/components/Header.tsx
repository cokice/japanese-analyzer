'use client';

import ThemeToggle from './ThemeToggle';
import { Icon, Sakura } from './Icons';

interface HeaderProps {
  thinking: boolean;
  onSettingsClick?: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  return (
    <header className="flex items-center px-4 py-4 sm:px-9 sm:py-5">
      <div className="flex items-center gap-3">
        <Sakura size={30} />
        <h1 className="m-0 text-lg sm:text-[22px] font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
          日本語文章解析
        </h1>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 sm:gap-2">
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
