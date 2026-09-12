'use client';

import { LANGUAGE_LABELS, LOCALES, normalizeLocale } from '../i18n';
import { useLanguage } from '../contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { Icon } from './Icons';

interface LoginModalProps {
  isOpen: boolean;
  onLogin: (password: string) => void;
  error?: string;
}

export default function LoginModal({ isOpen, onLogin, error }: LoginModalProps) {
  const { t, locale, setLocale } = useLanguage();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    try {
      await onLogin(password);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(20,10,40,.50)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line)',
          boxShadow: '0 20px 50px -10px rgba(40,10,80,.25)',
        }}
      >
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            {Icon.lock}
          </div>
          <h2 className="mb-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
            {t("访问验证")}
          </h2>
          <select aria-label={t("语言")} className="nd-input mt-3 text-sm" value={locale} onChange={(event) => setLocale(normalizeLocale(event.target.value))}>
              {LOCALES.map((value) => <option key={value} value={value}>{LANGUAGE_LABELS[value]}</option>)}
            </select>
          <p className="m-0 text-sm" style={{ color: 'var(--ink-3)' }}>
            {t("请输入访问密码以继续使用")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("请输入访问密码")}
              className="nd-input pr-12"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[8px] transition-colors hover:text-[var(--primary)]"
              style={{ color: 'var(--ink-3)' }}
              disabled={isLoading}
              aria-label={showPassword ? t("隐藏密码") : t("显示密码")}
            >
              {showPassword ? Icon.eyeOff : Icon.eye}
            </button>
          </div>

          {error && (
            <div
              className="flex items-start gap-2 rounded-[10px] p-3 text-sm"
              style={{
                background: 'color-mix(in oklab, var(--pos-p) 10%, transparent)',
                color: 'var(--ink-2)',
              }}
            >
              <span
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold leading-none"
                style={{ background: 'var(--pos-p)', color: '#fff' }}
                aria-hidden="true"
              >
                !
              </span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!password.trim() || isLoading}
            className="nd-primary-btn w-full"
          >
            {isLoading ? (
              <>
                <span className="loading-spinner" style={{ width: 16, height: 16, margin: 0, borderLeftColor: '#fff' }} />
                <span>{t("验证中...")}</span>
              </>
            ) : (
              <span>{t("验证密码")}</span>
            )}
          </button>
        </form>

        <p className="mb-0 mt-5 text-center text-xs" style={{ color: 'var(--ink-3)' }}>
          {t("请联系管理员获取访问密码")}
        </p>
      </div>
    </div>
  );
}
