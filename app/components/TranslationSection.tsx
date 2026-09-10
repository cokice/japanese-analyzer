'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { translateText, streamTranslateText } from '../services/api';
import type { AIModelName, AIProvider } from '../services/api';
import ThinkingIndicator from './ThinkingIndicator';
import { Icon } from './Icons';
import { AutoAnimateHeight } from '@/components/ui/auto-animate-height';
import { FlowAnimatedMarkdown } from '@/components/ui/flow-animated-markdown';
import { escapeHtmlForMarkdown, preserveLineBreaksForMarkdown } from '../utils/markdown';

interface TranslationSectionProps {
  japaneseText: string;
  userApiKey?: string;
  aiProvider: AIProvider;
  aiModel: AIModelName;
  useStream?: boolean;
  trigger?: number;
  analysisSignal?: AbortSignal;
}

export default function TranslationSection({
  japaneseText,
  userApiKey,
  aiProvider,
  aiModel,
  useStream = true, // 默认为true，保持向后兼容
  trigger,
  analysisSignal
}: TranslationSectionProps) {
  const requestRef = useRef<AbortController | null>(null);
  const [translation, setTranslation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [canAnimateTranslation, setCanAnimateTranslation] = useState(false);

  useEffect(() => {
    import('flowtoken').catch(() => {});
  }, []);

  const handleTranslate = useCallback(async () => {
    if (!japaneseText) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const signal = analysisSignal && !analysisSignal.aborted
      ? AbortSignal.any([controller.signal, analysisSignal]) : controller.signal;
    const isCurrent = () => requestRef.current === controller && !signal.aborted;
    setIsLoading(true); setIsVisible(true); setCanAnimateTranslation(false); setTranslation('');
    try {
      if (useStream) {
        await streamTranslateText(japaneseText, (chunk) => {
          if (isCurrent()) setTranslation(chunk);
        }, (error) => {
          if (isCurrent()) setTranslation(`翻译时发生错误: ${error.message}。`);
        }, userApiKey, aiProvider, aiModel, signal);
      } else {
        const text = await translateText(japaneseText, userApiKey, aiProvider, aiModel, signal);
        if (isCurrent()) setTranslation(text);
      }
    } catch (error) {
      if (isCurrent()) setTranslation(`翻译时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`);
    } finally {
      if (requestRef.current === controller) {
        setIsLoading(false); requestRef.current = null;
      }
    }
  }, [japaneseText, userApiKey, aiProvider, aiModel, useStream, analysisSignal]);

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

  useEffect(() => {
    if (trigger && japaneseText) void handleTranslate();
    return () => { requestRef.current?.abort(); requestRef.current = null; };
  }, [trigger, japaneseText, handleTranslate]);

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
    <section id="fullTranslationCard" className="translation-section">
      <div className="translation-heading flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="m-0 text-sm font-medium" style={{ color: 'var(--ink-2)' }}>中文译文</h2>
        <div className="translation-actions flex items-center gap-1">
          <button
            id="translateSentenceButton"
            className="nd-ghost-btn"
            onClick={handleTranslate}
            disabled={isLoading}
          >
            {Icon.refresh}
            <span>{isLoading ? '翻译中' : translation ? '重新翻译' : '翻译'}</span>
          </button>
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
            aria-expanded={isVisible}
            aria-controls="translationContent"
          >
            <span>{isVisible ? '收起' : '展开'}</span>
          </button>
        </div>
      </div>

      <div id="translationContent">
        {/* 包含子元素的外边距，避免高度测量遗漏译文顶部间距。 */}
        <AutoAnimateHeight duration={300} contentClassName="flow-root">
          {isVisible ? (
            <div className="translation-scroll-region flow-root" role="region" aria-label="中文译文正文" tabIndex={0}>
              {isLoading && !translation ? (
                <ThinkingIndicator label="翻译中" />
              ) : translation ? (
                <div
                  className="flow-markdown full-translation-markdown mt-2 text-[16px] leading-7"
                  style={{ color: 'var(--ink)', letterSpacing: '0.2px' }}
                >
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
                <p
                  className="mb-0 mt-2 whitespace-pre-wrap text-[16px] leading-7"
                  style={{ color: 'var(--ink)', letterSpacing: '0.2px' }}
                >
                  {translation || <span style={{ color: 'var(--ink-3)' }}>解析后将自动翻译。</span>}
                </p>
              )}
            </div>
          ) : null}
        </AutoAnimateHeight>
      </div>
    </section>
  );
}
