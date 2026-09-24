'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { containsKanji, getPosClass, getPosGroup, POS_GROUP_COLORS, POS_GROUP_LABELS, POS_LEGEND_GROUPS } from '../utils/helpers';
import { TokenData } from '../services/api';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { Switch } from '@/components/ui/switch';
import { groupPendingChars, groupReadingTokens } from '../utils/readingLayout';
import { isPunctuationToken, type PhraseRange } from '../utils/phraseRange';
import { usePhraseSelection } from '../hooks/usePhraseSelection';

interface AnalysisResultProps {
  tokens: TokenData[];
  showFurigana: boolean;
  onShowFuriganaChange: (show: boolean) => void;
  showRomaji: boolean;
  onShowRomajiChange: (show: boolean) => void;
  onWordClick: (token: TokenData, index: number) => void;
  selectedIndex: number | null;
  /** 阅读态下开关由页面放在工具行里，这里不再重复显示 */
  showDisplayOptions?: boolean;
  /** 解析中：原句里还没解析到的部分，接在已解析的词后面以灰字流光显示 */
  pendingText?: string;
  /** 当前圈选的多词短语 */
  selectedRange?: PhraseRange | null;
  /** 圈选了多个词（拖动 / Shift 点击 / 长按后再点）；未提供则不支持圈选 */
  onRangeSelect?: (a: number, b: number) => void;
  /** 圈选起点：设置后再点一个词即选中这一段 */
  pickAnchor?: number | null;
  onPickAnchorChange?: (index: number | null) => void;
}

const noop = () => {};

/** 圈选状态下浮在屏幕底部的提示；顺带教用户下次可以直接拖动或长按 */
function PickHint({ onCancel }: { onCancel: () => void }) {
  const { t } = useLanguage();
  const [shortcut, setShortcut] = useState('');
  useEffect(() => {
    setShortcut(window.matchMedia('(pointer: coarse)').matches
      ? t("下次也可以直接长按词语开始选")
      : t("下次也可以直接拖过几个词"));
  }, [t]);
  return (
    <div className="range-pick-toast" role="status">
      <span className="range-pick-toast-text">
        <strong>{t("再点一个词，选中这一段")}</strong>
        {shortcut && <span>{shortcut}</span>}
      </span>
      <button type="button" className="nd-ghost-btn" onClick={onCancel}>{t("取消")}</button>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <Switch checked={on} onCheckedChange={onChange} aria-label={ariaLabel} />
  );
}

export function DisplayOptions({
  showFurigana,
  onShowFuriganaChange,
  showRomaji,
  onShowRomajiChange,
  variant = 'switch',
}: Pick<AnalysisResultProps, 'showFurigana' | 'onShowFuriganaChange' | 'showRomaji' | 'onShowRomajiChange'> & {
  /** chips：阅读态胶囊里用的紧凑标签样式 */
  variant?: 'switch' | 'chips';
}) {
  const { t } = useLanguage();
  if (variant === 'chips') {
    return (
      <div className="display-chips">
        <button type="button" className="display-chip" aria-pressed={showFurigana} aria-label={t("显示假名")} onClick={() => onShowFuriganaChange(!showFurigana)}>
          {t("假名")}
        </button>
        <button type="button" className="display-chip" aria-pressed={showRomaji} aria-label={t("显示罗马音")} onClick={() => onShowRomajiChange(!showRomaji)}>
          {t("罗马音")}
        </button>
      </div>
    );
  }
  return (
    <div className="analysis-display-options flex items-center gap-4 sm:gap-[18px]">
      <label className="inline-flex cursor-pointer items-center gap-2">
        <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{t("假名")}</span>
        <Toggle on={showFurigana} onChange={onShowFuriganaChange} ariaLabel={t("显示假名")} />
      </label>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>{t("罗马音")}</span>
        <Toggle on={showRomaji} onChange={onShowRomajiChange} ariaLabel={t("显示罗马音")} />
      </label>
    </div>
  );
}

// 超过这个长度的待解析文字不再逐字加动画，避免长文一次渲染过多节点
const PENDING_ANIMATED_CHARS = 600;
// 光带沿阅读顺序移动的速度（px/秒），以及读完一遍后的停顿
const SCAN_SPEED_PX_PER_S = 420;
const SCAN_PAUSE_MS = 700;

