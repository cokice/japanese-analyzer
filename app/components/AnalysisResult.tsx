'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { containsKanji, getPosClass, getPosGroup, POS_GROUP_COLORS, POS_GROUP_LABELS, POS_LEGEND_GROUPS } from '../utils/helpers';
import { TokenData } from '../services/api';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { Switch } from '@/components/ui/switch';
import { groupReadingTokens } from '../utils/readingLayout';

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
  const { t } = useLanguage();
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const presentPosGroups = new Set(tokens
    .filter((token) => token.pos !== '改行' && !isPunctuationToken(token))
    .map((token) => getPosGroup(token.pos)));
  const legendGroups = [...POS_LEGEND_GROUPS, 'o' as const].filter((group) => presentPosGroups.has(group));

  return (
    <section className="analysis-card relative">
      {/* 标题行 */}
      <div className="analysis-heading mb-4 flex flex-wrap items-center gap-y-2">
        <h2 className="m-0 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>{t("解析结果")}</h2>
        <div className="flex-1" />
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
      </div>

      <AutoAnimateHeight duration={300}>
        {/* 分词结果 */}
        <div
          id="analyzedSentenceOutput"
          lang="ja"
          role="region"
          aria-label={t("日文解析正文")}
          tabIndex={0}
          data-furigana={showFurigana}
          data-romaji={showRomaji}
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
                          aria-pressed={isActive}
                          onClick={() => onWordClick(token, index)}
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
        </div>
      </AutoAnimateHeight>

      <div className="analysis-footer">
        {/* 提示 */}
        <div className="analysis-hint">
          {t("点击词汇查看释义")}
        </div>

        {/* 词性图例 */}
        <div className="pos-legend">
          {legendGroups.map((g) => (
            <span key={g} className="legend-item">
              <span className="legend-swatch" style={{ background: POS_GROUP_COLORS[g] }} />
              {t(POS_GROUP_LABELS[g])}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
