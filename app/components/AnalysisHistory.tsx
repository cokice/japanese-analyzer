'use client';

import { useId, useState } from 'react';
import AnimateHeight from 'react-animate-height';
import { useLanguage } from '../contexts/LanguageContext';
import { ANALYSIS_HISTORY_LIMIT, type AnalysisHistoryEntry } from '../utils/analysisHistory';
import { Icon } from './Icons';

interface AnalysisHistoryProps {
  entries: AnalysisHistoryEntry[];
  storageUnavailable: boolean;
  disabled: boolean;
  onSelect: (text: string) => void;
  onClear: () => void;
}

export default function AnalysisHistory({
  entries, storageUnavailable, disabled, onSelect, onClear,
}: AnalysisHistoryProps) {
  const { t, locale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="analysis-history relative mt-4 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex h-8 w-full cursor-pointer items-center gap-1 rounded-lg pr-10 text-left text-sm"
        style={{ color: 'var(--ink-2)' }}
      >
        <span className={`transition-transform duration-300 motion-reduce:transition-none ${isOpen ? '' : '-rotate-90'}`}>
          {Icon.chev}
        </span>
        {t("历史记录")} <span className="ml-1 text-xs">{entries.length} / {ANALYSIS_HISTORY_LIMIT}</span>
      </button>
      <AnimateHeight
        id={contentId}
        height={isOpen ? 'auto' : 0}
        duration={300}
        contentClassName="flow-root"
        inert={!isOpen}
      >
        {storageUnavailable && (
          <p role="status" className="mt-2 text-xs" style={{ color: 'var(--ink-2)' }}>
            {t("历史记录暂时无法保存到浏览器，刷新后可能丢失。")}
          </p>
        )}
        {entries.length === 0 ? (
          <p className="py-5 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            {t("暂无历史记录，成功解析后会自动保存。")}
          </p>
        ) : (
          <ol className="mt-2 max-h-80 space-y-1 overflow-y-auto overscroll-contain" aria-label={t("历史记录")}>
            {entries.map(entry => (
              <li key={entry.text}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(entry.text)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                  title={entry.text}
                >
                  <span className="min-w-0 flex-1">
                    <span lang="ja" className="jp line-clamp-2 break-words text-sm" style={{ color: 'var(--ink)' }}>{entry.text}</span>
                    <time dateTime={new Date(entry.analyzedAt).toISOString()} className="mt-1 block text-xs" style={{ color: 'var(--ink-3)' }}>
                      {dateFormat.format(entry.analyzedAt)}
                    </time>
                  </span>
                  <span className="shrink-0" style={{ color: 'var(--ink-3)' }}>{Icon.return}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </AnimateHeight>
      {entries.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          title={t("清空历史记录")}
          aria-label={t("清空历史记录")}
          className="absolute right-0 top-2 grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[var(--primary-soft)]"
          style={{ color: 'var(--ink-2)' }}
        >
          {Icon.trash}
        </button>
      )}
    </div>
  );
}
