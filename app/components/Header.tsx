'use client';

import Image from 'next/image';
import ThemeToggle from './ThemeToggle';
import { Icon } from './Icons';

interface HeaderProps {
  thinking: boolean;
  onSettingsClick?: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
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
