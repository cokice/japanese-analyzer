'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { AnalyzeStreamParser } from '../utils/analyzeStreamParser';
import { createRequestMetrics, trackAnalyzeUsage, type AnalyzeUsageMetadata } from '../utils/analytics';
import { InvalidResponseError } from '../utils/requestErrors';
import { analyzeSentence, streamAnalyzeSentence } from '../services/analysis';
import { parseAnalyzeResponseContent } from '../lib/apiResponse';
import { summarizeDeepSeekReasoningProgress } from '../services/reasoning';
import { type TokenData } from '../lib/apiTypes';
import { type AIProvider, type AIModelName } from '../lib/aiModels';
import { ReasoningSummaryController } from '../utils/reasoningSummary';
import { ReasoningTextStore } from '../utils/reasoningTextStore';
import type { AnalysisHistoryEntry } from '../utils/analysisHistory';

interface UseAnalysisOptions {
  aiProvider: AIProvider; aiModel: AIModelName; userApiKey: string; useStream: boolean; deepseekThinkingEnabled: boolean;
  history: { record: (text: string, tokens: TokenData[]) => void };
  onStart: () => void; onSettled: (hasTokens: boolean, error?: boolean) => void; onHome: () => void; onRead: () => void; onCloseWordDetail: () => void;
}

