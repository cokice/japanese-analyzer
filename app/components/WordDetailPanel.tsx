'use client';

import { useState, useEffect, useMemo } from 'react';
import { WordDetail } from '../services/api';
import { getPosGroup, normalizePosBase, POS_GROUP_COLORS, POS_GROUP_LABELS, posChineseMap, speakJapanese, getJapaneseTtsAudioUrl } from '../utils/helpers';
import { trackTtsUsage } from '../utils/analytics';
import { Icon, I } from './Icons';

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
    trackTtsUsage('edge');
    audio.play();
  } catch (error) {
    console.error('Edge TTS 朗读失败，回退到系统朗读:', error);
    speakJapanese(word);
  }
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="word-detail-section">
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

function renderHighlightedText(text: string) {
  const nodes: React.ReactNode[] = [];
  const highlightPattern = /(\*\*[^*]+\*\*|【[^】]+】|「[^」]+」)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = highlightPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const value = match[0];
    const content = value.startsWith('**')
      ? value.slice(2, -2)
      : value.slice(1, -1);

    nodes.push(<strong key={`${match.index}-${value}`}>{content}</strong>);
    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderStaticExplanation(text: string): React.ReactNode {
  return text.split('\n').map((line, lineIndex, lines) => (
    <span key={lineIndex}>
      {renderHighlightedText(line)}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ));
}

function splitExplanationSections(text: string): { explanation: string; example: string } {
  const exampleMarker = /(?:^|\n)\s*(?:例句|例文)[:：]\s*/m.exec(text);
  if (!exampleMarker) return { explanation: text, example: '' };

  return {
    explanation: text.slice(0, exampleMarker.index).trim(),
    example: text.slice(exampleMarker.index + exampleMarker[0].length).trim(),
  };
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

  // 格式化解释文本，支持换行和高亮。这里不用逐词动画，避免长解释看起来被截断。
  const explanationContent = useMemo(() => {
    return (text: string): React.ReactNode => {
      if (!text) return '';

      const isLongText = text.length > 5000;
      const displayText = isLongText && !isExplanationExpanded
        ? text.substring(0, 5000) + '...'
        : text;

      return renderStaticExplanation(displayText);
    };
  }, [isExplanationExpanded]);

  const explanationSections = useMemo(
    () => splitExplanationSections(wordDetail?.explanation || ''),
    [wordDetail?.explanation]
  );

  if (isLoading || (isStreamLoading && !wordDetail)) {
    return (
      <section className="word-detail-panel" lang="zh-CN">
        <div className="flex items-center justify-center py-10">
          <div className="loading-spinner"></div>
          <span className="ml-2 text-sm" style={{ color: 'var(--ink-3)' }}>正在查询释义...</span>
        </div>
      </section>
    );
  }

  if (streamError) {
    return (
      <section className="word-detail-panel" lang="zh-CN">
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
              className="mono mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-[3px] p-3 text-xs"
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
    <section className="word-detail-panel" lang="zh-CN">
      {/* 辞书顶栏 */}
      <div className="dictionary-bar">
        <span className="dictionary-bar-mark" style={{ background: accent }} />
        <span
          className="dictionary-bar-title"
          style={{ color: 'var(--ink-3)' }}
        >
          辞 書
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

      {/* 辞书词头 */}
      <div className="dictionary-headword">
        {wordDetail.furigana && wordDetail.furigana !== display && (
          <div lang="ja" className="dictionary-reading">
            {wordDetail.furigana}
          </div>
        )}
        <div
          lang="ja"
          className="dictionary-word"
        >
          {display}
        </div>
        {wordDetail.romaji && (
          <div className="dictionary-romaji">
            {wordDetail.romaji}
          </div>
        )}

        {/* 标签行 */}
        <div className="dictionary-meta">
          <span
            className="dictionary-pos-box"
            style={{ color: accent, borderColor: accent }}
          >
            {posLabel}
          </span>
          {wordDetail.pos && (
            <span
              lang="ja"
              className="dictionary-meta-box"
            >
              {wordDetail.pos}
            </span>
          )}
          {wordDetail.dictionaryForm && wordDetail.dictionaryForm !== wordDetail.originalWord && (
            <span
              className="dictionary-meta-box jp"
            >
              辞书形 <span lang="ja">{wordDetail.dictionaryForm}</span>
            </span>
          )}
        </div>
      </div>

      {/* 正文 */}
      <div className="dictionary-body">
        <DetailSection label="釋 義">
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

        {explanationSections.explanation && (
          <DetailSection label="解 釋">
            <div className="flow-markdown word-detail-explanation text-[13px] leading-relaxed">
              {explanationContent(explanationSections.explanation)}
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

        {explanationSections.example && (
          <DetailSection label="例 句">
            <div className="dictionary-example" lang="ja">
              {renderStaticExplanation(explanationSections.example)}
            </div>
          </DetailSection>
        )}
      </div>
    </section>
  );
}
