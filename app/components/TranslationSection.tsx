'use client';

import { useState, useEffect } from 'react';
import { translateText, streamTranslateText } from '../services/api';
import ThinkingIndicator from './ThinkingIndicator';

interface TranslationSectionProps {
  japaneseText: string;
  userApiKey?: string;
  userApiUrl?: string;
  useStream?: boolean;
  trigger?: number;
}

function SentenceTranslateIcon({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <span className="sentence-translate-icon sentence-translate-icon-loading" aria-hidden="true">
        <span className="thinking-dot"></span>
        <span className="thinking-dot"></span>
        <span className="thinking-dot"></span>
      </span>
    );
  }

  return (
    <span className="sentence-translate-icon" aria-hidden="true">
      <svg viewBox="0 0 36 36" role="img" focusable="false">
        <rect className="translate-icon-card translate-icon-card-back" x="3.75" y="7.25" width="15.5" height="18" rx="4.5" />
        <rect className="translate-icon-card translate-icon-card-front" x="16.75" y="10.75" width="15.5" height="18" rx="4.5" />
        <path className="translate-icon-line translate-icon-line-back" d="M8.5 14.5h5.75M8.5 18.25h7.5M8.5 22h4.75" />
        <path className="translate-icon-line translate-icon-line-front" d="M21.5 17.75h5.75M21.5 21.5H29M21.5 25.25h4.75" />
        <path className="translate-icon-arrow" d="M14.75 12.25c3.7 0 6.7 2.26 7.85 5.45M22.6 17.7l-3.05-.38 1.55-2.65" />
        <circle className="translate-icon-dot" cx="11.5" cy="11.75" r="1.65" />
        <circle className="translate-icon-dot translate-icon-dot-front" cx="24.5" cy="15.25" r="1.65" />
      </svg>
    </span>
  );
}

export default function TranslationSection({
  japaneseText,
  userApiKey,
  userApiUrl,
  useStream = true, // 默认为true，保持向后兼容
  trigger
}: TranslationSectionProps) {
  const [translation, setTranslation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const handleTranslate = async () => {
    if (!japaneseText) {
      alert('请先输入或分析日语句子！');
      return;
    }

    setIsLoading(true);
    setIsVisible(true); // 确保显示翻译区域
    setTranslation(''); // 清空之前的翻译结果

    try {
      if (useStream) {
        // 使用流式API进行翻译
        streamTranslateText(
          japaneseText,
          (chunk, isDone) => {
            setTranslation(chunk);
            if (isDone) {
              setIsLoading(false);
            }
          },
          (error) => {
            console.error('Error during streaming translation:', error);
            setTranslation(`翻译时发生错误: ${error.message || '未知错误'}。`);
            setIsLoading(false);
          },
          userApiKey,
          userApiUrl
        );
      } else {
        // 使用传统API进行翻译
        const translatedText = await translateText(japaneseText, userApiKey, userApiUrl);
        setTranslation(translatedText);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error during full sentence translation:', error);
      setTranslation(`翻译时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`);
      setIsLoading(false);
    }
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  // 当trigger变化时自动开始翻译
  useEffect(() => {
    if (trigger && japaneseText) {
      handleTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <div id="fullTranslationCard" className="premium-card mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-3">
        <h2 className="text-2xl font-semibold text-gray-700">全文翻译 (中)</h2>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <button
            id="translateSentenceButton"
            className="sentence-translate-button w-full sm:w-auto"
            onClick={handleTranslate}
            disabled={isLoading}
          >
            <SentenceTranslateIcon isLoading={isLoading} />
            <span className="sentence-translate-label">{isLoading ? 'Thinking' : '翻译整句'}</span>
          </button>
          <button
            id="toggleFullTranslationButton"
            className="premium-button premium-button-outlined text-sm px-3 py-1"
            onClick={toggleVisibility}
          >
            {isVisible ? '隐藏' : '显示'}
          </button>
        </div>
      </div>

      {isVisible && (
        <div id="fullTranslationOutput" className="text-gray-800 p-3 bg-gray-50 rounded-lg min-h-[50px] whitespace-pre-wrap">
          {isLoading && !translation ? (
            <ThinkingIndicator />
          ) : (
            translation
          )}
        </div>
      )}
    </div>
  );
}
