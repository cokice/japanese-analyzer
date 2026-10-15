'use client';

import { useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ProviderProfile } from '../services/api';
import { Icon } from './Icons';
import { ProviderLogo } from './ProviderLogo';
import AnchoredPopover from './AnchoredPopover';

interface ModelSwitcherProps {
  services: ProviderProfile[];
  activeServiceId: string;
  activeModelId: string;
  onSelectModel: (serviceId: string, modelId: string) => void;
}

export default function ModelSwitcher({ services, activeServiceId, activeModelId, onSelectModel }: ModelSwitcherProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectableServices = services.filter((service) => service.models.length > 0);
  const activeService = services.find((s) => s.id === activeServiceId) ?? services[0] ?? null;
  const activeModel = activeService?.models.find((m) => m.id === activeModelId) ?? activeService?.models[0] ?? null;

  const toggle = () => {
    if (!selectableServices.length || !activeService) return;
    if (open) {
      setOpen(false);
      setExpandedServiceId(null);
    } else {
      setOpen(true);
      setExpandedServiceId(activeService.id);
    }
  };

  const handlePick = (serviceId: string, modelId: string) => {
    onSelectModel(serviceId, modelId);
    setOpen(false);
    setExpandedServiceId(null);
  };

  const currentLabel = activeService && activeModel
    ? `${activeService.name || activeService.id} · ${activeModel.name || activeModel.model}`
    : activeService
      ? activeService.name || activeService.id
      : t('未配置模型');

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="input-tool-button model-switcher-trigger"
        title={activeService ? `${t('切换模型')}：${currentLabel}` : t('未配置模型')}
        aria-label={activeService ? `${t('切换模型')}：${currentLabel}` : t('未配置模型')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={selectableServices.length === 0}
        onClick={toggle}
      >
        <ProviderLogo profile={activeService} className="h-[18px] w-[18px]" />
      </button>
      {open && activeService && selectableServices.length > 0 && (
        <AnchoredPopover anchorRef={rootRef} onClose={() => setOpen(false)} className="model-switcher-menu" role="menu" label={t('切换模型')}>
          <div className="model-switcher-menu-header">
            <ProviderLogo profile={activeService} className="h-4 w-4" />
            <span className="min-w-0 truncate">{currentLabel}</span>
          </div>
          {selectableServices.map((service) => {
            const expanded = expandedServiceId === service.id;
            return (
              <div key={service.id} className="model-switcher-group">
                <button
                  type="button"
                  role="menuitem"
                  className="model-switcher-service"
                  aria-expanded={expanded}
                  onClick={() => setExpandedServiceId(expanded ? null : service.id)}
                >
                  <ProviderLogo profile={service} className="h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1 truncate">{service.name || service.id}</span>
                  <span className="model-switcher-count">{t('{0} 个模型', service.models.length)}</span>
                  <span className="model-switcher-sub-chevron" aria-hidden="true">
                    {Icon.chev}
                  </span>
                </button>
                {expanded && (
                  <div className="model-switcher-sub">
                    {service.models.map((model) => {
                      const isActive = service.id === activeService.id && model.id === activeModel?.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          className="model-switcher-item"
                          style={isActive ? { color: 'var(--primary)', background: 'var(--primary-soft)' } : undefined}
                          onClick={() => handlePick(service.id, model.id)}
                        >
                          <span className="min-w-0 flex-1 truncate">{model.name || model.model || t('未命名模型')}</span>
                          {isActive && <span aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </AnchoredPopover>
      )}
    </div>
  );
}
