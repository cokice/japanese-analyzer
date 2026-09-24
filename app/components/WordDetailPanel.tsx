'use client';

import { useLanguage } from '../contexts/LanguageContext';
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
  /** 圈选的短语被 AI 判断为一个被拆开的词时，可合并回单个词 */
  onMerge?: () => void;
  /** 以当前词为起点，进入圈选多个词 */
  onSelectMore?: () => void;
  /* 不在面板中显示关闭按钮（移动端模态自带关闭时） */
  hideClose?: boolean;
}

// 短语类别（AI 返回的日文标签）→ 界面文案
const PHRASE_CATEGORY_LABELS: Record<string, string> = {
  単語: '一个词',
  文法形式: '语法结构',
  慣用表現: '惯用表达',
  連語: '词组',
};

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
    <div className="mt-[18px]">
      <div className="detail-section-label">
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

export function WordDetailPlaceholder() {
  const { t } = useLanguage();
  return (
    <section className="word-detail-panel-empty">
      <div
        className="word-detail-placeholder-icon grid h-12 w-12 place-items-center rounded-full"
        style={{ background: 'var(--bg)', color: 'var(--ink-3)' }}
      >
        {Icon.book}
      </div>
      <p className="m-0 text-sm leading-7">
        <span className="font-medium" style={{ color: 'var(--ink-2)' }}>{t("点击带下划线的词汇")}</span>
        <br />
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
          {t("这里会显示读音、释义和用法")}
        </span>
      </p>
    </section>
  );
}

