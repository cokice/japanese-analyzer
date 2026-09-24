'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { containsKanji, getPosClass } from '../utils/helpers';
import { getApiEndpoint } from '../services/api';
import {
  getFallbackDailySentence,
  getJstDateKey,
  type DailySentence as DailySentenceData,
} from '../utils/dailySentences';
import { Icon } from './Icons';

interface DailySentenceProps {
  onAnalyze: (text: string) => void;
  disabled?: boolean;
}

const DAILY_CACHE_KEY = 'japaneseAnalyzer:dailySentence:v1';
// 当天第一位访客要等服务端现场生成（两次模型调用），超时就先用备用句
const FETCH_TIMEOUT_MS = 25_000;

function isDailySentence(value: unknown): value is DailySentenceData {
  const v = value as DailySentenceData | null;
  return !!v && typeof v.text === 'string' && Array.isArray(v.tokens) && v.tokens.length > 0
    && typeof v.translation === 'object' && v.translation !== null;
}

function readCachedSentence(dateKey: string): DailySentenceData | null {
  try {
    const cached: unknown = JSON.parse(localStorage.getItem(DAILY_CACHE_KEY) || 'null');
    return isDailySentence(cached) && cached.date === dateKey ? cached : null;
  } catch {
    return null;
  }
}

/** 首页「今日一句」：用解析结果的样子展示一句日语，点击即解析 */
export default function DailySentence({ onAnalyze, disabled = false }: DailySentenceProps) {
  const { t, locale } = useLanguage();
  const [sentence, setSentence] = useState<DailySentenceData | null>(null);

  // 句子每天由服务端 AI 生成一次（日本时间零点换句）；浏览器按日期缓存，同一天再打开不再请求。
  // 未配置服务器密钥、生成失败或超时时，改用内置备用句。
  useEffect(() => {
    const dateKey = getJstDateKey();
    const cached = readCachedSentence(dateKey);
    if (cached) {
      setSentence(cached);
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    fetch(getApiEndpoint('/daily-sentence'), { signal: controller.signal })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: unknown) => {
        if (!isDailySentence(data)) throw new Error('invalid daily sentence');
        if (disposed) return;
        setSentence(data);
        try {
          localStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(data));
        } catch {
          // 存不了就每次打开重新取，服务端有缓存，代价很小
        }
      })
      .catch(() => {
        if (!disposed) setSentence(getFallbackDailySentence());
      })
      .finally(() => clearTimeout(timer));

    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  if (!sentence) {
    return (
      <div className="daily-sentence-placeholder" aria-hidden="true">
        <span className="daily-label">{t("今日一句")}</span>
        <span className="daily-skeleton daily-skeleton-lg" />
        <span className="daily-skeleton daily-skeleton-sm" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="daily-sentence"
      onClick={() => onAnalyze(sentence.text)}
      disabled={disabled}
      aria-label={`${t("解析这句")}：${sentence.text}`}
    >
      <span className="daily-label">
        {t("今日一句")}
        <span className="daily-go" aria-hidden="true">{Icon.arrowRight}</span>
      </span>
      <span className="daily-tokens" lang="ja" aria-hidden="true">
        {sentence.tokens.map((token, index) => {
          const isPunct = token.pos === '記号';
          const furigana = token.furigana && token.furigana !== token.word && containsKanji(token.word)
            ? token.furigana
            : ' ';
          return (
            <span key={index} className={`word-unit-wrapper ${isPunct ? 'is-punct' : ''}`}>
              {!isPunct && <span className="furigana-text">{furigana}</span>}
              <span className="word-token no-click">{token.word}</span>
              {!isPunct && <span className={`pos-underline ${getPosClass(token.pos)}`} />}
            </span>
          );
        })}
      </span>
      <span className="daily-translation">{sentence.translation[locale] || sentence.translation['zh-CN']}</span>
    </button>
  );
}
