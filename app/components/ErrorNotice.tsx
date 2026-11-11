'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { ApiRequestError } from '../utils/requestErrors';

export default function ErrorNotice({ error, onOpenSettings, onRetry }: {
  error: Error;
  onOpenSettings: () => void;
  onRetry: () => void;
}) {
  const { t, errorText } = useLanguage();
  const needsKey = (error instanceof ApiRequestError && (error.status === 401 || error.code === 'MISSING_API_KEY' || error.code === 'INVALID_API_KEY'))
    || /未提供.*密钥|No API key/i.test(error.message);
  return (
    <div className="error-notice" role="alert">
      <span className="error-notice-message">{errorText(error)}</span>
      <button type="button" className="nd-ghost-btn" onClick={needsKey ? onOpenSettings : onRetry}>
        {needsKey ? t("打开设置") : t("重试")}
      </button>
    </div>
  );
}
