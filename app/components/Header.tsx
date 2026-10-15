'use client';

import { useLanguage } from '../contexts/LanguageContext';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { ProviderProfile } from '../services/api';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { Icon } from './Icons';
import { ProviderLogo } from './ProviderLogo';

interface HeaderProps {
  thinking: boolean;
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  onSelectModel: (serviceId: string, modelId: string) => void;
  onSettingsClick?: () => void;
}

export default function Header({ services, activeServiceId, activeModelId, onSelectModel, onSettingsClick }: HeaderProps) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const activeService = services.find((service) => service.id === activeServiceId) ?? services[0] ?? null;
  const activeModel = activeService?.models.find((model) => model.id === activeModelId) ?? activeService?.models[0] ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="app-header mx-auto flex w-full max-w-[1240px] items-center px-4 py-4 sm:px-9 sm:py-5">
      {/* 整页导航以重置当前输入、解析和聊天状态。 */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="brand-home flex min-w-0 items-center" aria-label={t("返回首页")} title={t("返回首页")}>
        <Image
          src="/logo/logo-text.png"
          alt={t("日本語文章解析")}
          width={1323}
          height={330}
          priority
          sizes="(min-width: 640px) 290px, 210px"
          className="brand-logo brand-logo-light h-9 w-auto max-w-[210px] object-contain sm:h-11 sm:max-w-[290px]"
        />
        <Image
          src="/logo/logo-text-dark.png"
          alt={t("日本語文章解析")}
          width={1323}
          height={330}
          priority
          sizes="(min-width: 640px) 290px, 210px"
          className="brand-logo brand-logo-dark h-9 w-auto max-w-[210px] object-contain sm:h-11 sm:max-w-[290px]"
        />
      </a>
      <div className="flex-1" />
      <div className="glass-toolbar flex items-center gap-1 sm:gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="provider-indicator cursor-pointer border-none bg-transparent p-0"
            title={activeService ? t("切换模型") : t("未配置模型")}
            aria-label={activeService ? t("切换模型") : t("未配置模型")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={!activeService}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ProviderLogo profile={activeService} className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>{activeService?.name || t("未配置模型")}</span>
            {activeModel && <span className="provider-indicator-model">{activeModel.name}</span>}
          </button>
          {menuOpen && activeService && (
            <div className="model-switch-menu" role="menu" aria-label={t("切换模型")}>
              {services.map((service) => (
                <div key={service.id} className="model-switch-group">
                  <div className="model-switch-group-label">
                    <ProviderLogo profile={service} className="h-3.5 w-3.5" />
                    <span>{service.name || service.id}</span>
                  </div>
                  {service.models.map((model) => {
                    const isActive = service.id === activeService?.id && model.id === activeModel?.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className="model-switch-item"
                        style={isActive ? { color: 'var(--primary)', background: 'var(--primary-soft)' } : undefined}
                        onClick={() => { onSelectModel(service.id, model.id); setMenuOpen(false); }}
                      >
                        <span className="min-w-0 flex-1 truncate">{model.name}</span>
                        {isActive && <span aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        <a
          href="https://github.com/cokice/japanese-analyzer"
          target="_blank"
          rel="noopener noreferrer"
          title={t("GitHub 仓库")}
          className="grid h-10 w-10 place-items-center rounded-[10px] transition-colors hover:text-[var(--primary)]"
          style={{ color: 'var(--ink-2)' }}
        >
          {Icon.github}
        </a>
        <ThemeToggle />
        <LanguageToggle />
        <button
          onClick={onSettingsClick}
          title={t("设置")}
          className="grid h-10 w-10 cursor-pointer place-items-center rounded-[10px] border-none bg-transparent transition-colors hover:text-[var(--primary)]"
          style={{ color: 'var(--ink-2)' }}
        >
          {Icon.gear}
        </button>
      </div>
    </header>
  );
}