export function useAnalysis({ aiProvider, aiModel, userApiKey, useStream, deepseekThinkingEnabled, history, onStart, onSettled, onHome, onRead, onCloseWordDetail }: UseAnalysisOptions) {
  const { t, locale } = useLanguage();
  const [currentSentence, setCurrentSentence] = useState('');
  const [analyzedTokens, setAnalyzedTokens] = useState<TokenData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<Error | null>(null);
  const [analysisSignal, setAnalysisSignal] = useState<AbortSignal>();
  const [translationTrigger, setTranslationTrigger] = useState(0);
  const [hasDeepseekReasoning, setHasDeepseekReasoning] = useState(false);
  const hasDeepseekReasoningRef = useRef(false);
  const reasoningTextStoreRef = useRef<ReasoningTextStore | null>(null);
  if (reasoningTextStoreRef.current === null) {
    reasoningTextStoreRef.current = new ReasoningTextStore();
  }
  const reasoningTextStore = reasoningTextStoreRef.current;
  const [deepseekReasoningDone, setDeepseekReasoningDone] = useState(true);
  const [deepseekReasoningSummaryHistory, setDeepseekReasoningSummaryHistory] = useState<string[]>([]);
  const [deepseekReasoningCompletionLabel, setDeepseekReasoningCompletionLabel] = useState(t("已深度思考"));
  const reasoningSummaryControllerRef = useRef<ReasoningSummaryController | null>(null);
  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const tokensRef = useRef(analyzedTokens);
  tokensRef.current = analyzedTokens;

  const resetReasoning = useCallback((done = true) => {
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(done);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel(t('已深度思考'));
  }, [reasoningTextStore, t]);

  useEffect(() => {
    analysisAbortControllerRef.current?.abort('language-change');
    analysisAbortControllerRef.current = null;
    setIsAnalyzing(false);
    setAnalysisError(null);
    onCloseWordDetail();
    resetReasoning();
    onSettled(tokensRef.current.length > 0);
  }, [locale, onCloseWordDetail, onSettled, resetReasoning]);
  useEffect(() => () => {
    analysisAbortControllerRef.current?.abort('unmount');
    reasoningSummaryControllerRef.current?.cancel();
  }, []);

  const handleAnalyze = async (text: string, usage?: AnalyzeUsageMetadata) => {
    if (!text.trim()) return;

    analysisAbortControllerRef.current?.abort('superseded');
    const analysisAbortController = new AbortController();
    analysisAbortControllerRef.current = analysisAbortController;
    setAnalysisSignal(analysisAbortController.signal);
    const streamParser = new AnalyzeStreamParser();
    const isCurrentAnalysis = () => (
      analysisAbortControllerRef.current === analysisAbortController
      && !analysisAbortController.signal.aborted
    );

    trackAnalyzeUsage(aiProvider, usage, aiModel);
    const metrics = createRequestMetrics('analyze', aiProvider, aiModel, useStream, analysisAbortController.signal);
    setIsAnalyzing(true);
    onStart();
    setAnalysisError(null);
    setCurrentSentence(text);
    setTranslationTrigger(0);
    setAnalyzedTokens([]);
    const deepseekThinkingActive = aiProvider === 'deepseek' && deepseekThinkingEnabled;
    resetReasoning(!deepseekThinkingActive);
    const reasoningSummaryController = deepseekThinkingActive
      ? new ReasoningSummaryController({
          requestSummary: ({ reasoningSnippet, signal }) => (
            summarizeDeepSeekReasoningProgress({
              reasoningSnippet,
              userApiKey,
              signal,
            })
          ),
          onSummary: (summary) => {
            if (!isCurrentAnalysis()) return;
            setDeepseekReasoningSummaryHistory((current) => [...current, summary]);
          },
          onError: (error) => {
            console.warn('DeepSeek reasoning summary skipped:', error);
          },
        })
      : null;
    reasoningSummaryControllerRef.current = reasoningSummaryController;
    if (reasoningSummaryController) {
      reasoningSummaryController.start();
    }
    let reasoningStatusEnded = !deepseekThinkingActive;
    const finishReasoningStatus = (summary: string) => {
      if (!isCurrentAnalysis() || reasoningStatusEnded || !deepseekThinkingActive) return;
      reasoningStatusEnded = true;
      reasoningSummaryController?.finish();
      if (reasoningSummaryControllerRef.current !== reasoningSummaryController) return;
      setDeepseekReasoningCompletionLabel(summary);
      setDeepseekReasoningDone(true);
    };
    onCloseWordDetail();

    const reasoningOptions = {
      deepseekThinkingEnabled: deepseekThinkingActive,
      signal: analysisAbortController.signal,
      onReasoning: (reasoningText: string) => {
        if (!isCurrentAnalysis()) return;
        if (!reasoningStatusEnded) {
          reasoningSummaryController?.ingest(reasoningText);
        }
        reasoningTextStore.setText(reasoningText);
        if (reasoningText && !hasDeepseekReasoningRef.current) {
          hasDeepseekReasoningRef.current = true;
          setHasDeepseekReasoning(true);
        }
      },
      onContentStart: () => {
        if (isCurrentAnalysis()) finishReasoningStatus(t("已深度思考"));
      },
    };

    try {
      if (useStream) {
        // 使用流式API进行分析
        await streamAnalyzeSentence(
          text,
          (chunk, isDone) => {
            if (!isCurrentAnalysis()) return;
            if (!isDone) {
              const tokens = streamParser.push(chunk);
              if (tokens.length) {
                metrics.firstResult();
                setAnalyzedTokens(tokens);
              }
            }
            if (isDone) {
              finishReasoningStatus(t("已深度思考"));
              setIsAnalyzing(false);
              analysisAbortControllerRef.current = null;
              try {
                const tokens = parseAnalyzeResponseContent(chunk);
                metrics.firstResult();
                setAnalyzedTokens(tokens);
                metrics.succeed();
                history.record(text, tokens);
                setTranslationTrigger(Date.now());
                onSettled(true);
              } catch (error) {
                metrics.fail(new InvalidResponseError('Invalid analysis result'));
                console.error('Final stream analysis parse error:', error);
                setAnalysisError(new Error(t("解析结果JSON格式错误")));
                onSettled(false, true);
              }
            }
          },
          (error) => {
            if (!isCurrentAnalysis()) return;
            metrics.fail(error);
            finishReasoningStatus(t("深度思考已中止"));
            console.error('Stream analysis error:', error);
            setAnalysisError(error);
            onSettled(false, true);
            setAnalyzedTokens([]);
            setIsAnalyzing(false);
            analysisAbortControllerRef.current = null;
          },
          userApiKey,
          aiProvider,
          aiModel,
          reasoningOptions
        );
      } else {
        // 使用传统API进行分析
        const tokens = await analyzeSentence(
          text,
          userApiKey,
          aiProvider,
          aiModel,
          reasoningOptions
        );
        if (!isCurrentAnalysis()) return;
        metrics.firstResult();
        setAnalyzedTokens(tokens);
        metrics.succeed();
        history.record(text, tokens);
        setTranslationTrigger(Date.now());
        onSettled(true);
        finishReasoningStatus(t("已深度思考"));
        setIsAnalyzing(false);
        analysisAbortControllerRef.current = null;
      }
    } catch (error) {
      if (!isCurrentAnalysis()) return;
      metrics.fail(error);
      finishReasoningStatus(t("深度思考已中止"));
      console.error('Analysis error:', error);
      setAnalysisError(error instanceof Error ? error : new Error(t("未知错误")));
      onSettled(false, true);
      setAnalyzedTokens([]);
      setIsAnalyzing(false);
      analysisAbortControllerRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    const controller = analysisAbortControllerRef.current;
    if (!controller || controller.signal.aborted) return;

    analysisAbortControllerRef.current = null;
    controller.abort('user');
    onCloseWordDetail();
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    setIsAnalyzing(false);
    onSettled(analyzedTokens.length > 0);
    setAnalysisError(null);
    setDeepseekReasoningCompletionLabel(t("已终止思考"));
    setDeepseekReasoningDone(true);
  };

  const handleStartOver = () => {
    analysisAbortControllerRef.current?.abort();
    analysisAbortControllerRef.current = null;
    setIsAnalyzing(false);
    onCloseWordDetail();
    resetReasoning();
    setAnalyzedTokens([]);
    setCurrentSentence('');
    setAnalysisError(null);
    onHome();
  };

  const handleRestoreAnalysis = (entry: AnalysisHistoryEntry) => {
    if (!entry.tokens) { void handleAnalyze(entry.text); return; }
    handleStartOver();
    setCurrentSentence(entry.text);
    setAnalyzedTokens(entry.tokens);
    onRead();
    setAnalysisSignal(undefined);
    setTranslationTrigger(0);
  };

  const pendingText = (() => {
    if (!isAnalyzing) return '';
    const analyzed = analyzedTokens.map((token) => token.word).join('');
    return currentSentence.startsWith(analyzed) ? currentSentence.slice(analyzed.length) : '';
  })();

  return { currentSentence, analyzedTokens, setAnalyzedTokens, isAnalyzing, analysisError, analysisSignal, translationTrigger,
    hasDeepseekReasoning, reasoningTextStore, deepseekReasoningDone, deepseekReasoningSummaryHistory, deepseekReasoningCompletionLabel,
    handleAnalyze, handleCancelAnalysis, handleStartOver, handleRestoreAnalysis, pendingText, resetReasoning };
}
