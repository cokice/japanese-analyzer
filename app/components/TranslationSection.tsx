'use client';

import { useState, useEffect, useMemo } from 'react';
import { translateText, streamTranslateText } from '../services/api';
import type { AIModelName, AIProvider } from '../services/api';
import ThinkingIndicator from './ThinkingIndicator';
import { FlowAnimatedMarkdown } from '@/components/ui/flow-animated-markdown';
import { escapeHtmlForMarkdown, preserveLineBreaksForMarkdown } from '../utils/markdown';

interface TranslationSectionProps {
  japaneseText: string;
  userApiKey?: string;
  aiProvider: AIProvider;
  aiModel: AIModelName;
  useStream?: boolean;
  trigger?: number;
}

export default function TranslationSection({
  japaneseText,
  userApiKey,
  aiProvider,
  aiModel,
  useStream = true, // 默认为true，保持向后兼容
  trigger
}: TranslationSectionProps) {
  const [translation, setTranslation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [canAnimateTranslation, setCanAnimateTranslation] = useState(false);

  useEffect(() => {
    import('flowtoken').catch(() => {});
  }, []);

  const handleTranslate = async () => {
    if (!japaneseText) {
      alert('请先输入或分析日语句子！');
      return;
    }

    setIsLoading(true);
    setIsVisible(true); // 确保显示翻译区域
    setCanAnimateTranslation(false);
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
          aiProvider,
          aiModel
        );
      } else {
        // 使用传统API进行翻译
        const translatedText = await translateText(japaneseText, userApiKey, aiProvider, aiModel);
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

  const animatedTranslation = useMemo(() => {
    return preserveLineBreaksForMarkdown(escapeHtmlForMarkdown(translation));
  }, [translation]);

  // 当trigger变化时自动开始翻译
  useEffect(() => {
    if (trigger && japaneseText) {
      handleTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  useEffect(() => {
    if (!translation) {
      setCanAnimateTranslation(false);
      return;
    }

    if (!isLoading || translation.length >= 16 || /[。！？.!?，,、\n]/.test(translation)) {
      setCanAnimateTranslation(true);
    }
  }, [isLoading, translation]);

  return (
    <section id="fullTranslationCard" className="translation-section" lang="zh-CN">
      <div className="section-label translation-heading">
        <span>全文訳(中)</span>
        <i className="section-label-rule" aria-hidden="true" />
        <button
          id="translateSentenceButton"
          className="translation-action-link"
          onClick={handleTranslate}
          disabled={isLoading}
        >
          {isLoading ? '翻訳中' : '再 訳'}
        </button>
      </div>

      {isVisible && (
        <div className="translation-body">
          {isLoading && !translation ? (
            <ThinkingIndicator label="翻訳中" />
          ) : translation ? (
            <div className="flow-markdown full-translation-markdown translation-copy">
              {canAnimateTranslation ? (
                <FlowAnimatedMarkdown
                  content={animatedTranslation}
                  animation="fadeIn"
                  sep="word"
                  animationDuration="0.35s"
                  animationTimingFunction="ease-out"
                />
              ) : (
                <span className="whitespace-pre-wrap">{translation}</span>
              )}
            </div>
          ) : (
            <p className="translation-copy is-placeholder">
              解析后将自动翻译。
            </p>
          )}
        </div>
      )}

      <div className="translation-footer">
        <button
          onClick={handleCopy}
          className="translation-action-link"
          style={copied ? { color: 'var(--primary)' } : undefined}
          disabled={!translation}
        >
          {copied ? '已複製' : '複 製'}
        </button>
        <button
          id="toggleFullTranslationButton"
          className="translation-action-link"
          onClick={toggleVisibility}
        >
          {isVisible ? '隱 藏' : '顯 示'}
        </button>
      </div>
    </section>
  );
}
