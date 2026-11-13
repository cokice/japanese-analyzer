'use client';

import { DEEPSEEK_THINKING_AVAILABLE } from './lib/aiModels';
import { useAnalysis } from './hooks/useAnalysis';
import { initialReadingView, readingViewReducer, getViewSelection } from './lib/readingView';
import { browserStorage } from './utils/storage';

import { useLanguage } from './contexts/LanguageContext';
import { useState, useEffect, useCallback, useReducer } from 'react';
import InputSection from './components/InputSection';
import AnalysisResult, { DisplayOptions } from './components/AnalysisResult';
import TranslationSection from './components/TranslationSection';
import SettingsModal from './components/SettingsModal';
import Header from './components/Header';
import { Icon } from './components/Icons';
import ErrorNotice from './components/ErrorNotice';
import LoginModal from './components/LoginModal';
import ModalDialog from './components/ModalDialog';
import AIChat from './components/AIChat';
import ReasoningStream from './components/ReasoningStream';
import WordDetailPanel from './components/WordDetailPanel';
import { useWordDetail } from './hooks/useWordDetail';
import { useAnalysisHistory } from './hooks/useAnalysisHistory';
import { selectWordDetailContext } from './utils/wordDetailContext';
import { getPhraseReading, getPhraseText, mergePhraseTokens, normalizePhraseRange, type PhraseRange } from './utils/phraseRange';
import { trackWordDetailUsage } from './utils/analytics';
import { localizeError } from './i18n';
import { apiErrorFromResponse } from './utils/requestErrors';
import { type AIModelName, DEFAULT_AI_PROVIDER, type AIProvider, getModelName } from './lib/aiModels';
import { type TokenData, type TTSProvider } from './lib/apiTypes';
import { loadAISettingsFromStorage } from './lib/aiSettings';

