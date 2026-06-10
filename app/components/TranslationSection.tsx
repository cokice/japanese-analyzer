'use client';

import { useState, useEffect } from 'react';
import { translateText, streamTranslateText } from '../services/api';
import type { AIProvider } from '../services/api';
import ThinkingIndicator from './ThinkingIndicator';
import { Icon } from './Icons';

interface TranslationSectionProps {
  japaneseText: string;
  userApiKey?: string;
  userApiUrl?: string;
  aiProvider: AIProvider;
  useStream?: boolean;
  trigger?: number;
}

export default function TranslationSection({
  japaneseText,
  userApiKey,
  userApiUrl,
  aiProvider,
  useStream = true, // 默认为true，保持向后兼容
  trigger
}: TranslationSectionProps) {
  const [translation, setTranslation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [copied, setCopied] = useState(false);

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
          userApiUrl,
          aiProvider
        );
      } else {
        // 使用传统API进行翻译
        const translatedText = await translateText(japaneseText, userApiKey, userApiUrl, aiProvider);
        setTranslation(translatedText);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error during full sentence translation:', error);
      setTranslation(`翻译时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`);
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!translation) return;
    navigator.clipboard?.writeText(translation).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
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
    <section id="fullTranslationCard" className="nd-card">
      <div className="mb-3 flex items-center">
        <h2 className="m-0 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>全文翻译（中）</h2>
        <div className="flex-1" />
        <button
          id="translateSentenceButton"
          className="nd-soft-btn"
          onClick={handleTranslate}
          disabled={isLoading}
        >
          {Icon.copy}
          <span>{isLoading ? 'Thinking…' : '翻译整句'}</span>
        </button>
      </div>

      {isVisible && (
        <>
          {isLoading && !translation ? (
            <ThinkingIndicator />
          ) : (
            <p
              className="mb-3.5 mt-1 whitespace-pre-wrap text-[16px] leading-7"
              style={{ color: 'var(--ink)', letterSpacing: '0.2px' }}
            >
              {translation || <span style={{ color: 'var(--ink-3)' }}>解析后将自动翻译整句。</span>}
            </p>
          )}
        </>
      )}

      <div className="flex items-center">
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="nd-ghost-btn"
          style={copied ? { color: 'var(--primary)' } : undefined}
          disabled={!translation}
        >
          {Icon.copy}<span>{copied ? '已复制' : '复制'}</span>
        </button>
        <button
          id="toggleFullTranslationButton"
          className="nd-ghost-btn"
          onClick={toggleVisibility}
        >
          <span>{isVisible ? '隐藏' : '显示'}</span>
        </button>
      </div>
    </section>
  );
}
