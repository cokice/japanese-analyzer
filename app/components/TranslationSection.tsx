'use client';

import { useLanguage } from '../contexts/LanguageContext';
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
  const { t, errorText } = useLanguage();
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
          if (isCurrent()) setTranslation(t("翻译时发生错误: {0}。", errorText(error.message)));
        }, userApiKey, aiProvider, aiModel, signal);
      } else {
        const text = await translateText(japaneseText, userApiKey, aiProvider, aiModel, signal);
        if (isCurrent()) setTranslation(text);
      }
    } catch (error) {
      if (isCurrent()) setTranslation(t("翻译时发生错误: {0}。", error instanceof Error ? errorText(error.message) : t("未知错误")));
    } finally {
      if (requestRef.current === controller) {
        setIsLoading(false); requestRef.current = null;
      }
    }
  }, [japaneseText, userApiKey, aiProvider, aiModel, useStream, analysisSignal, t, errorText]);

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

  const actions = (
    <div className="translation-actions flex items-center gap-1">
      <button
        id="translateSentenceButton"
        className="nd-ghost-btn"
        onClick={handleTranslate}
        disabled={isLoading}
      >
        {Icon.refresh}
        <span>{isLoading ? t("翻译中") : translation ? t("重新翻译") : t("翻译")}</span>
      </button>
      <button
        onClick={handleCopy}
        className="nd-ghost-btn"
        style={copied ? { color: 'var(--primary)' } : undefined}
        disabled={!translation}
      >
        {Icon.copy}<span>{copied ? t("已复制") : t("复制")}</span>
      </button>
      <button
        id="toggleFullTranslationButton"
        className="nd-ghost-btn"
        onClick={toggleVisibility}
        aria-expanded={isVisible}
        aria-controls="translationContent"
      >
        <span>{isVisible ? t("收起") : t("展开")}</span>
      </button>
    </div>
  );

  return (
    <section id="fullTranslationCard" className="translation-section" data-collapsed={!isVisible}>
      {/* 译文紧跟原句，标题只留给读屏；操作按钮悬停时出现 */}
      <h2 className="sr-only">{t("中文译文")}</h2>

      <div id="translationContent">
        {/* 包含子元素的外边距，避免高度测量遗漏译文顶部间距。 */}
        <AutoAnimateHeight duration={300} contentClassName="flow-root">
          {isVisible ? (
            <div className="translation-scroll-region flow-root" role="region" aria-label={t("中文译文正文")} tabIndex={0}>
              {isLoading && !translation ? (
                <ThinkingIndicator label={t("翻译中")} />
              ) : translation ? (
                <div className="flow-markdown full-translation-markdown translation-text">
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
                <p className="translation-text mb-0 whitespace-pre-wrap">
                  {translation || <span style={{ color: 'var(--ink-3)' }}>{t("解析后将自动翻译。")}</span>}
                </p>
              )}
            </div>
          ) : null}
        </AutoAnimateHeight>
      </div>

      {actions}
    </section>
  );
}
