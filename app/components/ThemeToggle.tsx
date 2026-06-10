'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Icon } from './Icons';

const THEME_OPTIONS = [
  { value: 'light', label: '亮色模式', icon: Icon.sun },
  { value: 'dark', label: '暗色模式', icon: Icon.moon },
  { value: 'system', label: '跟随系统', icon: Icon.desktop },
] as const;

export default function ThemeToggle() {
  const { theme, actualTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentLabel = THEME_OPTIONS.find((option) => option.value === theme)?.label || '跟随系统';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={`切换主题 - ${currentLabel}`}
        className="grid h-10 w-10 place-items-center rounded-[10px] border border-transparent transition-colors hover:border-[var(--line)] hover:text-[var(--primary)]"
        style={{ color: 'var(--ink-2)' }}
      >
        {actualTheme === 'dark' ? Icon.moon : Icon.sun}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-40 rounded-2xl p-1.5"
          style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            boxShadow: '0 20px 50px -10px rgba(40,10,80,.20), 0 2px 8px rgba(20,10,40,.06)',
          }}
        >
          {THEME_OPTIONS.map((option) => {
            const active = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-medium transition-colors"
                style={{
                  background: active ? 'var(--primary-soft)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--ink-2)',
                }}
              >
                <span className="grid h-5 w-5 place-items-center">{option.icon}</span>
                <span>{option.label}</span>
              </button>
            );
          })}

          {theme === 'system' && (
            <div className="mt-1 border-t px-3 py-2 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
              当前：{actualTheme === 'dark' ? '暗色' : '亮色'}模式
            </div>
          )}
        </div>
      )}
    </div>
  );
}
