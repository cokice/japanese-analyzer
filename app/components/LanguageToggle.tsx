'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGE_LABELS, LOCALES } from '../i18n';
import { Icon } from './Icons';

export default function LanguageToggle() {
  const { locale, setLocale, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const handleOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isOpen]);

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('语言')}
        title={`${t('语言')} · ${LANGUAGE_LABELS[locale]}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className="grid h-10 w-10 place-items-center rounded-[10px] border border-transparent transition-colors hover:border-[var(--line)] hover:text-[var(--primary)]"
        style={{ color: isOpen ? 'var(--primary)' : 'var(--ink-2)' }}
      >
        {Icon.globe}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t('语言')}
          className="absolute right-0 top-full z-20 mt-2 w-40 rounded-2xl p-1.5"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            boxShadow: '0 20px 50px -10px rgba(40,10,80,.20), 0 2px 8px rgba(20,10,40,.06)',
          }}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {LOCALES.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={locale === value}
              lang={value}
              tabIndex={-1}
              className="flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left text-sm font-medium transition-colors"
              style={{
                background: locale === value ? 'var(--primary-soft)' : 'transparent',
                color: locale === value ? 'var(--primary)' : 'var(--ink-2)',
              }}
              onClick={() => {
                setLocale(value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span>{LANGUAGE_LABELS[value]}</span>
              {locale === value && Icon.check}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
