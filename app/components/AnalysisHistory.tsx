'use client';

import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { AnalysisHistoryEntry } from '../utils/analysisHistory';
import { Icon } from './Icons';

interface AnalysisHistoryProps {
  entries: AnalysisHistoryEntry[];
  storageUnavailable: boolean;
  disabled: boolean;
  onSelect: (text: string) => void;
  onClear: () => void;
}

// 默认只露出最近几条，保持首页安静；需要时再展开全部。
const PREVIEW_COUNT = 3;

export default function AnalysisHistory({
  entries, storageUnavailable, disabled, onSelect, onClear,
}: AnalysisHistoryProps) {
  const { t, locale } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

  if (entries.length === 0 && !storageUnavailable) return null;
  const visible = showAll ? entries : entries.slice(0, PREVIEW_COUNT);

  return (
    <section className="recent-list" aria-label={t("历史记录")}>
      <div className="suggestion-head">
        <h2 className="suggestion-label">{t("最近")}</h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            title={t("清空历史记录")}
            aria-label={t("清空历史记录")}
            className="suggestion-icon-btn"
          >
            {Icon.trash}
          </button>
        )}
      </div>
      {storageUnavailable && (
        <p role="status" className="mb-2 text-xs" style={{ color: 'var(--ink-2)' }}>
          {t("历史记录暂时无法保存到浏览器，刷新后可能丢失。")}
        </p>
      )}
      <ol className={showAll ? 'recent-items is-expanded' : 'recent-items'}>
        {visible.map(entry => (
          <li key={entry.text}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(entry.text)}
              className="recent-item"
              title={entry.text}
            >
              <span lang="ja" className="recent-text jp">{entry.text}</span>
              <time dateTime={new Date(entry.analyzedAt).toISOString()} className="recent-time">
                {dateFormat.format(entry.analyzedAt)}
              </time>
            </button>
          </li>
        ))}
      </ol>
      {entries.length > PREVIEW_COUNT && (
        <button type="button" className="suggestion-link" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
          {showAll ? t("收起") : t("显示全部 {0} 条", entries.length)}
        </button>
      )}
    </section>
  );
}
