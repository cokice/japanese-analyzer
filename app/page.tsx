'use client';

import { browserStorage } from './utils/storage';
import { loadSpeechSettings, SPEECH_PRESETS, SPEECH_SETTINGS_KEY, type SpeechSettings } from './lib/speechServices';

import { useLanguage } from './contexts/LanguageContext';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import InputSection from './components/InputSection';
import AnalysisResult, { DisplayOptions } from './components/AnalysisResult';
import TranslationSection from './components/TranslationSection';
import SettingsModal from './components/SettingsModal';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import AIChat from './components/AIChat';
import ReasoningStream from './components/ReasoningStream';
import WordDetailPanel from './components/WordDetailPanel';
import { useWordDetail } from './hooks/useWordDetail';
import { useAnalysisHistory } from './hooks/useAnalysisHistory';
import { AnalyzeStreamParser } from './utils/analyzeStreamParser';
import { selectWordDetailContext } from './utils/wordDetailContext';
import { getPhraseReading, getPhraseText, mergePhraseTokens, normalizePhraseRange, type PhraseRange } from './utils/phraseRange';
import { createRequestMetrics, trackAnalyzeUsage, trackWordDetailUsage, type AnalyzeUsageMetadata } from './utils/analytics';
import { localizeError } from './i18n';
import { InvalidResponseError } from './utils/requestErrors';
import {
  analyzeSentence,
  TokenData,
  loadAISettingsFromStorage,
  saveAISettingsToStorage,
  parseAnalyzeResponseContent,
  summarizeReasoningProgress,
  streamAnalyzeSentence,
  type EndpointPayload,
  type ProviderProfile,
  effectiveCaps,
} from './services/api';
import { ReasoningSummaryController } from './utils/reasoningSummary';
import { ReasoningTextStore } from './utils/reasoningTextStore';

