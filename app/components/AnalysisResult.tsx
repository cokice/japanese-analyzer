'use client';

import { useLayoutEffect, useRef } from 'react';
import type { TokenData, WordDetail } from '../services/api';
import {
  containsKanji,
  getPosClass,
  normalizePosBase,
  POS_GROUP_COLORS,
  POS_GROUP_LABELS,
  POS_LEGEND_GROUPS,
} from '../utils/helpers';
import { Switch } from '@/components/ui/switch';
import InlineGloss from './InlineGloss';
import type { AnnotationReadingMode } from '../types/annotation';

export type AnnotationPhase = 'working' | 'done';

interface AnalysisResultProps {
  tokens: TokenData[];
  fallbackText: string;
  phase: AnnotationPhase;
  readingMode: AnnotationReadingMode;
  onReadingModeChange: (mode: AnnotationReadingMode) => void;
  showPosColors: boolean;
  onShowPosColorsChange: (show: boolean) => void;
  onWordClick: (token: TokenData, index: number) => void;
  isDesktop: boolean;
  wordDetail: WordDetail | null;
  isWordDetailLoading: boolean;
  isWordDetailStreaming: boolean;
  onOpenWordDetails: () => void;
  onEdit: () => void;
  selectedIndex: number | null;
}

function Toggle({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return <Switch checked={on} onCheckedChange={onChange} aria-label={ariaLabel} />;
}

const PUNCTUATION_ONLY_RE = /^[\s。、，,.!?？！:：;；「」『』（）()[\]【】〈〉《》…・･〜～\-—―]+$/;
const READING_MODE_OPTIONS: ReadonlyArray<{ value: AnnotationReadingMode; label: string }> = [
  { value: 'none', label: '無' },
  { value: 'furigana', label: '假名' },
  { value: 'romaji', label: '罗马音' },
];

function isPunctuationToken(token: TokenData): boolean {
  const pos = token.pos || '';
  return pos.includes('記号')
    || pos.includes('標点')
    || pos.includes('标点')
    || pos.includes('句読点')
    || pos.includes('符号')
    || PUNCTUATION_ONLY_RE.test(token.word);
}

function getShortPos(pos: string): string {
  const normalized = normalizePosBase(pos);
  const shortLabels: Record<string, string> = {
    名詞: '名',
    代名詞: '名',
    動詞: '動',
    形容詞: '形',
    形容動詞: '形動',
    形状詞: '形動',
    副詞: '副',
    連体詞: '連体',
    接続詞: '接',
    感動詞: '感',
    助詞: '助',
    助動詞: '助動',
  };

  return shortLabels[normalized] || normalized.slice(0, 3);
}

export default function AnalysisResult({
  tokens,
  fallbackText,
  phase,
  readingMode,
  onReadingModeChange,
  showPosColors,
  onShowPosColorsChange,
  onWordClick,
  isDesktop,
  wordDetail,
  isWordDetailLoading,
  isWordDetailStreaming,
  onOpenWordDetails,
  onEdit,
  selectedIndex,
}: AnalysisResultProps) {
  const annotatedRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const glossRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const annotated = annotatedRef.current;
    if (!annotated || phase !== 'working' || tokens.length === 0) return;

    const moveBrush = () => {
      const lastToken = [...tokenRefs.current].reverse().find(Boolean);
      if (!lastToken) return;

      const word = lastToken.querySelector<HTMLElement>('.annotation-word');
      const tokenRect = (word || lastToken).getBoundingClientRect();
      const containerRect = annotated.getBoundingClientRect();
      const x = tokenRect.right - containerRect.left + 1;
      const y = tokenRect.top - containerRect.top + tokenRect.height * 0.28;
      annotated.style.setProperty('--brush-x', `${x}px`);
      annotated.style.setProperty('--brush-y', `${y}px`);
      annotated.dataset.brushReady = 'true';
    };

    const frame = requestAnimationFrame(moveBrush);
    window.addEventListener('resize', moveBrush);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', moveBrush);
    };
  }, [phase, tokens]);

  useLayoutEffect(() => {
    const annotated = annotatedRef.current;
    const gloss = glossRef.current;
    const token = selectedIndex === null ? null : tokenRefs.current[selectedIndex];

    if (!annotated || !gloss || !token || !isDesktop || phase !== 'done') {
      if (annotated) {
        annotated.style.lineHeight = '';
        annotated.style.paddingBottom = '';
      }
      if (gloss) gloss.classList.remove('is-positioned');
      return;
    }

    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let frame = 0;
    let settled = false;

    const placeGloss = () => {
      if (settled) return;
      settled = true;
      const word = token.querySelector<HTMLElement>('.annotation-word');
      const wordRect = (word || token).getBoundingClientRect();
      const containerRect = annotated.getBoundingClientRect();
      const left = Math.max(0, wordRect.left - containerRect.left);
      const glossWidth = Math.max(1, Math.min(300, containerRect.width - left));
      const top = wordRect.bottom - containerRect.top + 10;
      gloss.style.width = `${glossWidth}px`;
      annotated.style.setProperty('--gloss-x', `${left}px`);
      annotated.style.setProperty('--gloss-y', `${top}px`);
      gloss.classList.add('is-positioned');
    };

    const handleTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== annotated || event.propertyName !== 'line-height') return;
      annotated.removeEventListener('transitionend', handleTransitionEnd);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      frame = requestAnimationFrame(placeGloss);
    };

    gloss.classList.remove('is-positioned');
    gloss.style.width = '';
    annotated.style.paddingBottom = '0';
    annotated.style.lineHeight = '3.05';
    void annotated.offsetHeight;

    const tokenWord = token.querySelector<HTMLElement>('.annotation-word');
    const tokenRect = (tokenWord || token).getBoundingClientRect();
    const glossHeight = gloss.getBoundingClientRect().height;
    const annotationFontSize = Number.parseFloat(window.getComputedStyle(annotated).fontSize) || 20;
    const maxTokenBottom = tokenRefs.current.reduce((maxBottom, currentToken) => {
      if (!currentToken) return maxBottom;
      const currentWord = currentToken.querySelector<HTMLElement>('.annotation-word');
      return Math.max(maxBottom, (currentWord || currentToken).getBoundingClientRect().bottom);
    }, tokenRect.bottom);
    const isLastLine = maxTokenBottom - tokenRect.bottom < tokenRect.height * 0.5;

    if (isLastLine) {
      annotated.style.paddingBottom = `${Math.ceil(glossHeight + 24)}px`;
      frame = requestAnimationFrame(placeGloss);
    } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      annotated.style.lineHeight = `${Math.ceil(Math.max(annotationFontSize * 4.5, glossHeight + 44))}px`;
      frame = requestAnimationFrame(placeGloss);
    } else {
      annotated.addEventListener('transitionend', handleTransitionEnd);
      annotated.style.lineHeight = `${Math.ceil(Math.max(annotationFontSize * 4.5, glossHeight + 44))}px`;
      fallbackTimer = setTimeout(() => {
        annotated.removeEventListener('transitionend', handleTransitionEnd);
        frame = requestAnimationFrame(placeGloss);
      }, 450);
    }

    const reposition = () => {
      settled = false;
      frame = requestAnimationFrame(placeGloss);
    };
    window.addEventListener('resize', reposition);

    return () => {
      window.removeEventListener('resize', reposition);
      annotated.removeEventListener('transitionend', handleTransitionEnd);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      cancelAnimationFrame(frame);
      gloss.classList.remove('is-positioned');
    };
  }, [isDesktop, phase, readingMode, selectedIndex, tokens]);

  return (
    <div className="annotation-state">
      <div
        ref={annotatedRef}
        id="analyzedSentenceOutput"
        className={`annotated-text ${phase === 'working' ? 'is-working' : 'is-done'} ${readingMode === 'none' ? 'is-reading-hidden' : 'is-reading-visible'}`}
        lang="ja"
        onDoubleClick={phase === 'done' ? onEdit : undefined}
        aria-live={phase === 'working' ? 'polite' : undefined}
      >
        {tokens.length === 0 ? (
          <span className="annotation-fallback">{fallbackText}</span>
        ) : tokens.map((token, index) => {
          if (token.pos === '改行') {
            return <br key={`break-${index}`} />;
          }

          const isPunct = isPunctuationToken(token);
          const previousToken = tokens[index - 1];
          const nextToken = tokens[index + 1];
          const isAfterPunct = Boolean(previousToken && previousToken.pos !== '改行' && isPunctuationToken(previousToken));
          const isBeforePunct = Boolean(nextToken && nextToken.pos !== '改行' && isPunctuationToken(nextToken));
          const isActive = phase === 'done' && selectedIndex === index;
          const hasFurigana = Boolean(
            token.furigana
            && token.furigana !== token.word
            && containsKanji(token.word)
            && !isPunct
          );
          const hasRomaji = Boolean(
            token.romaji
            && token.romaji.toLocaleLowerCase() !== token.word.toLocaleLowerCase()
            && !isPunct
          );
          const readingText = readingMode === 'furigana' && hasFurigana
            ? token.furigana || ''
            : readingMode === 'romaji' && hasRomaji
              ? token.romaji || ''
              : '';
          const tokenColorClass = showPosColors ? getPosClass(token.pos) : '';

          return (
            <span
              key={`${index}-${token.word}`}
              ref={(element) => { tokenRefs.current[index] = element; }}
              className={`annotation-token is-inked ${isPunct ? 'is-punct' : ''} ${isAfterPunct ? 'is-after-punct' : ''} ${isBeforePunct ? 'is-before-punct' : ''} ${isActive ? 'is-active' : ''} ${tokenColorClass}`}
              onClick={phase === 'done' && !isPunct ? () => onWordClick(token, index) : undefined}
              role={phase === 'done' && !isPunct ? 'button' : undefined}
              tabIndex={phase === 'done' && !isPunct ? 0 : undefined}
              onKeyDown={phase === 'done' && !isPunct ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onWordClick(token, index);
                }
              } : undefined}
            >
              {readingText ? (
                <ruby className="annotation-ruby">
                  <span className="annotation-word">
                    {token.word}
                    <span className="annotation-underline" />
                  </span>
                  <rt className={`annotation-reading ${readingMode === 'romaji' ? 'is-romaji' : 'is-kana'}`}>
                    {readingText}
                  </rt>
                </ruby>
              ) : (
                <span className="annotation-word">
                  {token.word}
                  {!isPunct && <span className="annotation-underline" />}
                </span>
              )}
              {!isPunct && (
                <span className="annotation-pos">〔{getShortPos(token.pos)}〕</span>
              )}
            </span>
          );
        })}

        {phase === 'working' && tokens.length > 0 && (
          <span className="annotation-brush" aria-hidden="true" />
        )}

        {phase === 'done' && isDesktop && selectedIndex !== null && tokens[selectedIndex] && (
          <div ref={glossRef} className="annotation-gloss-anchor">
            <InlineGloss
              furigana={tokens[selectedIndex].furigana || tokens[selectedIndex].word}
              pos={getShortPos(tokens[selectedIndex].pos)}
              meaning={wordDetail?.chineseTranslation || ''}
              loading={isWordDetailLoading || isWordDetailStreaming || !wordDetail}
              visible
              onOpenDetails={onOpenWordDetails}
            />
          </div>
        )}
      </div>

      {phase === 'done' && (
        <div className="annotation-options" lang="zh-CN">
          <span className="annotation-hint">点击词汇查看详细解释 · 双击原文重新编辑</span>
          <div className="annotation-toggles">
            <fieldset className="annotation-reading-control" aria-label="注音显示方式">
              <legend>注音：</legend>
              {READING_MODE_OPTIONS.map((option) => (
                <label key={option.value} className="annotation-reading-choice">
                  <input
                    type="radio"
                    name="annotation-reading-mode"
                    value={option.value}
                    checked={readingMode === option.value}
                    onChange={() => onReadingModeChange(option.value)}
                  />
                  <span className="annotation-radio-mark" aria-hidden="true" />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <Toggle on={showPosColors} onChange={onShowPosColorsChange} ariaLabel="词性着色" />
              <span>品詞着色</span>
            </label>
          </div>
        </div>
      )}

      {phase === 'done' && showPosColors && (
        <div className="annotation-legend" lang="zh-CN" aria-label="词性颜色图例">
          {POS_LEGEND_GROUPS.map((group) => (
            <span key={group}>
              <i style={{ background: POS_GROUP_COLORS[group] }} />
              {POS_GROUP_LABELS[group]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
