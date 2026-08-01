'use client';

import { useLayoutEffect, useRef } from 'react';
import type { TokenData } from '../services/api';
import {
  containsKanji,
  getPosClass,
  normalizePosBase,
  POS_GROUP_COLORS,
  POS_GROUP_LABELS,
  POS_LEGEND_GROUPS,
} from '../utils/helpers';
import { Switch } from '@/components/ui/switch';

export type AnnotationPhase = 'working' | 'done';

interface AnalysisResultProps {
  tokens: TokenData[];
  fallbackText: string;
  phase: AnnotationPhase;
  showFurigana: boolean;
  onShowFuriganaChange: (show: boolean) => void;
  showRomaji: boolean;
  onShowRomajiChange: (show: boolean) => void;
  showPosColors: boolean;
  onShowPosColorsChange: (show: boolean) => void;
  onWordClick: (token: TokenData, index: number) => void;
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
  showFurigana,
  onShowFuriganaChange,
  showRomaji,
  onShowRomajiChange,
  showPosColors,
  onShowPosColorsChange,
  onWordClick,
  onEdit,
  selectedIndex,
}: AnalysisResultProps) {
  const annotatedRef = useRef<HTMLDivElement>(null);
  const tokenRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useLayoutEffect(() => {
    const annotated = annotatedRef.current;
    if (!annotated || phase !== 'working' || tokens.length === 0) return;

    const moveBrush = () => {
      const lastToken = [...tokenRefs.current].reverse().find(Boolean);
      if (!lastToken) return;

      const tokenRect = lastToken.getBoundingClientRect();
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

  return (
    <div className="annotation-state">
      <div
        ref={annotatedRef}
        id="analyzedSentenceOutput"
        className={`annotated-text ${phase === 'working' ? 'is-working' : 'is-done'}`}
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
          const isActive = phase === 'done' && selectedIndex === index;
          const hasFurigana = Boolean(
            token.furigana
            && token.furigana !== token.word
            && containsKanji(token.word)
            && !isPunct
          );
          const tokenColorClass = showPosColors ? getPosClass(token.pos) : '';

          return (
            <span
              key={`${index}-${token.word}`}
              ref={(element) => { tokenRefs.current[index] = element; }}
              className={`annotation-token is-inked ${isPunct ? 'is-punct' : ''} ${isActive ? 'is-active' : ''} ${tokenColorClass}`}
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
              {!isPunct && (
                <span className={`annotation-furi ${showFurigana && hasFurigana ? '' : 'is-hidden'}`}>
                  {hasFurigana ? token.furigana : '\u00a0'}
                </span>
              )}
              <span className="annotation-word">{token.word}</span>
              {!isPunct && (
                <>
                  <span className="annotation-pos">〔{getShortPos(token.pos)}〕</span>
                  <span className="annotation-underline" />
                  <span className={`annotation-romaji ${showRomaji ? '' : 'is-hidden'}`}>
                    {token.romaji || '\u00a0'}
                  </span>
                </>
              )}
            </span>
          );
        })}

        {phase === 'working' && tokens.length > 0 && (
          <span className="annotation-brush" aria-hidden="true" />
        )}
      </div>

      {phase === 'done' && (
        <div className="annotation-options" lang="zh-CN">
          <span className="annotation-hint">点击词汇查看详细解释 · 双击原文重新编辑</span>
          <div className="annotation-toggles">
            <label>
              <Toggle on={showFurigana} onChange={onShowFuriganaChange} ariaLabel="显示假名" />
              <span>假名</span>
            </label>
            <label>
              <Toggle on={showRomaji} onChange={onShowRomajiChange} ariaLabel="显示罗马音" />
              <span>罗马音</span>
            </label>
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