export default function Home() {
  const { t, locale } = useLanguage();
  const history = useAnalysisHistory();
  const [currentSentence, setCurrentSentence] = useState('');
  const [analyzedTokens, setAnalyzedTokens] = useState<TokenData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [useStream, setUseStream] = useState<boolean>(true);

  const [analysisSignal, setAnalysisSignal] = useState<AbortSignal>();
  const [translationTrigger, setTranslationTrigger] = useState(0);
  const [showFurigana, setShowFurigana] = useState(true);
  // 解析开始后输入区收起，句子成为页面唯一主角；点「编辑原文」再展开
  const [isEditingInput, setIsEditingInput] = useState(true);
  // 圈选的多词短语（与单个选中的词互斥）
  const [selectedRange, setSelectedRange] = useState<PhraseRange | null>(null);
  // 圈选起点：长按或详情里点「选中多个词」后设置，再点一个词即选中这一段
  const [pickAnchor, setPickAnchor] = useState<number | null>(null);
  const [showRomaji, setShowRomaji] = useState(false);

  // API设置相关状态
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [services, setServices] = useState<ProviderProfile[]>([]);
  const [activeServiceId, setActiveServiceId] = useState('');
  const [activeModelId, setActiveModelId] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const activeService = useMemo(
    () => services.find((service) => service.id === activeServiceId) ?? services[0] ?? null,
    [services, activeServiceId]
  );
  const activeModel = useMemo(
    () => activeService?.models.find((model) => model.id === activeModelId) ?? activeService?.models[0] ?? null,
    [activeService, activeModelId]
  );
  const endpoint: EndpointPayload = useMemo(
    () => activeService && activeModel
      ? { baseUrl: activeService.baseUrl, model: activeModel.model, caps: effectiveCaps(activeService, activeModel) }
      : { baseUrl: '', model: '' },
    [activeService, activeModel]
  );
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
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>({ services: [{ ...SPEECH_PRESETS[0] }, { ...SPEECH_PRESETS[1] }], activeId: 'edge' });
  const activeSpeechService = speechSettings.services.find((service) => service.id === speechSettings.activeId) ?? speechSettings.services[0];

  // 密码验证相关状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authError, setAuthError] = useState('');

  const userApiKey = activeService?.apiKey || '';

  // 选中词汇（右侧详情面板 / 移动端模态）
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const {
    wordDetail,
    isLoading: isWordDetailLoading,
    isStreamLoading: isWordDetailStreaming,
    streamContent: wordDetailStreamContent,
    streamError: wordDetailStreamError,
    fetchWordDetails,
    clearWordDetail,
  } = useWordDetail({ userApiKey, endpoint, useStream });

  useEffect(() => {
    analysisAbortControllerRef.current?.abort('language-change');
    analysisAbortControllerRef.current = null;
    reasoningSummaryControllerRef.current?.cancel();
    setIsAnalyzing(false);
    setAnalysisError('');
    setAuthError('');
    setSelectedIndex(null);
    setSelectedRange(null);
    setPickAnchor(null);
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
  }, [locale, reasoningTextStore]);

  // 侧栏在 lg(1024px) 以上显示，以下使用模态
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // 桌面端全局外链拦截与图片拖放默认行为阻止（防止 WebView 导航至 file:// 覆盖应用）
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI__ || (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

    const handleExternalLinkClick = (event: MouseEvent) => {
      if (!isTauri) return;
      const anchor = (event.target as HTMLElement)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (/^https?:\/\//i.test(href)) {
        try {
          const url = new URL(href, window.location.href);
          if (url.origin !== window.location.origin) {
            event.preventDefault();
            // 在桌面端触发导航，由 Rust 端 on_navigation 统一拦截并调用系统默认浏览器打开
            window.location.href = url.href;
          }
        } catch {}
      }
    };

    const preventFileDropNavigation = (event: DragEvent) => {
      // 阻止浏览器默认将拖入的文件作为页面打开的行为
      event.preventDefault();
    };

    document.addEventListener('click', handleExternalLinkClick);
    window.addEventListener('dragover', preventFileDropNavigation);
    window.addEventListener('drop', preventFileDropNavigation);
    return () => {
      document.removeEventListener('click', handleExternalLinkClick);
      window.removeEventListener('dragover', preventFileDropNavigation);
      window.removeEventListener('drop', preventFileDropNavigation);
    };
  }, []);

  useEffect(() => () => {
    analysisAbortControllerRef.current?.abort('unmount');
    reasoningSummaryControllerRef.current?.cancel();
  }, []);

  // 检查是否需要密码验证
  useEffect(() => {
    const checkAuthRequirement = async () => {
      try {
        const response = await fetch('/api/auth');
        if (!response.ok) throw new Error('Authentication check failed');
        const data = await response.json();
        if (typeof data.requiresAuth !== 'boolean' || typeof data.authenticated !== 'boolean') throw new Error('Invalid authentication state');
        setRequiresAuth(data.requiresAuth);

        if (!data.requiresAuth || data.authenticated) {
          setIsAuthenticated(true);
          return;
        }

        browserStorage.removeItem('isAuthenticated');
        setIsAuthenticated(false);
      } catch (error) {
        console.error('检查认证状态失败:', error);
        // Fail closed, with the login form available for retry.
        setRequiresAuth(true);
        setIsAuthenticated(false);
      }
    };

    checkAuthRequirement();
  }, []);

  // 从本地存储加载用户API设置
  useEffect(() => {
    const storedAISettings = loadAISettingsFromStorage(browserStorage);
    const storedUseStream = browserStorage.getItem('useStream');

    setServices(storedAISettings.services);
    setActiveServiceId(storedAISettings.activeServiceId);
    setActiveModelId(storedAISettings.activeModelId);
    setGeminiApiKey(storedAISettings.geminiApiKey);
    setThinkingEnabled(storedAISettings.thinkingEnabled);
    setSpeechSettings(loadSpeechSettings(browserStorage));

    // 只有当明确设置了值时才更新，否则保持默认值
    if (storedUseStream !== null) {
      setUseStream(storedUseStream === 'true');
    }
  }, []);

  // 切换模型 / 保存设置后都要清掉的解析与思考状态
  const resetAnalysisState = () => {
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel(t("已深度思考"));
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
  };

  // 保存用户API设置
  const handleSaveSettings = (settings: {
    services: ProviderProfile[];
    activeServiceId: string;
    activeModelId: string;
    geminiApiKey: string;
    speechSettings: SpeechSettings;
    thinkingEnabled: boolean;
    useStream: boolean;
  }) => {
    saveAISettingsToStorage(browserStorage, {
      services: settings.services,
      activeServiceId: settings.activeServiceId,
      activeModelId: settings.activeModelId,
      geminiApiKey: settings.geminiApiKey,
      thinkingEnabled: settings.thinkingEnabled,
    });
    browserStorage.setItem('useStream', settings.useStream.toString());
    browserStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(settings.speechSettings));
    setSpeechSettings(settings.speechSettings);

    setServices(settings.services);
    setActiveServiceId(settings.activeServiceId);
    setActiveModelId(settings.activeModelId);
    setGeminiApiKey(settings.geminiApiKey);
    setThinkingEnabled(settings.thinkingEnabled);
    setUseStream(settings.useStream);
    resetAnalysisState();
  };

  // 顶栏快捷切换当前模型：更新选中项并立即持久化
  const handleSelectModel = (serviceId: string, modelId: string) => {
    setActiveServiceId(serviceId);
    setActiveModelId(modelId);
    saveAISettingsToStorage(browserStorage, {
      services,
      activeServiceId: serviceId,
      activeModelId: modelId,
      geminiApiKey,
      thinkingEnabled,
    });
    resetAnalysisState();
  };

  const handleSpeechServiceChange = (activeId: string, voice?: string) => {
    const next = { services: voice?.trim() ? speechSettings.services.map((service) => service.id === activeId ? { ...service, voice: voice.trim() } : service) : speechSettings.services, activeId };
    setSpeechSettings(next);
    browserStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(next));
  };

  // 处理密码验证
  const handleLogin = async (password: string) => {
    try {
      setAuthError('');
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsAuthenticated(true);
        browserStorage.removeItem('isAuthenticated');
      } else {
        setAuthError(localizeError(data.message || "验证失败", locale));
      }
    } catch (error) {
      console.error('验证过程中出错:', error);
      setAuthError(t("验证过程中发生错误，请重试"));
    }
  };

  // 添加函数，检查是否显示分析器
  const shouldShowAnalyzer = (): boolean => analyzedTokens.length > 0;

  const handleCloseWordDetail = useCallback(() => {
    setSelectedIndex(null);
    setSelectedRange(null);
    setPickAnchor(null);
    clearWordDetail();
  }, [clearWordDetail]);

  // 点击词汇 → 查询详情
  const handleWordClick = useCallback((token: TokenData, index: number) => {
    if (selectedIndex === index) {
      handleCloseWordDetail();
      return;
    }
    setSelectedRange(null);
    setSelectedIndex(index);
    trackWordDetailUsage(activeService?.id ?? '', activeModel?.model ?? '');
    const context = selectWordDetailContext(currentSentence, analyzedTokens, index);
    fetchWordDetails(token.word, token.pos, context, token.furigana);
  }, [activeService, activeModel, selectedIndex, currentSentence, analyzedTokens, fetchWordDetails, handleCloseWordDetail]);

  const fetchPhraseDetails = useCallback((range: PhraseRange, force = false) => {
    fetchWordDetails(
      getPhraseText(analyzedTokens, range),
      '',
      selectWordDetailContext(currentSentence, analyzedTokens, range.start),
      getPhraseReading(analyzedTokens, range),
      { kind: 'phrase', force }
    );
  }, [analyzedTokens, currentSentence, fetchWordDetails]);

  // 圈选多个词：拖动 / Shift 点击 / 手机长按后再点
  const handleRangeSelect = useCallback((a: number, b: number) => {
    // 不论用哪种方式完成圈选，都退出「再点一个词」的状态
    setPickAnchor(null);
    const range = normalizePhraseRange(analyzedTokens, a, b);
    if (!range) return;
    setSelectedIndex(null);
    setSelectedRange(range);
    trackWordDetailUsage(activeService?.id ?? '', activeModel?.model ?? '');
    fetchPhraseDetails(range);
  }, [activeService, activeModel, analyzedTokens, fetchPhraseDetails]);

  const handleRefreshWordDetail = useCallback(() => {
    if (selectedRange) {
      fetchPhraseDetails(selectedRange, true);
      return;
    }
    if (selectedIndex === null) return;

    const token = analyzedTokens[selectedIndex];
    if (!token) return;

    fetchWordDetails(
      token.word,
      token.pos,
      selectWordDetailContext(currentSentence, analyzedTokens, selectedIndex),
      token.furigana,
      { force: true }
    );
  }, [analyzedTokens, currentSentence, fetchPhraseDetails, fetchWordDetails, selectedIndex, selectedRange]);

  // 详情里的「选中多个词」：以当前词为起点进入圈选。手机上先收起弹窗，露出句子
  const handleStartPick = useCallback(() => {
    if (selectedIndex === null) return;
    const anchor = selectedIndex;
    if (!isDesktop) handleCloseWordDetail();
    setPickAnchor(anchor);
  }, [handleCloseWordDetail, isDesktop, selectedIndex]);

  // AI 判断圈选的其实是一个被拆开的词时，合并回单个词项（只影响当前结果）
  const canMergePhrase = selectedRange !== null && wordDetail?.kind === 'phrase' && wordDetail.category === '単語';
  const handleMergePhrase = useCallback(() => {
    if (!selectedRange || !wordDetail) return;
    setAnalyzedTokens((tokens) => mergePhraseTokens(tokens, selectedRange, {
      pos: wordDetail.pos,
      furigana: wordDetail.mergeReading || wordDetail.furigana,
    }));
    setSelectedIndex(selectedRange.start);
    setSelectedRange(null);
  }, [selectedRange, wordDetail]);

  const handleAnalyze = async (text: string, usage?: AnalyzeUsageMetadata) => {
    if (!text.trim()) return;

    if (!activeService || !activeModel) {
      setAnalysisError(t("请先在设置中配置模型服务"));
      setIsSettingsModalOpen(true);
      return;
    }

    analysisAbortControllerRef.current?.abort('superseded');
    const analysisAbortController = new AbortController();
    analysisAbortControllerRef.current = analysisAbortController;
    setAnalysisSignal(analysisAbortController.signal);
    const streamParser = new AnalyzeStreamParser();
    const isCurrentAnalysis = () => (
      analysisAbortControllerRef.current === analysisAbortController
      && !analysisAbortController.signal.aborted
    );

    const providerName = activeService?.id ?? '';
    trackAnalyzeUsage(providerName, usage, endpoint.model);
    const metrics = createRequestMetrics('analyze', providerName, endpoint.model, useStream, analysisAbortController.signal);
    setIsAnalyzing(true);
    setIsEditingInput(false);
    setAnalysisError('');
    setCurrentSentence(text);
    setTranslationTrigger(Date.now());
    setAnalyzedTokens([]);
    const deepseekThinkingActive = !!activeModel?.caps?.thinking && thinkingEnabled;
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(!deepseekThinkingActive);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel(t("已深度思考"));
    reasoningSummaryControllerRef.current?.cancel();
    const reasoningSummaryController = deepseekThinkingActive
      ? new ReasoningSummaryController({
          requestSummary: ({ reasoningSnippet, signal }) => (
            summarizeReasoningProgress({
              reasoningSnippet,
              endpoint,
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
    handleCloseWordDetail();

    const reasoningOptions = {
      thinkingEnabled: deepseekThinkingActive,
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
                history.record(text);
              } catch (error) {
                metrics.fail(new InvalidResponseError('Invalid analysis result'));
                console.error('Final stream analysis parse error:', error);
                setAnalysisError(t("解析结果JSON格式错误"));
              }
            }
          },
          (error) => {
            if (!isCurrentAnalysis()) return;
            metrics.fail(error);
            finishReasoningStatus(t("深度思考已中止"));
            console.error('Stream analysis error:', error);
            setAnalysisError(error.message || t("流式解析错误"));
            setAnalyzedTokens([]);
            setIsAnalyzing(false);
            analysisAbortControllerRef.current = null;
          },
          userApiKey,
          endpoint,
          reasoningOptions
        );
      } else {
        // 使用传统API进行分析
        const tokens = await analyzeSentence(
          text,
          userApiKey,
          endpoint,
          reasoningOptions
        );
        if (!isCurrentAnalysis()) return;
        metrics.firstResult();
        setAnalyzedTokens(tokens);
        metrics.succeed();
        history.record(text);
        finishReasoningStatus(t("已深度思考"));
        setIsAnalyzing(false);
        analysisAbortControllerRef.current = null;
      }
    } catch (error) {
      if (!isCurrentAnalysis()) return;
      metrics.fail(error);
      finishReasoningStatus(t("深度思考已中止"));
      console.error('Analysis error:', error);
      setAnalysisError(error instanceof Error ? error.message : t("未知错误"));
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
    handleCloseWordDetail();
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    setIsAnalyzing(false);
    setAnalysisError('');
    setDeepseekReasoningCompletionLabel(t("已终止思考"));
    setDeepseekReasoningDone(true);
  };

  const isReading = !isEditingInput && (isAnalyzing || analyzedTokens.length > 0);
  // 解析中：原句里还没解析到的部分，以灰字流光占住结果位置
  const pendingText = (() => {
    if (!isAnalyzing) return '';
    const analyzed = analyzedTokens.map((token) => token.word).join('');
    return currentSentence.startsWith(analyzed) ? currentSentence.slice(analyzed.length) : '';
  })();
  // 首页：还没有解析任何句子，显示今日一句和最近记录
  const isHome = !isAnalyzing && !currentSentence;

  // 「新句子」：清空当前解析，回到首页
  const handleStartOver = () => {
    analysisAbortControllerRef.current?.abort();
    analysisAbortControllerRef.current = null;
    setIsAnalyzing(false);
    handleCloseWordDetail();
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
    setAnalyzedTokens([]);
    setCurrentSentence('');
    setAnalysisError('');
    setIsEditingInput(true);
  };

  const hasWordDetail = (selectedIndex !== null || selectedRange !== null)
    && (isWordDetailLoading || isWordDetailStreaming || wordDetail !== null || !!wordDetailStreamError);

  const wordDetailPanel = (
    <WordDetailPanel
      wordDetail={wordDetail}
      isLoading={isWordDetailLoading}
      isStreamLoading={isWordDetailStreaming}
      streamError={wordDetailStreamError}
      streamContent={wordDetailStreamContent}
      onClose={handleCloseWordDetail}
      onRefresh={handleRefreshWordDetail}
      onMerge={canMergePhrase ? handleMergePhrase : undefined}
      onSelectMore={selectedIndex !== null ? handleStartPick : undefined}
    />
  );

  // 如果需要认证但未认证，只显示登录界面
  if (requiresAuth && !isAuthenticated) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center p-4 transition-colors duration-200">
          <div className="mb-8 text-center">
            <h1 className="mb-3 text-3xl font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
              {t("日本語文章解析")}
            </h1>
            <p className="text-base" style={{ color: 'var(--ink-3)' }}>
              {t("AI驱动・深入理解日语句子结构与词义")}
            </p>
          </div>
        </div>
        <LoginModal
          isOpen={true}
          onLogin={handleLogin}
          error={authError}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-screen flex-col">
        <Header
          thinking={isAnalyzing}
          services={services}
          activeServiceId={activeService?.id ?? ''}
          activeModelId={activeModel?.id ?? ''}
          onSelectModel={handleSelectModel}
          onSettingsClick={() => setIsSettingsModalOpen(true)}
        />

        {/* 阅读列居中；点词后详情栏从右侧展开，主列随之左移。 */}
        <main
          className="app-main mx-auto flex w-full max-w-[1240px] flex-1 items-start justify-center px-4 pb-6 pt-2 sm:px-9"
          data-detail-open={isDesktop && hasWordDetail}
        >
          {/* 主列 */}
          <div className="app-column relative flex w-full min-w-0 max-w-[780px] flex-col gap-[22px]" data-home={isHome}>
            <InputSection
              compact={isReading}
              showSuggestions={isHome}
              onNewSentence={handleStartOver}
              onExpand={() => setIsEditingInput(true)}
              onCollapse={analyzedTokens.length > 0 ? () => setIsEditingInput(false) : undefined}
              history={history}
              onAnalyze={handleAnalyze}
              onCancelAnalyze={handleCancelAnalysis}
                userApiKey={userApiKey}
                activeService={activeService}
                services={services}
                activeServiceId={activeService?.id ?? ''}
                activeModelId={activeModel?.id ?? ''}
                onSelectModel={handleSelectModel}
                endpoint={endpoint}
                speechService={activeSpeechService}
                speechServices={speechSettings.services}
               useStream={useStream}
              onSpeechServiceChange={handleSpeechServiceChange}
              isAnalyzing={isAnalyzing}
              analysisError={analysisError}
              compactExtras={shouldShowAnalyzer() && (
                <DisplayOptions
                  variant="chips"
                  showFurigana={showFurigana}
                  onShowFuriganaChange={setShowFurigana}
                  showRomaji={showRomaji}
                  onShowRomajiChange={setShowRomaji}
                />
              )}
            />

            {!!activeModel?.caps?.thinking
              && thinkingEnabled
              && (isAnalyzing || hasDeepseekReasoning) && (
                <ReasoningStream
                  store={reasoningTextStore}
                  done={deepseekReasoningDone}
                  summaryHistory={deepseekReasoningSummaryHistory}
                  completionLabel={deepseekReasoningCompletionLabel}
                />
              )}

            {analysisError && (
              <div className="nd-card">
                <div
                  className="flex items-start gap-2 rounded-[10px] p-3 text-sm"
                  style={{
                    background: 'color-mix(in oklab, var(--pos-p) 10%, transparent)',
                    color: 'var(--ink-2)',
                  }}
                >
                  <span
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold leading-none"
                    style={{ background: 'var(--pos-p)', color: '#fff' }}
                    aria-hidden="true"
                  >
                    !
                  </span>
                  <span>{t("解析错误：")}{localizeError(analysisError, locale)}</span>
                </div>
              </div>
            )}

            {(shouldShowAnalyzer() || currentSentence) && (
              <div className="reading-surface">
                {(shouldShowAnalyzer() || pendingText) && (
                  <AnalysisResult
                    key={currentSentence}
                    tokens={analyzedTokens}
                    pendingText={pendingText}
                    showFurigana={showFurigana}
                    onShowFuriganaChange={setShowFurigana}
                    showRomaji={showRomaji}
                    onShowRomajiChange={setShowRomaji}
                    onWordClick={handleWordClick}
                    selectedIndex={selectedIndex}
                    selectedRange={selectedRange}
                    onRangeSelect={handleRangeSelect}
                    pickAnchor={pickAnchor}
                    onPickAnchorChange={setPickAnchor}
                    showDisplayOptions={!isReading}
                  />
                )}

                {currentSentence && (
                  <TranslationSection
                    japaneseText={currentSentence}
                    userApiKey={userApiKey}
                    endpoint={endpoint}
                    useStream={useStream}
                    trigger={translationTrigger}
                    analysisSignal={analysisSignal}
                  />
                )}
              </div>
            )}
          </div>

          {/* 侧栏：词汇详情（桌面端），未选词时收起不占位 */}
          <aside className="detail-rail sticky top-4 hidden self-start lg:block">
            <div className="detail-rail-inner">
              {isDesktop && hasWordDetail && wordDetailPanel}
            </div>
          </aside>
        </main>

        <footer className="px-4 pb-6 pt-1 text-center text-xs sm:px-9" style={{ color: 'var(--ink-3)' }}>
          {t("AI也可能会犯错，请核查重要信息。")}
        </footer>

        {/* 设置模态框 */}
        <SettingsModal
          services={services}
          activeServiceId={activeServiceId}
          activeModelId={activeModelId}
          geminiApiKey={geminiApiKey}
          speechSettings={speechSettings}
          thinkingEnabled={thinkingEnabled}
          useStream={useStream}
          onSaveSettings={handleSaveSettings}
          isModalOpen={isSettingsModalOpen}
          onModalClose={() => setIsSettingsModalOpen(!isSettingsModalOpen)}
        />
      </div>

      {/* 移动端词汇详情模态 */}
      {!isDesktop && hasWordDetail && typeof document !== 'undefined' && createPortal(
        <div
          id="wordDetailModal"
          className="word-detail-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseWordDetail();
          }}
        >
          <div className="word-detail-modal-content">
            <button
              className="modal-close-button"
              title={t("关闭详情")}
              onClick={handleCloseWordDetail}
            >
              &times;
            </button>
            <WordDetailPanel
              wordDetail={wordDetail}
              isLoading={isWordDetailLoading}
              isStreamLoading={isWordDetailStreaming}
              streamError={wordDetailStreamError}
              streamContent={wordDetailStreamContent}
              onClose={handleCloseWordDetail}
              onRefresh={handleRefreshWordDetail}
      onMerge={canMergePhrase ? handleMergePhrase : undefined}
      onSelectMore={selectedIndex !== null ? handleStartPick : undefined}
              hideClose
            />
          </div>
        </div>,
        document.body
      )}

      {/* AI聊天助手 */}
      <AIChat
        hidden={isSettingsModalOpen}
        userApiKey={userApiKey}
        activeService={activeService}
        endpoint={endpoint}
        currentSentence={currentSentence}
      />
    </>
  );
}