function PendingText({ text, offset }: { text: string; offset: number }) {
  const chars = Array.from(text);
  const containerRef = useRef<HTMLSpanElement>(null);

  const totalRef = useRef(0);

  // 流光：一束光沿阅读顺序连续移动，每个字的亮度由它与光带的距离在 CSS 里连续计算（见 .is-pending）。
  // 位置按整句算（已解析的词也占位），各行首尾相接；解析推进时剩余字的位置基本不变，光带不会跳回开头。
  useLayoutEffect(() => {
    const container = containerRef.current;
    const host = container?.parentElement;
    if (!container || !host) return;

    const measure = () => {
      let lineTop: number | null = null;
      let lineLeft = 0;
      let lineStart = 0;
      let lineEnd = 0;
      host.querySelectorAll<HTMLElement>('.word-unit-wrapper').forEach((unit) => {
        const rect = unit.getBoundingClientRect();
        // 换行：各行首尾相接，下一行的位置接在上一行末尾之后
        if (lineTop === null || Math.abs(rect.top - lineTop) > rect.height / 2) {
          lineStart += lineEnd;
          lineTop = rect.top;
          lineLeft = rect.left;
          lineEnd = 0;
        }
        lineEnd = Math.max(lineEnd, rect.right - lineLeft);
        if (unit.classList.contains('is-pending')) {
          unit.style.setProperty('--pos', String(Math.round(lineStart + rect.left - lineLeft + rect.width / 2)));
        }
      });
      totalRef.current = lineStart + lineEnd;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [text]);

  // 光带只在挂载时启动一次，逐帧推进 --scan；读完一遍停顿后再来
  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let passStart = performance.now();
    const tick = (now: number) => {
      const passMs = ((totalRef.current + 240) / SCAN_SPEED_PX_PER_S) * 1000;
      const elapsed = now - passStart;
      if (elapsed >= passMs + SCAN_PAUSE_MS) passStart = now;
      const scan = elapsed < passMs ? (elapsed / 1000) * SCAN_SPEED_PX_PER_S - 120 : -99999;
      container.style.setProperty('--scan', String(Math.round(scan)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    // display: contents 让这些字仍直接参与外层 flex 排版
    <span ref={containerRef} className="contents">
      {groupPendingChars(chars.slice(0, PENDING_ANIMATED_CHARS)).map((group) => {
        // 以字符在整句中的位置作 key：前面的字被解析掉时，后面的字节点保持不变
        const groupKey = offset + group[0].index;
        if (group[0].char === '\n') return <span key={groupKey} className="reading-paragraph-break" />;
        return (
          <span key={groupKey} className="reading-word-group">
            {group.map(({ char, index }) => (
              <span key={offset + index} className="word-unit-wrapper is-pending">
                <span className="furigana-text">{'\u00a0'}</span>
                <span className="word-token">{char === ' ' ? '\u00a0' : char}</span>
                <span className="pos-underline" />
                <span className="romaji-text">{'\u00a0'}</span>
              </span>
            ))}
          </span>
        );
      })}
      {chars.length > PENDING_ANIMATED_CHARS && (
        <span className="pending-rest">{chars.slice(PENDING_ANIMATED_CHARS).join('')}</span>
      )}
    </span>
  );
}

export default function AnalysisResult({
  tokens,
  showFurigana,
  onShowFuriganaChange,
  showRomaji,
  onShowRomajiChange,
  onWordClick,
  selectedIndex,
  showDisplayOptions = true,
  pendingText = '',
  selectedRange = null,
  onRangeSelect,
  pickAnchor = null,
  onPickAnchorChange = noop,
}: AnalysisResultProps) {
  const { t } = useLanguage();
  const selection = usePhraseSelection({
    // 解析进行中不支持圈选
    onRangeSelect: pendingText ? undefined : onRangeSelect,
    anchorIndex: selectedIndex ?? selectedRange?.start ?? null,
    pickAnchor,
    onPickAnchorChange,
  });
  if ((!tokens || tokens.length === 0) && !pendingText) {
    return null;
  }
  const analyzedLength = tokens.reduce((length, token) => length + Array.from(token.word).length, 0);
  const presentPosGroups = new Set(tokens
    .filter((token) => token.pos !== '改行' && !isPunctuationToken(token))
    .map((token) => getPosGroup(token.pos)));
  const legendGroups = [...POS_LEGEND_GROUPS, 'o' as const].filter((group) => presentPosGroups.has(group));
  // 拖动中显示预览选区，否则显示已选中的短语
  const highlightRange = selection.preview ?? selectedRange;

  return (
    <section className="analysis-card relative">
      <h2 className="sr-only">{t("解析结果")}</h2>

      {showDisplayOptions && (
        <div className="analysis-heading mb-4 flex flex-wrap items-center justify-end gap-y-2">
          <DisplayOptions
            showFurigana={showFurigana}
            onShowFuriganaChange={onShowFuriganaChange}
            showRomaji={showRomaji}
            onShowRomajiChange={onShowRomajiChange}
          />
        </div>
      )}

      {/* 高度动画容器会裁掉溢出内容，外框多留一圈空间，选中高亮和焦点框不被切 */}
      <AutoAnimateHeight duration={300} className="analysis-output-frame" contentClassName="analysis-output-frame-content">
        {/* 分词结果 */}
        <div
          id="analyzedSentenceOutput"
          lang="ja"
          role="region"
          aria-label={t("日文解析正文")}
          tabIndex={0}
          data-furigana={showFurigana}
          data-romaji={showRomaji}
          data-selecting={selection.preview !== null || pickAnchor !== null}
          {...selection.containerProps}
        >
          {groupReadingTokens(tokens).map((group) => {
            if (group[0].token.pos === '改行') {
              return <span key={group[0].index} className="reading-paragraph-break" />;
            }
            return (
              <span className="reading-word-group" key={group[0].index}>
                {group.map(({ token, index }) => {
                  const isPunct = isPunctuationToken(token);
                  const isActive = selectedIndex === index;
                  const inRange = !!highlightRange && index >= highlightRange.start && index <= highlightRange.end;
                  const rangeClass = inRange
                    ? ` in-range${index === highlightRange.start ? ' range-start' : ''}${index === highlightRange.end ? ' range-end' : ''}`
                    : '';
                  const hasFurigana = !!token.furigana
                    && token.furigana !== token.word
                    && containsKanji(token.word)
                    && !isPunct;
                  const furiganaText = hasFurigana ? token.furigana! : '';

                  return (
                    <span
                      key={index}
                      data-token-index={index}
                      className={`word-unit-wrapper ${isPunct ? 'is-punct' : ''} ${isActive ? 'active-unit' : ''}${rangeClass}${pickAnchor === index ? ' range-anchor' : ''}`}
                    >
                      {!isPunct && (
                        <span className="furigana-text" aria-hidden={!showFurigana || !furiganaText} style={{ opacity: showFurigana && furiganaText ? 1 : 0 }}>
                          {furiganaText || '\u00a0'}
                        </span>
                      )}
                      {isPunct ? (
                        <span className="word-token no-click">{token.word}</span>
                      ) : (
                        <button
                          type="button"
                          className="word-token"
                          aria-pressed={isActive || inRange}
                          onClick={() => {
                            if (!selection.handleTokenClick(index)) onWordClick(token, index);
                          }}
                        >
                          {token.word}
                        </button>
                      )}

                      {/* 词性下划线 */}
                      {!isPunct && <span className={`pos-underline ${getPosClass(token.pos)}`} />}

                      {/* 罗马音 */}
                      {!isPunct && (
                        <span className="romaji-text" aria-hidden={!showRomaji}>
                          {token.romaji || '\u00a0'}
                        </span>
                      )}

                    </span>
                  );
                })}
              </span>
            );
          })}
          {pendingText && <PendingText text={pendingText} offset={analyzedLength} />}
        </div>
        {pendingText && <span className="sr-only" role="status">{t("思考中")}</span>}
        {pickAnchor !== null && <PickHint onCancel={selection.cancelPick} />}
      </AutoAnimateHeight>

      {/* 词性图例：放在正文下方作注脚 */}
      {/* 始终渲染以预留高度：解析中还没有词性时为空，避免第一个词出来时把译文往下推 */}
      <div className="pos-legend" aria-hidden={legendGroups.length === 0}>
        {legendGroups.map((g) => (
          <span key={g} className="legend-item">
            <span className="legend-swatch" style={{ background: POS_GROUP_COLORS[g] }} />
            {t(POS_GROUP_LABELS[g])}
          </span>
        ))}
      </div>
    </section>
  );
}
