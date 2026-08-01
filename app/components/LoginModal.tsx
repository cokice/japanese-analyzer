'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icons';

interface LoginModalProps {
  isOpen: boolean;
  onLogin: (password: string) => void;
  error?: string;
}

export default function LoginModal({ isOpen, onLogin, error }: LoginModalProps) {
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
      style={{ background: 'color-mix(in oklab, var(--ink) 50%, transparent)' }}
    >
      <div className="login-paper-sheet">
        <div className="login-paper-heading">
          <div className="login-paper-mark">
            {Icon.lock}
          </div>
          <h2>
            访问验证
          </h2>
          <p>
            请输入访问密码以继续使用
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="nd-input pr-12"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center border-0 bg-transparent transition-colors hover:text-[var(--primary)]"
              style={{ color: 'var(--ink-3)' }}
              disabled={isLoading}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
            >
              {showPassword ? Icon.eyeOff : Icon.eye}
            </button>
          </div>

          {error && (
            <div className="paper-notice is-error" role="alert">
              <span className="paper-notice-mark" aria-hidden="true">!</span>
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
                <span className="loading-spinner login-loading-spinner" />
                <span>验证中...</span>
              </>
            ) : (
              <span>验证密码</span>
            )}
          </button>
        </form>

        <p className="mb-0 mt-5 text-center text-xs" style={{ color: 'var(--ink-3)' }}>
          请联系管理员获取访问密码
        </p>
      </div>
    </div>
  );
}
