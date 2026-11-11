'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGE_LABELS, LOCALES } from '../i18n';
import { Icon } from './Icons';

const MENU_GAP = 8;
const VIEWPORT_MARGIN = 8;

// 没有 CSS 锚点定位时，用 JS 把菜单放到按钮下方右对齐，放不下就翻到上方，并夹在视口内
function positionMenuFallback(trigger: HTMLElement, menu: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = menu;
  const left = Math.min(
    Math.max(rect.right - width, VIEWPORT_MARGIN),
    window.innerWidth - width - VIEWPORT_MARGIN,
  );
  const below = rect.bottom + MENU_GAP;
  const top = below + height > window.innerHeight - VIEWPORT_MARGIN && rect.top - MENU_GAP - height >= VIEWPORT_MARGIN
    ? rect.top - MENU_GAP - height
    : below;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

export default function LanguageToggle() {
  const { locale, setLocale, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuId = `${reactId}-menu`;
  // anchor-name 必须是 dashed-ident，去掉 useId 里的特殊字符
  const anchorName = `--language-trigger-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // popover 是 2025 年才进入 Baseline 的特性，旧浏览器按需加载 polyfill
  useEffect(() => {
    if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
      void import('@oddbird/popover-polyfill');
    }
  }, []);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const handleToggle = (event: Event) => {
      const open = (event as ToggleEvent).newState === 'open';
      setIsOpen(open);
      if (!open) return;
      if (!CSS.supports('position-area', 'block-end') && triggerRef.current) {
        positionMenuFallback(triggerRef.current, menu);
      }
      menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    };
    menu.addEventListener('toggle', handleToggle);
    return () => menu.removeEventListener('toggle', handleToggle);
  }, []);

  const closeMenu = (restoreFocus: boolean) => {
    const menu = menuRef.current;
    // :is() 是宽容选择器：不认识 :popover-open 的浏览器（polyfill 用 .\:popover-open 类）不会整句报错
    if (!menu?.matches(':is(:popover-open, .\\:popover-open)')) return;
    if (restoreFocus) triggerRef.current?.focus();
    menu.hidePopover();
  };

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        // Tab 离开菜单时关闭（popover 在顶层渲染，但 DOM 仍在容器内，contains 判断依然有效）
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('语言')}
        title={`${t('语言')} · ${LANGUAGE_LABELS[locale]}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        // popovertarget：浏览器负责点击切换、点外部关闭、Esc 关闭，且按钮属于菜单的 light-dismiss 组，再点按钮不会先关再开
        popoverTarget={menuId}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !isOpen) {
            event.preventDefault();
            menuRef.current?.showPopover();
          }
        }}
        className="grid h-10 w-10 place-items-center rounded-ui-md border border-transparent transition-colors hover:border-[var(--line)] hover:text-[var(--primary)]"
        style={{
          color: isOpen ? 'var(--primary)' : 'var(--ink-2)',
          anchorName,
        } as React.CSSProperties}
      >
        {Icon.globe}
      </button>

      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={t('语言')}
        className="language-menu w-40 rounded-2xl p-1.5"
        style={{
          positionAnchor: anchorName,
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          boxShadow: '0 20px 50px -10px rgba(40,10,80,.20), 0 2px 8px rgba(20,10,40,.06)',
        } as React.CSSProperties}
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
            className="flex w-full items-center justify-between gap-3 rounded-ui-md px-3 py-2 text-left text-sm font-medium transition-colors"
            style={{
              background: locale === value ? 'var(--primary-soft)' : 'transparent',
              color: locale === value ? 'var(--primary)' : 'var(--ink-2)',
            }}
            onClick={() => {
              setLocale(value);
              closeMenu(true);
            }}
          >
            <span>{LANGUAGE_LABELS[value]}</span>
            {locale === value && Icon.check}
          </button>
        ))}
      </div>
    </div>
  );
}