function renderHighlightedText(text: string) {
  const nodes: React.ReactNode[] = [];
  // 只有显式的 Markdown 加粗才强调；引号和括号保留为正常正文。
  const highlightPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = highlightPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const value = match[0];
    const content = match[1];

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

export default function WordDetailPanel({
  wordDetail,
  isLoading,
  isStreamLoading,
  streamError,
  streamContent,
  onClose,
  onRefresh,
  onMerge,
  onSelectMore,
  hideClose = false,
}: WordDetailPanelProps) {
  const { t, errorText } = useLanguage();
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

  if (isLoading || (isStreamLoading && !wordDetail)) {
    return (
      <section className="word-detail-panel">
        <div className="flex items-center justify-center py-10">
          <div className="loading-spinner"></div>
          <span className="ml-2 text-sm" style={{ color: 'var(--ink-3)' }}>{t("正在查询释义...")}</span>
        </div>
      </section>
    );
  }

  if (streamError) {
    return (
      <section className="word-detail-panel">
        <div className="p-5">
          <div className={`mb-3 flex items-center justify-between gap-3${hideClose ? ' pr-[34px]' : ''}`}>
            <h3 className="m-0 text-base font-semibold" style={{ color: 'var(--pos-p)' }}>{t("释义暂不可用")}</h3>
            {onRefresh && (
              <button
                type="button"
                title={t("刷新释义")}
                aria-label={t("刷新释义")}
                className="dictionary-icon-btn"
                onClick={onRefresh}
              >
                {Icon.refresh}
              </button>
            )}
          </div>
          <p className="m-0 text-sm" style={{ color: 'var(--ink-2)' }}>{errorText(streamError)}</p>
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
              <button className="nd-soft-btn" onClick={onClose}>{t("关闭")}</button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!wordDetail) return null;

  const isPhrase = wordDetail.kind === 'phrase';
  // 单词去掉粘在一起的标点；短语只去掉末尾的，中间的「、」保留
  const display = isPhrase
    ? (wordDetail.originalWord || '').replace(/[、。]+$/, '')
    : (wordDetail.originalWord || '').replace(/[、。]/g, '');
  const phraseCategory = wordDetail.category ? PHRASE_CATEGORY_LABELS[wordDetail.category] : '';

  const posGroup = getPosGroup(wordDetail.pos || '');
  const accent = POS_GROUP_COLORS[posGroup];

  const posLabel = posChineseMap[normalizePosBase(wordDetail.pos)] || POS_GROUP_LABELS[posGroup];
  const originalPos = (wordDetail.pos || '').trim();
  const basePos = normalizePosBase(originalPos);
  // 合并常见词性名称，保留活用类型、自他性和细分类别。
  const posDetail = (posChineseMap[basePos] && originalPos.startsWith(basePos)
    ? originalPos.slice(basePos.length)
    : originalPos.startsWith(posLabel) ? originalPos.slice(posLabel.length) : originalPos)
    .replace(/^[\s・,，、/／-]+/, '')
    .replace(/^[（(](.*)[）)]$/, '$1')
    .trim();

  return (
    <section className="word-detail-panel">
      {/* 词头与读音 */}
      <div
        className="word-detail-headword relative px-5 pb-4 pt-5"
      >
        <div className={`dictionary-heading flex items-start gap-3${hideClose ? ' has-modal-close' : ''}`}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
            <h2
              lang="ja"
              className={`jp m-0 min-w-0 font-medium leading-snug tracking-[.5px] ${isPhrase && Array.from(display).length > 5
                ? 'text-[22px] sm:text-[24px]'
                : 'text-[28px] sm:text-[30px]'}`}
              style={{ color: 'var(--ink)' }}
            >
              {display}
            </h2>
            <button
              type="button"
              title={t("朗读发音")}
              aria-label={t("朗读发音")}
              className="dictionary-icon-btn dictionary-pronunciation"
              onClick={() => handleWordSpeak(display)}
            >
              {Icon.speaker}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 pt-1">
            {onRefresh ? (
              <button
                type="button"
                title={t("刷新释义")}
                aria-label={t("刷新释义")}
                className="dictionary-icon-btn"
                onClick={onRefresh}
              >
                <span className={isStreamLoading ? 'word-detail-refresh-icon is-spinning' : 'word-detail-refresh-icon'}>
                  {Icon.refresh}
                </span>
              </button>
            ) : isStreamLoading && (
              <span className="nd-dots" style={{ color: 'var(--ink-3)' }} aria-hidden="true">
                <span /><span /><span />
              </span>
            )}
            {!hideClose && (
              <button type="button" onClick={onClose} title={t("关闭")} aria-label={t("关闭")} className="dictionary-icon-btn">
                <I w={16}><path d="M6 6l12 12M18 6L6 18" /></I>
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {wordDetail.furigana && wordDetail.furigana !== display && (
            <span lang="ja" className="jp text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {wordDetail.furigana}
            </span>
          )}
          {wordDetail.romaji && (
            <span className="mono text-[11px]" style={{ color: 'var(--ink-3)' }}>{wordDetail.romaji}</span>
          )}
        </div>

        {/* 标签行 */}
        {isPhrase ? (
          <div className="word-detail-meta mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
              <span className="h-1 w-1 rounded-full" style={{ background: 'var(--primary)' }} aria-hidden="true" />
              {t(phraseCategory || '短语')}
            </span>
            {wordDetail.dictionaryForm && wordDetail.dictionaryForm !== wordDetail.originalWord && (
              <span className="jp text-xs" style={{ color: 'var(--ink-2)' }}>
                {t("形式")}<span lang="ja">{wordDetail.dictionaryForm}</span>
              </span>
            )}
          </div>
        ) : (
        <div className="word-detail-meta mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="inline-flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--ink-2)' }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: accent }} aria-hidden="true" />
            {t(posLabel)}
          </span>
          {posDetail && (
            <span
              lang="ja"
              className="word-detail-pos-original text-xs"
              style={{ color: 'var(--ink-3)' }}
            >
              {posDetail}
            </span>
          )}
          {wordDetail.dictionaryForm && wordDetail.dictionaryForm !== wordDetail.originalWord && (
            <span
              className="jp w-full pt-1 text-xs"
              style={{ color: 'var(--ink-2)' }}
            >
              {t("原形")}<span lang="ja">{wordDetail.dictionaryForm}</span>
            </span>
          )}
        </div>
        )}
      </div>

      {/* 正文 */}
      <div className="px-5 pb-5 pt-1">
        <p
          className={`dictionary-definition m-0 text-[16px] font-medium leading-relaxed ${wordDetail.chineseTranslation === t("加载中...") ? 'animate-pulse' : ''}`}
          style={{ color: 'var(--ink)' }}
        >
          {wordDetail.chineseTranslation}
        </p>

        {wordDetail.explanation && (
          <DetailSection label={t("本句用法")}>
            <div className="flow-markdown word-detail-explanation text-[13px] leading-relaxed">
              {explanationContent(wordDetail.explanation)}
            </div>
            {showExpandButton && (
              <button
                onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
                className="mt-3 cursor-pointer border-none bg-transparent text-sm font-medium"
                style={{ color: 'var(--primary)' }}
              >
                {isExplanationExpanded ? t("收起 ▲") : t("展开全文 ▼")}
              </button>
            )}
          </DetailSection>
        )}
        {isPhrase && wordDetail.breakdown && (
          <DetailSection label={t("构成")}>
            <p lang="ja" className="dictionary-conjugation m-0 text-[13px] leading-7" style={{ color: 'var(--ink-2)' }}>
              {wordDetail.breakdown}
            </p>
          </DetailSection>
        )}
        {wordDetail.conjugation && (
          <DetailSection label={t("词形")}>
            <p className="dictionary-conjugation m-0 text-[13px] leading-7" style={{ color: 'var(--ink-2)' }}>
              {wordDetail.conjugation}
            </p>
          </DetailSection>
        )}
        {wordDetail.example && wordDetail.exampleTranslation && (
          <DetailSection label={t("例句")}>
            <div className="dictionary-example">
              <p lang="ja" className="jp m-0 text-sm leading-7" style={{ color: 'var(--ink)' }}>{wordDetail.example}</p>
              <p className="m-0 mt-1 text-xs leading-6" style={{ color: 'var(--ink-2)' }}>{wordDetail.exampleTranslation}</p>
            </div>
          </DetailSection>
        )}
        {onMerge && !isStreamLoading && (
          <div className="phrase-merge">
            <span>{t("这几个词其实是一个词")}</span>
            <button type="button" className="nd-soft-btn" onClick={onMerge}>{t("合并为一个词")}</button>
          </div>
        )}
        {!isPhrase && onSelectMore && (
          <button type="button" className="select-more-btn" onClick={onSelectMore}>
            {Icon.plus}
            <span>{t("选中多个词一起解析")}</span>
          </button>
        )}
      </div>
    </section>
  );
}
