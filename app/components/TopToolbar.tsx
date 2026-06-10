'use client';

import ThemeToggle from './ThemeToggle';
import { Icon } from './Icons';

interface TopToolbarProps {
  onSettingsClick?: () => void;
}

export default function TopToolbar({ onSettingsClick }: TopToolbarProps) {
  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-end p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <a
          href="https://github.com/cokice/japanese-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub 仓库"
          className="grid h-10 w-10 place-items-center rounded-[10px] border transition-colors hover:text-[var(--primary)]"
          style={{
            background: 'color-mix(in oklab, var(--bg-2) 92%, transparent)',
            borderColor: 'var(--line)',
            color: 'var(--ink-2)',
            boxShadow: '0 1px 2px rgba(20,10,40,.03)',
          }}
        >
          {Icon.github}
        </a>

        <button
          onClick={onSettingsClick}
          className="grid h-10 w-10 place-items-center rounded-[10px] border transition-colors hover:text-[var(--primary)]"
          style={{
            background: 'color-mix(in oklab, var(--bg-2) 92%, transparent)',
            borderColor: 'var(--line)',
            color: 'var(--primary)',
            boxShadow: '0 1px 2px rgba(20,10,40,.03)',
          }}
          title="设置"
          type="button"
        >
          {Icon.gear}
        </button>

        <div className="relative">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