export default function Home() {
  const { t, locale } = useLanguage();
  const history = useAnalysisHistory();
  const [view, dispatch] = useReducer(readingViewReducer, initialReadingView);
  const { selectedIndex, selectedRange, pickAnchor } = getViewSelection(view);
  const setPickAnchor = useCallback((anchor: number | null) => dispatch({ type: 'pick', anchor }), []);
  const [useStream, setUseStream] = useState<boolean>(true);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showRomaji, setShowRomaji] = useState(false);

  // API设置相关状态
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>(DEFAULT_AI_PROVIDER);
  const [aiModel, setAiModel] = useState<AIModelName>(getModelName(DEFAULT_AI_PROVIDER));
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [deepseekThinkingEnabled, setDeepseekThinkingEnabled] = useState(false);
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('edge');

  // 密码验证相关状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authError, setAuthError] = useState('');

  const userApiKey = aiProvider === 'gemini' ? geminiApiKey : deepseekApiKey;
  const [isDesktop, setIsDesktop] = useState(true);
  const [railTab, setRailTab] = useState<'detail' | 'assistant'>('detail');
  const [assistantHost, setAssistantHost] = useState<HTMLDivElement | null>(null);
  const {
    wordDetail,
    isLoading: isWordDetailLoading,
    isStreamLoading: isWordDetailStreaming,
    streamContent: wordDetailStreamContent,
    streamError: wordDetailStreamError,
    fetchWordDetails,
    clearWordDetail,
  } = useWordDetail({ userApiKey, aiProvider, aiModel, useStream });

  const handleCloseWordDetail = useCallback(() => {
    dispatch({ type: 'clearSelection' });
    clearWordDetail();
  }, [clearWordDetail]);
  const onAnalysisStart = useCallback(() => dispatch({ type: 'analyze' }), []);
  const onAnalysisSettled = useCallback((hasTokens: boolean, error?: boolean) => dispatch({ type: 'settled', hasTokens, error }), []);
  const onHome = useCallback(() => dispatch({ type: 'home' }), []);
  const onRead = useCallback(() => dispatch({ type: 'read' }), []);
  const { currentSentence, analyzedTokens, setAnalyzedTokens, isAnalyzing, analysisError, analysisSignal, translationTrigger,
    hasDeepseekReasoning, reasoningTextStore, deepseekReasoningDone, deepseekReasoningSummaryHistory, deepseekReasoningCompletionLabel,
    handleAnalyze, handleCancelAnalysis, handleStartOver, handleRestoreAnalysis, pendingText, resetReasoning } = useAnalysis({
      aiProvider, aiModel, userApiKey, useStream, deepseekThinkingEnabled, history, onStart: onAnalysisStart, onSettled: onAnalysisSettled,
      onHome, onRead, onCloseWordDetail: handleCloseWordDetail,
    });
  useEffect(() => { setAuthError(''); }, [locale]);

  // 侧栏在 lg(1024px) 以上显示，以下使用模态
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
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
    const storedTts = browserStorage.getItem('ttsProvider');
    const storedTtsProvider: TTSProvider = storedTts === 'gemini' || storedTts === 'deepseek' ? storedTts : 'edge';

    setAiProvider(storedAISettings.aiProvider);
    setAiModel(storedAISettings.aiModel);
    setGeminiApiKey(storedAISettings.geminiApiKey);
    setDeepseekApiKey(storedAISettings.deepseekApiKey);
    setDeepseekThinkingEnabled(storedAISettings.deepseekThinkingEnabled);
    setTtsProvider(storedTtsProvider);

    // 只有当明确设置了值时才更新，否则保持默认值
    if (storedUseStream !== null) {
      setUseStream(storedUseStream === 'true');
    }
  }, []);
  const handleSaveSettings = (settings: {
    aiProvider: AIProvider;
    aiModel: AIModelName;
    geminiApiKey: string;
    deepseekApiKey: string;
    deepseekThinkingEnabled: boolean;
    useStream: boolean;
  }) => {
    browserStorage.setItem('aiProvider', settings.aiProvider);
    browserStorage.setItem('aiModel', settings.aiModel);
    browserStorage.setItem('geminiApiKey', settings.geminiApiKey);
    browserStorage.setItem('deepseekApiKey', settings.deepseekApiKey);
    if (DEEPSEEK_THINKING_AVAILABLE) browserStorage.setItem('deepseekThinkingEnabled', settings.deepseekThinkingEnabled.toString());
    browserStorage.setItem('useStream', settings.useStream.toString());
    browserStorage.removeItem('geminiApiUrl');
    browserStorage.removeItem('deepseekApiUrl');
    browserStorage.removeItem('userApiUrl');

    // 保留旧键，方便旧版本或其他工具读取 Gemini 密钥配置。
    browserStorage.setItem('userApiKey', settings.geminiApiKey);

    setAiProvider(settings.aiProvider);
    setAiModel(settings.aiModel);
    setGeminiApiKey(settings.geminiApiKey);
    setDeepseekApiKey(settings.deepseekApiKey);
    setDeepseekThinkingEnabled(settings.deepseekThinkingEnabled);
    setUseStream(settings.useStream);
    resetReasoning();
  };

  const handleTtsProviderChange = (provider: TTSProvider) => {
    setTtsProvider(provider);
    browserStorage.setItem('ttsProvider', provider);
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
        setAuthError(localizeError(apiErrorFromResponse(data, response.status), locale));
      }
    } catch (error) {
      console.error('验证过程中出错:', error);
      setAuthError(t("验证过程中发生错误，请重试"));
    }
  };

  // 添加函数，检查是否显示分析器
  const shouldShowAnalyzer = (): boolean => analyzedTokens.length > 0;

  // 点击词汇 → 查询详情
  const handleWordClick = useCallback((token: TokenData, index: number) => {
    setRailTab('detail');
    if (selectedIndex === index) {
      handleCloseWordDetail();
      return;
    }
    dispatch({ type: 'word', index });
    trackWordDetailUsage(aiProvider, aiModel);
    const context = selectWordDetailContext(currentSentence, analyzedTokens, index);
    fetchWordDetails(token.word, token.pos, context, token.furigana);
  }, [aiProvider, aiModel, selectedIndex, currentSentence, analyzedTokens, fetchWordDetails, handleCloseWordDetail]);

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
    setRailTab('detail');
    // 不论用哪种方式完成圈选，都退出「再点一个词」的状态
    setPickAnchor(null);
    const range = normalizePhraseRange(analyzedTokens, a, b);
    if (!range) return;
    dispatch({ type: 'range', range });
    trackWordDetailUsage(aiProvider, aiModel);
    fetchPhraseDetails(range);
  }, [aiModel, aiProvider, analyzedTokens, fetchPhraseDetails, setPickAnchor]);

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
  }, [handleCloseWordDetail, isDesktop, selectedIndex, setPickAnchor]);

  // AI 判断圈选的其实是一个被拆开的词时，合并回单个词项（只影响当前结果）
  const canMergePhrase = selectedRange !== null && wordDetail?.kind === 'phrase' && wordDetail.category === '単語';
  const handleMergePhrase = useCallback(() => {
    if (!selectedRange || !wordDetail) return;
    setAnalyzedTokens((tokens) => mergePhraseTokens(tokens, selectedRange, {
      pos: wordDetail.pos,
      furigana: wordDetail.mergeReading || wordDetail.furigana,
    }));
    dispatch({ type: 'word', index: selectedRange.start });
  }, [selectedRange, wordDetail, setAnalyzedTokens]);
  const isReading = view.mode === 'analyzing' || view.mode === 'reading';
  const isHome = view.mode === 'home';

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

  useEffect(() => {
    if (isDesktop || !hasWordDetail) return;
    const frame = requestAnimationFrame(() => {
      const index = selectedIndex ?? selectedRange?.start;
      const word = document.querySelector(`[data-token-index="${index}"]`);
      const sheet = document.querySelector('.word-detail-modal-content');
      if (!word || !sheet) return;
      const overlap = word.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + 16;
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [isDesktop, hasWordDetail, selectedIndex, selectedRange]);

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
      <div className="app-shell flex min-h-screen flex-col" data-word-sheet-open={!isDesktop && hasWordDetail}>
        <Header
          thinking={isAnalyzing}
          aiProvider={aiProvider}
          onSettingsClick={() => setIsSettingsModalOpen(true)}
        />

        {/* 桌面阅读态始终预留侧栏，点词只显示面板。 */}
        <main
          className="app-main mx-auto flex w-full max-w-[1240px] flex-1 items-start justify-center px-4 pb-6 pt-2 sm:px-9"
          data-detail-open={isDesktop && hasWordDetail}
          data-reading={isReading}
          data-view={view.mode}
        >
          {/* 主列 */}
          <div className="app-column relative flex w-full min-w-0 max-w-[780px] flex-col gap-[22px]" data-home={isHome}>
            <InputSection
              compact={isReading}
              showSuggestions={isHome}
              onNewSentence={handleStartOver}
              onExpand={() => dispatch({ type: 'edit' })}
              onCollapse={analyzedTokens.length > 0 ? () => dispatch({ type: 'read' }) : undefined}
              history={history}
              onAnalyze={handleAnalyze}
              onCancelAnalyze={handleCancelAnalysis}
              onRestoreAnalysis={handleRestoreAnalysis}
              onReanalyze={() => handleAnalyze(currentSentence)}
              userApiKey={userApiKey}
              aiProvider={aiProvider}
              aiModel={aiModel}
              geminiApiKey={geminiApiKey}
              deepseekApiKey={deepseekApiKey}
              useStream={useStream}
              ttsProvider={ttsProvider}
              onTtsProviderChange={handleTtsProviderChange}
              isAnalyzing={isAnalyzing}
              compactExtras={shouldShowAnalyzer() && (
                <DisplayOptions
                  showFurigana={showFurigana}
                  onShowFuriganaChange={setShowFurigana}
                  showRomaji={showRomaji}
                  onShowRomajiChange={setShowRomaji}
                />
              )}
            />

            {aiProvider === 'deepseek'
              && deepseekThinkingEnabled
              && (isAnalyzing || hasDeepseekReasoning) && (
                <ReasoningStream
                  store={reasoningTextStore}
                  done={deepseekReasoningDone}
                  summaryHistory={deepseekReasoningSummaryHistory}
                  completionLabel={deepseekReasoningCompletionLabel}
                />
              )}

            {analysisError && (
              <ErrorNotice error={analysisError} onOpenSettings={() => setIsSettingsModalOpen(true)} onRetry={() => handleAnalyze(currentSentence)} />
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

                {currentSentence && !isAnalyzing && !analysisError && analyzedTokens.length > 0 && (
                  <TranslationSection
                    japaneseText={currentSentence}
                    userApiKey={userApiKey}
                    aiProvider={aiProvider}
                    aiModel={aiModel}
                    useStream={useStream}
                    trigger={translationTrigger}
                    analysisSignal={analysisSignal}
                    onOpenSettings={() => setIsSettingsModalOpen(true)}
                  />
                )}
              </div>
            )}
          </div>

          {/* 侧栏：桌面阅读态预留位置 */}
          <aside className="detail-rail sticky top-4 hidden self-start lg:block">
            <div className="detail-rail-inner">
              {isDesktop && isReading && (
                <div className="rail-tabs" role="tablist" aria-label={t("侧栏")}>
                  <button id="detail-tab" role="tab" type="button" aria-selected={railTab === 'detail'} aria-controls="definition-panel" tabIndex={railTab === 'detail' ? 0 : -1} onClick={() => setRailTab('detail')} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { setRailTab('assistant'); document.getElementById('assistant-tab')?.focus(); } }}>{t("释义")}</button>
                  <button id="assistant-tab" role="tab" type="button" aria-selected={railTab === 'assistant'} aria-controls="assistant-panel" tabIndex={railTab === 'assistant' ? 0 : -1} onClick={() => setRailTab('assistant')} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { setRailTab('detail'); document.getElementById('detail-tab')?.focus(); } }}>{t("助手")}</button>
                </div>
              )}
              <div id="definition-panel" role="tabpanel" aria-labelledby="detail-tab" hidden={railTab !== 'detail'}>
                {isDesktop && hasWordDetail ? wordDetailPanel : isDesktop && isReading ? <p className="rail-placeholder">{t("选一个词查看释义")}</p> : null}
              </div>
              <div id="assistant-panel" role="tabpanel" aria-labelledby="assistant-tab" ref={setAssistantHost} hidden={railTab !== 'assistant'} />
            </div>
          </aside>
        </main>

        <footer className="px-4 pb-6 pt-1 text-center text-xs sm:px-9" style={{ color: 'var(--ink-3)' }}>
          {t("AI也可能会犯错，请核查重要信息。")}
          <a className="mobile-repository-link" href="https://github.com/cokice/japanese-analyzer" target="_blank" rel="noopener noreferrer">{Icon.github}<span>{t("GitHub 仓库")}</span></a>
        </footer>

        {/* 设置模态框 */}
        <SettingsModal
          aiProvider={aiProvider}
          aiModel={aiModel}
          geminiApiKey={geminiApiKey}
          deepseekApiKey={deepseekApiKey}
          deepseekThinkingEnabled={deepseekThinkingEnabled}
          useStream={useStream}
          onSaveSettings={handleSaveSettings}
          isModalOpen={isSettingsModalOpen}
          onModalClose={() => setIsSettingsModalOpen(false)}
        />
      </div>

      {/* 移动端词汇详情模态 */}
      <ModalDialog
        open={!isDesktop && hasWordDetail}
        modal={false}
        onClose={handleCloseWordDetail}
        className="word-detail-modal-content"
        aria-label={t("词汇详情")}
      >
        <button
          type="button"
          className="modal-close-button"
          title={t("关闭详情")}
          aria-label={t("关闭详情")}
          onClick={handleCloseWordDetail}
        >
          <span aria-hidden="true">&times;</span>
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
      </ModalDialog>

      {/* AI聊天助手 */}
      <AIChat
        deepseekApiKey={deepseekApiKey}
        hidden={isSettingsModalOpen}
        embeddedTarget={isDesktop && isReading ? assistantHost : null}
        embeddedActive={railTab === 'assistant'}
        onEmbeddedClose={() => setRailTab('detail')}
        userApiKey={userApiKey}
        aiProvider={aiProvider}
        aiModel={aiModel}
        currentSentence={currentSentence}
      />
    </>
  );
}
