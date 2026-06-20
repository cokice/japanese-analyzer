'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import InputSection from './components/InputSection';
import AnalysisResult from './components/AnalysisResult';
import TranslationSection from './components/TranslationSection';
import SettingsModal from './components/SettingsModal';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import AIChat from './components/AIChat';
import ThinkingIndicator from './components/ThinkingIndicator';
import WordDetailPanel, { WordDetailPlaceholder } from './components/WordDetailPanel';
import { useWordDetail } from './hooks/useWordDetail';
import { Sakura } from './components/Icons';
import { trackAnalyzeUsage, trackWordDetailUsage, type AnalyzeUsageMetadata } from './utils/analytics';
import {
  analyzeSentence,
  TokenData,
  DEFAULT_AI_PROVIDER,
  AIProvider,
  TTSProvider,
  loadAISettingsFromStorage,
  streamAnalyzeSentence
} from './services/api';

export default function Home() {
  const [currentSentence, setCurrentSentence] = useState('');
  const [analyzedTokens, setAnalyzedTokens] = useState<TokenData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [useStream, setUseStream] = useState<boolean>(true);
  const [streamContent, setStreamContent] = useState('');
  const [translationTrigger, setTranslationTrigger] = useState(0);
  const [showFurigana, setShowFurigana] = useState(true);
  const [showRomaji, setShowRomaji] = useState(true);

  // API设置相关状态
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>(DEFAULT_AI_PROVIDER);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('edge');

  // 密码验证相关状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authError, setAuthError] = useState('');

  const userApiKey = aiProvider === 'gemini' ? geminiApiKey : deepseekApiKey;

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
  } = useWordDetail({ userApiKey, aiProvider, useStream });

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
        const data = await response.json();
        setRequiresAuth(data.requiresAuth);

        // 如果不需要验证，直接设置为已认证
        if (!data.requiresAuth) {
          setIsAuthenticated(true);
        } else {
          // 检查是否已经有有效的认证状态
          const authStatus = localStorage.getItem('isAuthenticated');
          if (authStatus === 'true') {
            setIsAuthenticated(true);
          }
        }
      } catch (error) {
        console.error('检查认证状态失败:', error);
        // 出错时默认不需要认证
        setRequiresAuth(false);
        setIsAuthenticated(true);
      }
    };

    checkAuthRequirement();
  }, []);

  // 从本地存储加载用户API设置
  useEffect(() => {
    const storedAISettings = loadAISettingsFromStorage(localStorage);
    const storedUseStream = localStorage.getItem('useStream');
    const storedTtsProvider = (localStorage.getItem('ttsProvider') || 'edge') as TTSProvider;

    setAiProvider(storedAISettings.aiProvider);
    setGeminiApiKey(storedAISettings.geminiApiKey);
    setDeepseekApiKey(storedAISettings.deepseekApiKey);
    setTtsProvider(storedTtsProvider);

    // 只有当明确设置了值时才更新，否则保持默认值
    if (storedUseStream !== null) {
      setUseStream(storedUseStream === 'true');
    }
  }, []);

  // 保存用户API设置
  const handleSaveSettings = (settings: {
    aiProvider: AIProvider;
    geminiApiKey: string;
    deepseekApiKey: string;
    useStream: boolean;
  }) => {
    localStorage.setItem('aiProvider', settings.aiProvider);
    localStorage.setItem('geminiApiKey', settings.geminiApiKey);
    localStorage.setItem('deepseekApiKey', settings.deepseekApiKey);
    localStorage.setItem('useStream', settings.useStream.toString());
    localStorage.removeItem('geminiApiUrl');
    localStorage.removeItem('deepseekApiUrl');
    localStorage.removeItem('userApiUrl');

    // 保留旧键，方便旧版本或其他工具读取 Gemini 密钥配置。
    localStorage.setItem('userApiKey', settings.geminiApiKey);

    setAiProvider(settings.aiProvider);
    setGeminiApiKey(settings.geminiApiKey);
    setDeepseekApiKey(settings.deepseekApiKey);
    setUseStream(settings.useStream);
  };

  const handleTtsProviderChange = (provider: TTSProvider) => {
    setTtsProvider(provider);
    localStorage.setItem('ttsProvider', provider);
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

      if (data.success) {
        setIsAuthenticated(true);
        localStorage.setItem('isAuthenticated', 'true');
      } else {
        setAuthError(data.message || '验证失败');
      }
    } catch (error) {
      console.error('验证过程中出错:', error);
      setAuthError('验证过程中发生错误，请重试');
    }
  };

  // 解析流式内容中的JSON数据
  const parseStreamContent = (content: string): TokenData[] => {
    try {
      // 如果内容为空，返回空数组
      if (!content || content.trim() === '') {
        return [];
      }

      // 尝试整理内容
      let processedContent = content;

      // 如果内容包含markdown代码块，尝试提取
      const jsonMatch = content.match(/```json\n([\s\S]*?)(\n```|$)/);
      if (jsonMatch && jsonMatch[1]) {
        processedContent = jsonMatch[1].trim();

        // 检查是否是完整的JSON数组
        if (!processedContent.endsWith(']') && processedContent.startsWith('[')) {
          console.log("发现不完整的JSON块，尝试补全");
          // 尝试找到最后一个完整的对象结束位置
          const lastObjectEnd = processedContent.lastIndexOf('},');
          if (lastObjectEnd !== -1) {
            // 截取到最后一个完整对象
            processedContent = processedContent.substring(0, lastObjectEnd + 1) + ']';
          } else {
            // 找不到完整对象，可能只有部分第一个对象
            const firstObjectStart = processedContent.indexOf('{');
            if (firstObjectStart !== -1) {
              const partialObject = processedContent.substring(firstObjectStart);
              // 检查是否至少包含一个完整的字段
              if (partialObject.includes('":')) {
                return []; // 返回空数组，等待更多内容
              }
            }
            return []; // 返回空数组，等待更多内容
          }
        }
      } else {
        // 直接查找JSON数组
        const arrayStart = processedContent.indexOf('[');
        const arrayEnd = processedContent.lastIndexOf(']');

        if (arrayStart !== -1 && arrayEnd === -1) {
          // 找到开始但没找到结束，是不完整的
          const lastObjectEnd = processedContent.lastIndexOf('},');
          if (lastObjectEnd !== -1 && lastObjectEnd > arrayStart) {
            // 有至少一个完整对象
            processedContent = processedContent.substring(arrayStart, lastObjectEnd + 1) + ']';
          } else {
            return []; // 没有完整对象，返回空等待更多内容
          }
        } else if (arrayStart !== -1 && arrayEnd !== -1) {
          // 提取数组部分
          processedContent = processedContent.substring(arrayStart, arrayEnd + 1);
        }
      }

      // 尝试解析处理后的内容
      try {
        const parsed = JSON.parse(processedContent) as TokenData[];
        // 验证数组中的对象是否有必要的字段
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validTokens = parsed.filter(item =>
            item && typeof item === 'object' && 'word' in item && 'pos' in item
          );
          if (validTokens.length > 0) {
            return validTokens;
          }
        }
        return [];
      } catch {
        return [];
      }
    } catch (e) {
      console.error("解析JSON时出错:", e);
      console.debug("尝试解析的内容:", content);
      return [];
    }
  };

  // 监听流式内容变化，尝试解析TokenData
  useEffect(() => {
    if (streamContent && isAnalyzing) {
      const tokens = parseStreamContent(streamContent);
      if (tokens.length > 0) {
        setAnalyzedTokens(tokens);
      }
    }
  }, [streamContent, isAnalyzing]);

  // 添加函数，检查是否显示分析器
  const shouldShowAnalyzer = (): boolean => analyzedTokens.length > 0;

  const handleCloseWordDetail = useCallback(() => {
    setSelectedIndex(null);
    clearWordDetail();
  }, [clearWordDetail]);

  // 点击词汇 → 查询详情
  const handleWordClick = useCallback((token: TokenData, index: number) => {
    if (selectedIndex === index) {
      handleCloseWordDetail();
      return;
    }
    setSelectedIndex(index);
    trackWordDetailUsage(aiProvider);
    fetchWordDetails(token.word, token.pos, currentSentence, token.furigana, token.romaji);
  }, [aiProvider, selectedIndex, currentSentence, fetchWordDetails, handleCloseWordDetail]);

  const handleRefreshWordDetail = useCallback(() => {
    if (selectedIndex === null) return;

    const token = analyzedTokens[selectedIndex];
    if (!token) return;

    fetchWordDetails(
      token.word,
      token.pos,
      currentSentence,
      token.furigana,
      token.romaji,
      { force: true }
    );
  }, [analyzedTokens, currentSentence, fetchWordDetails, selectedIndex]);

  const handleAnalyze = async (text: string, usage?: AnalyzeUsageMetadata) => {
    if (!text.trim()) return;

    trackAnalyzeUsage(aiProvider, usage);
    setIsAnalyzing(true);
    setAnalysisError('');
    setCurrentSentence(text);
    setTranslationTrigger(Date.now());
    setStreamContent('');
    setAnalyzedTokens([]);
    handleCloseWordDetail();

    try {
      if (useStream) {
        // 使用流式API进行分析
        streamAnalyzeSentence(
          text,
          (chunk, isDone) => {
            setStreamContent(chunk);
            if (isDone) {
              setIsAnalyzing(false);
              // 最终解析完整的内容
              const tokens = parseStreamContent(chunk);
              if (tokens.length > 0) {
                setAnalyzedTokens(tokens);
              }
            }
          },
          (error) => {
            console.error('Stream analysis error:', error);
            setAnalysisError(error.message || '流式解析错误');
            setIsAnalyzing(false);
          },
          userApiKey,
          aiProvider
        );
      } else {
        // 使用传统API进行分析
        const tokens = await analyzeSentence(text, userApiKey, aiProvider);
        setAnalyzedTokens(tokens);
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setAnalysisError(error instanceof Error ? error.message : '未知错误');
      setAnalyzedTokens([]);
      setIsAnalyzing(false);
    }
  };

  const hasWordDetail = selectedIndex !== null
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
    />
  );

  // 如果需要认证但未认证，只显示登录界面
  if (requiresAuth && !isAuthenticated) {
    return (
      <>
        <div className="flex min-h-screen flex-col items-center justify-center p-4 transition-colors duration-200">
          <div className="mb-8 text-center">
            <div className="mb-4 flex justify-center"><Sakura size={48} /></div>
            <h1 className="mb-3 text-3xl font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
              日本語文章解析
            </h1>
            <p className="text-base" style={{ color: 'var(--ink-3)' }}>
              AI驱动・深入理解日语句子结构与词义
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
          aiProvider={aiProvider}
          onSettingsClick={() => setIsSettingsModalOpen(true)}
        />

        <main className="mx-auto grid w-full max-w-[1480px] flex-1 items-start gap-[22px] px-4 pb-6 pt-2 sm:px-9 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* 主列 */}
          <div className="flex min-w-0 flex-col gap-[22px]">
            <InputSection
              onAnalyze={handleAnalyze}
              userApiKey={userApiKey}
              aiProvider={aiProvider}
              geminiApiKey={geminiApiKey}
              useStream={useStream}
              ttsProvider={ttsProvider}
              onTtsProviderChange={handleTtsProviderChange}
              isAnalyzing={isAnalyzing}
            />

            {isAnalyzing && (!analyzedTokens.length || !useStream) && (
              <div className="nd-card">
                <ThinkingIndicator className="py-6" />
              </div>
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
                  <span>解析错误：{analysisError}</span>
                </div>
              </div>
            )}

            {shouldShowAnalyzer() && (
              <AnalysisResult
                tokens={analyzedTokens}
                showFurigana={showFurigana}
                onShowFuriganaChange={setShowFurigana}
                showRomaji={showRomaji}
                onShowRomajiChange={setShowRomaji}
                onWordClick={handleWordClick}
                selectedIndex={selectedIndex}
              />
            )}

            {currentSentence && (
              <TranslationSection
                japaneseText={currentSentence}
                userApiKey={userApiKey}
                aiProvider={aiProvider}
                useStream={useStream}
                trigger={translationTrigger}
              />
            )}
          </div>

          {/* 侧栏：词汇详情（桌面端） */}
          <aside className="sticky top-4 hidden flex-col gap-4 self-start lg:flex">
            {isDesktop && hasWordDetail ? wordDetailPanel : <WordDetailPlaceholder />}
          </aside>
        </main>

        <footer className="px-4 pb-6 pt-1 text-center text-xs sm:px-9" style={{ color: 'var(--ink-3)' }}>
          AI也可能会犯错，请核查重要信息。
        </footer>

        {/* 设置模态框 */}
        <SettingsModal
          aiProvider={aiProvider}
          geminiApiKey={geminiApiKey}
          deepseekApiKey={deepseekApiKey}
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
              title="关闭详情"
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
              hideClose
            />
          </div>
        </div>,
        document.body
      )}

      {/* AI聊天助手 */}
      <AIChat
        userApiKey={userApiKey}
        aiProvider={aiProvider}
        currentSentence={currentSentence}
      />
    </>
  );
}
