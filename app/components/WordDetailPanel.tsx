'use client';

import { useState, useEffect, useMemo } from 'react';
import { WordDetail } from '../services/api';
import { getPosGroup, normalizePosBase, POS_GROUP_COLORS, POS_GROUP_LABELS, posChineseMap, speakJapanese, getJapaneseTtsAudioUrl } from '../utils/helpers';
import { escapeHtmlForMarkdown, highlightMarkedTextForMarkdown, preserveLineBreaksForMarkdown } from '../utils/markdown';
import { Icon, I } from './Icons';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { FlowAnimatedMarkdown } from '@/components/ui/flow-animated-markdown';

interface WordDetailPanelProps {
  wordDetail: WordDetail | null;
  isLoading: boolean;
  isStreamLoading: boolean;
  streamError: string;
  streamContent: string;
  onClose: () => void;
  onRefresh?: () => void;
  /* 不在面板中显示关闭按钮（移动端模态自带关闭时） */
  hideClose?: boolean;
}

// 朗读单词（Edge TTS，失败回退系统 TTS）
async function handleWordSpeak(word: string) {
  if (!word) return;
  try {
    const url = await getJapaneseTtsAudioUrl(word, undefined, 'edge', { gender: 'female' });
    const audio = new Audio(url);
    audio.play();
  } catch (error) {
    console.error('Edge TTS 朗读失败，回退到系统朗读:', error);
    speakJapanese(word);
  }
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-[18px]">
      <div className="detail-section-label">
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function WordDetailPlaceholder() {
  return (
    <section className="word-detail-panel-empty">
      <div
        className="grid h-14 w-14 place-items-center rounded-full"
        style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
      >
        {Icon.book}
      </div>
      <p className="m-0 text-sm leading-7">
        <span className="font-medium" style={{ color: 'var(--ink-2)' }}>点击带下划线的词汇</span>
        <br />
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
          这里会展开读音、释义和详细解释
        </span>
      </p>
    </section>
  );
}

export default function WordDetailPanel({
  wordDetail,
  isLoading,
  isStreamLoading,
  streamError,
  streamContent,
  onClose,
  onRefresh,
  hideClose = false,
}: WordDetailPanelProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);

  useEffect(() => {
    if (wordDetail?.explanation && wordDetail.explanation.length > 5000) {
      setShowExpandButton(true);
    } else {
      setShowExpandButton(false);
      setIsExplanationExpanded(false);
    }
  }, [wordDetail?.explanation]);

  // 格式化解释文本，支持换行和高亮
  const formatExplanation = useMemo(() => {
    return (text: string): string => {
      if (!text) return '';

      const isLongText = text.length > 5000;
      const displayText = isLongText && !isExplanationExpanded
        ? text.substring(0, 5000) + '...'
        : text;

      const formattedText = highlightMarkedTextForMarkdown(
        escapeHtmlForMarkdown(displayText)
      );

      return preserveLineBreaksForMarkdown(formattedText);
    };
  }, [isExplanationExpanded]);

  if (isLoading || (isStreamLoading && !wordDetail)) {
    return (
      <section className="word-detail-panel">
        <div className="flex items-center justify-center py-10">
          <div className="loading-spinner"></div>
          <span className="ml-2 text-sm" style={{ color: 'var(--ink-3)' }}>正在查询释义...</span>
        </div>
      </section>
    );
  }

  if (streamError) {
    return (
      <section className="word-detail-panel">
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="m-0 text-base font-semibold" style={{ color: 'var(--pos-p)' }}>词汇详解（出错）</h3>
            {onRefresh && (
              <button
                type="button"
                title="重新生成词语详解"
                aria-label="重新生成词语详解"
                className="grid cursor-pointer place-items-center rounded-md border-none bg-transparent p-1.5 transition-colors hover:text-[var(--primary)]"
                style={{ color: 'var(--ink-2)' }}
                onClick={onRefresh}
              >
                {Icon.refresh}
              </button>
            )}
          </div>
          <p className="m-0 text-sm" style={{ color: 'var(--ink-2)' }}>{streamError}</p>
          {streamContent && (
            <div
              className="mono mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-[10px] p-3 text-xs"
              style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}
            >
              {streamContent}
            </div>
          )}
          {!hideClose && (
            <div className="mt-4 flex justify-end">
              <button className="nd-soft-btn" onClick={onClose}>关闭</button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!wordDetail) return null;

  const posGroup = getPosGroup(wordDetail.pos || '');
  const accent = POS_GROUP_COLORS[posGroup];
  const display = (wordDetail.originalWord || '').replace(/[、。]/g, '');
  const posLabel = posChineseMap[normalizePosBase(wordDetail.pos)] || POS_GROUP_LABELS[posGroup];

  return (
    <section className="word-detail-panel">
      {/* 顶栏 */}
      <div
        className="flex items-center border-b px-4 py-2.5"
        style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}
      >
        <span className="mr-2 h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-[1.2px]"
          style={{ color: 'var(--ink-3)' }}
        >
          词语详解
        </span>
        {isStreamLoading && (
          <span className="nd-dots ml-2" style={{ color: 'var(--primary)' }} aria-hidden="true">
            <span /><span /><span />
          </span>
        )}
        <div className="flex-1" />
        {onRefresh && (
          <button
            type="button"
            title="重新生成词语详解"
            aria-label="重新生成词语详解"
            className="grid cursor-pointer place-items-center rounded-md border-none bg-transparent p-1.5 transition-colors hover:text-[var(--primary)]"
            style={{ color: 'var(--ink-2)' }}
            onClick={onRefresh}
          >
            <span className={isStreamLoading ? 'word-detail-refresh-icon is-spinning' : 'word-detail-refresh-icon'}>
              {Icon.refresh}
            </span>
          </button>
        )}
        <button
          type="button"
          title="朗读发音"
          aria-label="朗读发音"
          className="grid cursor-pointer place-items-center rounded-md border-none bg-transparent p-1.5 transition-colors hover:text-[var(--primary)]"
          style={{ color: 'var(--ink-2)' }}
          onClick={() => handleWordSpeak(display)}
        >
          {Icon.speaker}
        </button>
        {!hideClose && (
          <button
            onClick={onClose}
            title="关闭"
            className="grid cursor-pointer place-items-center rounded-md border-none bg-transparent p-1.5 transition-colors hover:text-[var(--ink)]"
            style={{ color: 'var(--ink-3)' }}
          >
            <I w={16}><path d="M6 6l12 12M18 6L6 18" /></I>
          </button>
        )}
      </div>

      {/* Hero */}
      <div
        className="relative px-5 pb-4 pt-5"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${accent} 6%, transparent), transparent 70%)`
        }}
      >
        {wordDetail.furigana && wordDetail.furigana !== display && (
          <div lang="ja" className="jp text-center text-[13px] tracking-[2px]" style={{ color: 'var(--ink-3)' }}>
            {wordDetail.furigana}
          </div>
        )}
        <div
          lang="ja"
          className="jp text-center text-[30px] font-semibold leading-tight tracking-[1px] sm:text-[36px]"
          style={{ color: 'var(--ink)' }}
        >
          {display}
        </div>
        {wordDetail.romaji && (
          <div
            className="mono mt-2 text-center text-xs uppercase tracking-[1.5px]"
            style={{ color: 'var(--ink-3)' }}
          >
            {wordDetail.romaji}
          </div>
        )}

        {/* 标签行 */}
        <div className="mt-3.5 flex flex-wrap justify-center gap-1.5">
          <span
            className="inline-flex items-center gap-[5px] rounded-md px-2.5 py-[3px] text-[11.5px] font-semibold"
            style={{
              color: accent,
              background: `color-mix(in oklab, ${accent} 12%, transparent)`
            }}
          >
            <span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: accent }} />
            {posLabel}
          </span>
          {wordDetail.pos && (
            <span
              lang="ja"
              className="rounded-md border px-2.5 py-[3px] text-[11.5px] font-medium"
              style={{ color: 'var(--ink-3)', background: 'var(--bg)', borderColor: 'var(--line)' }}
            >
              {wordDetail.pos}
            </span>
          )}
          {wordDetail.dictionaryForm && wordDetail.dictionaryForm !== wordDetail.originalWord && (
            <span
              className="jp rounded-md border px-2.5 py-[3px] text-[11.5px] font-medium"
              style={{ color: 'var(--ink-2)', background: 'var(--bg)', borderColor: 'var(--line)' }}
            >
              辞书形 <span lang="ja">{wordDetail.dictionaryForm}</span>
            </span>
          )}
        </div>
      </div>

      {/* 正文 */}
      <div className="max-h-[460px] overflow-y-auto px-5 pb-5 pt-1">
        <AutoAnimateHeight duration={300}>
          <DetailSection label="释义">
            <div
              className={`text-sm leading-relaxed ${wordDetail.chineseTranslation === '加载中...' ? 'animate-pulse' : ''}`}
              style={{ color: 'var(--ink)' }}
            >
              <span
                className="mono mr-2.5 text-[11px] font-semibold"
                style={{ color: accent }}
              >01</span>
              {wordDetail.chineseTranslation}
            </div>
          </DetailSection>

          {wordDetail.explanation && (
            <DetailSection label="解释">
              <div className="flow-markdown word-detail-explanation text-[13px] leading-relaxed">
                <FlowAnimatedMarkdown
                  content={formatExplanation(wordDetail.explanation)}
                  animation="fadeIn"
                  sep="word"
                  animationDuration="0.35s"
                  animationTimingFunction="ease-out"
                />
              </div>
              {showExpandButton && (
                <button
                  onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
                  className="mt-3 cursor-pointer border-none bg-transparent text-sm font-medium"
                  style={{ color: 'var(--primary)' }}
                >
                  {isExplanationExpanded ? '收起 ▲' : '展开全文 ▼'}
                </button>
              )}
            </DetailSection>
          )}
        </AutoAnimateHeight>
      </div>
    </section>
  );
}
