'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Icon } from './Icons';

const MARGIN = 8;

/** Render outside animated cards so their stacking contexts cannot cover the settings. */
export default function TtsSettingsPopover({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const { width, height } = menu.getBoundingClientRect();
      const below = rect.bottom + MARGIN;
      const above = rect.top - height - MARGIN;
      const top = below + height <= window.innerHeight - MARGIN || above < MARGIN ? below : above;
      menu.style.left = `${Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))}px`;
      menu.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN))}px`;
    };
    position();
    menu.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });

    const outside = (event: Event) => {
      if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        setOpen(false);
        trigger.focus({ preventScroll: true });
      }
    };
    const observer = new ResizeObserver(position);
    observer.observe(menu);
    observer.observe(trigger);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="input-tool-button input-tool-disclosure"
        onClick={() => setOpen(value => !value)}
        disabled={disabled}
        title={t('语音设置')}
        aria-label={t('语音设置')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
      >
        {Icon.chev}
      </button>
      {open && createPortal(
        <div ref={menuRef} id={id} role="dialog" aria-labelledby={`${id}-title`} className="input-voice-menu rounded-2xl p-4">
          <div id={`${id}-title`} className="mb-3 text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t('语音设置')}
          </div>
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
