'use client';

import { containsKanji, getPosClass, POS_GROUP_COLORS, POS_GROUP_LABELS, POS_LEGEND_GROUPS } from '../utils/helpers';
import { TokenData } from '../services/api';
import { Icon } from './Icons';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { Switch } from '@/components/ui/switch';

interface AnalysisResultProps {
  tokens: TokenData[];
  showFurigana: boolean;
  onShowFuriganaChange: (show: boolean) => void;
  showRomaji: boolean;
  onShowRomajiChange: (show: boolean) => void;
  onWordClick: (token: TokenData, index: number) => void;
  selectedIndex: number | null;
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

export default function AnalysisResult({
  tokens,
  showFurigana,
  onShowFuriganaChange,
  showRomaji,
  onShowRomajiChange,
  onWordClick,
  selectedIndex,
}: AnalysisResultProps) {
  if (!tokens || tokens.length === 0) {
    return null;
  }

  return (
    <section className="nd-card relative">
      {/* 标题行 */}
      <div className="mb-4 flex flex-wrap items-center gap-y-2">
        <span className="mr-2 grid place-items-center" style={{ color: 'var(--primary)' }}>
          {Icon.book}
        </span>
        <h2 className="m-0 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>解析结果</h2>
        <div className="flex-1" />
        <div className="flex items-center gap-4 sm:gap-[18px]">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>显示假名</span>
            <Toggle on={showFurigana} onChange={onShowFuriganaChange} ariaLabel="显示假名" />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>显示罗马音</span>
            <Toggle on={showRomaji} onChange={onShowRomajiChange} ariaLabel="显示罗马音" />
          </label>
        </div>
      </div>

      <AutoAnimateHeight duration={300}>
        {/* 分词结果 */}
        <div id="analyzedSentenceOutput" lang="ja">
          {tokens.map((token, index) => {
            if (token.pos === '改行') {
              return <span key={index} style={{ flexBasis: '100%', height: 0 }} />;
            }

            const isPunct = isPunctuationToken(token);
            const isActive = selectedIndex === index;
            const hasFurigana = !!token.furigana
              && token.furigana !== token.word
              && containsKanji(token.word)
              && !isPunct;
            const furiganaText = hasFurigana ? token.furigana! : '';

            return (
              <span
                key={index}
                className={`word-unit-wrapper ${isPunct ? 'is-punct' : ''} ${isActive ? 'active-unit' : ''}`}
              >
                {!isPunct && (
                  <span className="furigana-text" style={{ opacity: showFurigana && furiganaText ? 1 : 0 }}>
                    {furiganaText || '\u00a0'}
                  </span>
                )}
                <span
                  className={`word-token ${isPunct ? 'no-click' : ''}`}
                  onClick={isPunct ? undefined : () => onWordClick(token, index)}
                >
                  {token.word}
                </span>

                {/* 词性下划线 */}
                {!isPunct && <span className={`pos-underline ${getPosClass(token.pos)}`} />}

                {/* 罗马音 */}
                {!isPunct && (
                  <span className="romaji-text" style={{ opacity: showRomaji ? 1 : 0 }}>
                    {token.romaji || '\u00a0'}
                  </span>
                )}

              </span>
            );
          })}
        </div>
      </AutoAnimateHeight>

      <div className="analysis-footer">
        {/* 提示 */}
        <div className="analysis-hint">
          <span className="grid place-items-center" style={{ color: 'var(--primary)' }}>{Icon.bulb}</span>
          点击词汇查看详细解释。
        </div>

        {/* 词性图例 */}
        <div className="pos-legend">
          {POS_LEGEND_GROUPS.map((g) => (
            <span key={g} className="legend-item">
              <span className="legend-swatch" style={{ background: POS_GROUP_COLORS[g] }} />
              {POS_GROUP_LABELS[g]}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
