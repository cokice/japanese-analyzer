'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import InputSection from './components/InputSection';
import TranslationSection from './components/TranslationSection';
import SettingsModal from './components/SettingsModal';
import Header from './components/Header';
import LoginModal from './components/LoginModal';
import AIChat from './components/AIChat';
import ThinkingIndicator from './components/ThinkingIndicator';
import ReasoningStream from './components/ReasoningStream';
import WordDetailPanel from './components/WordDetailPanel';
import type { AnnotationReadingMode } from './types/annotation';
import { useWordDetail } from './hooks/useWordDetail';
import { trackAnalyzeUsage, trackWordDetailUsage, type AnalyzeUsageMetadata } from './utils/analytics';
import {
  analyzeSentence,
  AIModelName,
  TokenData,
  DEFAULT_AI_PROVIDER,
  AIProvider,
  TTSProvider,
  getModelName,
  loadAISettingsFromStorage,
  parseAnalyzeResponseContent,
  reconcileTokenWhitespaceToSource,
  summarizeDeepSeekReasoningProgress,
  streamAnalyzeSentence,
  streamProofreadTokens
} from './services/api';
import { ReasoningSummaryController } from './utils/reasoningSummary';
import { ReasoningTextStore } from './utils/reasoningTextStore';
import {
  applyProofreadCorrections,
  findTokenByProofreadSourceIndex,
  getTokenProofreadSourceIndex,
} from './utils/applyProofreadCorrections';
import { writeClientDebugLog } from './utils/clientDebugLog';

export default function Home() {
  const [currentSentence, setCurrentSentence] = useState('');
  const [analyzedTokens, setAnalyzedTokens] = useState<TokenData[]>([]);
  const analyzedTokensRef = useRef<TokenData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [useStream, setUseStream] = useState<boolean>(true);
  const [streamContent, setStreamContent] = useState('');
  const [translationTrigger, setTranslationTrigger] = useState(0);
  const [annotationReadingMode, setAnnotationReadingMode] = useState<AnnotationReadingMode>('furigana');
  const [showPosColors, setShowPosColors] = useState(false);

  // API设置相关状态
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>(DEFAULT_AI_PROVIDER);
  const [aiModel, setAiModel] = useState<AIModelName>(getModelName(DEFAULT_AI_PROVIDER));
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [deepseekThinkingEnabled, setDeepseekThinkingEnabled] = useState(false);
  const [hasDeepseekReasoning, setHasDeepseekReasoning] = useState(false);
  const hasDeepseekReasoningRef = useRef(false);
  const reasoningTextStoreRef = useRef<ReasoningTextStore | null>(null);
  if (reasoningTextStoreRef.current === null) {
    reasoningTextStoreRef.current = new ReasoningTextStore();
  }
  const reasoningTextStore = reasoningTextStoreRef.current;
  const [deepseekReasoningDone, setDeepseekReasoningDone] = useState(true);
  const [deepseekReasoningSummaryHistory, setDeepseekReasoningSummaryHistory] = useState<string[]>([]);
  const [deepseekReasoningCompletionLabel, setDeepseekReasoningCompletionLabel] = useState('已深度校對');
  const reasoningSummaryControllerRef = useRef<ReasoningSummaryController | null>(null);
  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const proofreadAbortControllerRef = useRef<AbortController | null>(null);
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('edge');

  // 密码验证相关状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authError, setAuthError] = useState('');

  const userApiKey = aiProvider === 'gemini' ? geminiApiKey : deepseekApiKey;

  // 选中词汇（右侧详情面板 / 移动端模态）
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedIndexRef = useRef<number | null>(null);
  const [isWordDetailPanelOpen, setIsWordDetailPanelOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const {
    wordDetail,
    isLoading: isWordDetailLoading,
    isStreamLoading: isWordDetailStreaming,
    streamContent: wordDetailStreamContent,
    streamError: wordDetailStreamError,
    fetchWordDetails,
    clearWordDetail,
  } = useWordDetail({ userApiKey, aiProvider, aiModel, useStream });

  useEffect(() => {
    analyzedTokensRef.current = analyzedTokens;
  }, [analyzedTokens]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // 侧栏在 lg(1024px) 以上显示，以下使用模态
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  useEffect(() => () => {
    analysisAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current?.abort();
    reasoningSummaryControllerRef.current?.cancel();
  }, []);

  // 检查是否需要密码验证
  useEffect(() => {
    const checkAuthRequirement = async () => {
      try {
        const response = await fetch('/api/auth');
        const data = await response.json();
        setRequiresAuth(data.requiresAuth);

        if (!data.requiresAuth || data.authenticated) {
          setIsAuthenticated(true);
          return;
        }

        localStorage.removeItem('isAuthenticated');
        setIsAuthenticated(false);
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

  // 保存用户API设置
  const handleSaveSettings = (settings: {
    aiProvider: AIProvider;
    aiModel: AIModelName;
    geminiApiKey: string;
    deepseekApiKey: string;
    useStream: boolean;
  }) => {
    localStorage.setItem('aiProvider', settings.aiProvider);
    localStorage.setItem('aiModel', settings.aiModel);
    localStorage.setItem('geminiApiKey', settings.geminiApiKey);
    localStorage.setItem('deepseekApiKey', settings.deepseekApiKey);
    localStorage.setItem('useStream', settings.useStream.toString());
    localStorage.removeItem('geminiApiUrl');
    localStorage.removeItem('deepseekApiUrl');
    localStorage.removeItem('userApiUrl');

    // 保留旧键，方便旧版本或其他工具读取 Gemini 密钥配置。
    localStorage.setItem('userApiKey', settings.geminiApiKey);

    setAiProvider(settings.aiProvider);
    setAiModel(settings.aiModel);
    setGeminiApiKey(settings.geminiApiKey);
    setDeepseekApiKey(settings.deepseekApiKey);
    setUseStream(settings.useStream);
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel('已深度思考');
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    proofreadAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current = null;
  };

  const handleDeepseekThinkingChange = (enabled: boolean) => {
    setDeepseekThinkingEnabled(enabled);
    localStorage.setItem('deepseekThinkingEnabled', enabled.toString());
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel('已深度思考');
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    proofreadAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current = null;
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
        localStorage.removeItem('isAuthenticated');
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

  const handleCloseWordDetail = useCallback(() => {
    setSelectedIndex(null);
    setIsWordDetailPanelOpen(false);
    clearWordDetail();
  }, [clearWordDetail]);

  // 点击词汇 → 查询详情
  const handleWordClick = useCallback((token: TokenData, index: number) => {
    if (selectedIndex === index) {
      handleCloseWordDetail();
      return;
    }
    setSelectedIndex(index);
    setIsWordDetailPanelOpen(false);
    trackWordDetailUsage(aiProvider, aiModel);
    fetchWordDetails(token.word, token.pos, currentSentence, token.furigana, token.romaji);
  }, [aiProvider, aiModel, selectedIndex, currentSentence, fetchWordDetails, handleCloseWordDetail]);

  const handleOpenWordDetails = useCallback(() => {
    if (selectedIndex !== null) setIsWordDetailPanelOpen(true);
  }, [selectedIndex]);

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

    writeClientDebugLog({
      scope: 'analysis.client',
      event: 'analysis.started',
      message: `开始解析 ${text.length} 字日文`,
      data: {
        source: text,
        characters: text.length,
        provider: aiProvider,
        model: aiModel,
        stream: useStream,
        proofreadingEnabled: aiProvider === 'deepseek' && deepseekThinkingEnabled,
      },
    });

    analysisAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current = null;
    const analysisAbortController = new AbortController();
    analysisAbortControllerRef.current = analysisAbortController;
    const isCurrentAnalysis = () => (
      analysisAbortControllerRef.current === analysisAbortController
      && !analysisAbortController.signal.aborted
    );

    trackAnalyzeUsage(aiProvider, usage, aiModel);
    setIsAnalyzing(true);
    setAnalysisError('');
    setCurrentSentence(text);
    setTranslationTrigger(Date.now());
    setStreamContent('');
    setAnalyzedTokens([]);
    const deepseekProofreadActive = aiProvider === 'deepseek' && deepseekThinkingEnabled;
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel('已深度思考');
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    handleCloseWordDetail();

    const analysisOptions = {
      deepseekThinkingEnabled: false,
      signal: analysisAbortController.signal,
    };

    const launchProofread = (tokens: TokenData[]) => {
      if (!deepseekProofreadActive || tokens.length === 0) return;

      const proofreadTokens = reconcileTokenWhitespaceToSource(text, tokens) ?? tokens;
      if (proofreadTokens !== tokens) {
        analyzedTokensRef.current = proofreadTokens;
        setAnalyzedTokens(proofreadTokens);
        setStreamContent(JSON.stringify({ tokens: proofreadTokens }));
        writeClientDebugLog({
          level: 'warn',
          scope: 'proofread.client',
          event: 'draft.whitespace-reconciled',
          message: '审校启动前已按原文恢复底稿空白字符',
          data: {
            source: text,
            before: tokens.map((token) => token.word).join(''),
            after: proofreadTokens.map((token) => token.word).join(''),
          },
        });
      } else {
        analyzedTokensRef.current = tokens;
      }
      const proofreadController = new AbortController();
      proofreadAbortControllerRef.current = proofreadController;
      const startedAt = performance.now();
      reasoningTextStore.reset();
      hasDeepseekReasoningRef.current = true;
      setHasDeepseekReasoning(true);
      setDeepseekReasoningDone(false);
      setDeepseekReasoningSummaryHistory([]);
      setDeepseekReasoningCompletionLabel('已深度校對');
      reasoningSummaryControllerRef.current?.cancel();
      let progressLabel = '深度校對中 · 0/0 句';
      const isProgressLabel = (summary: string) => summary.startsWith('深度校對中 · ');
      const updateProgressLabel = (completed: number, total: number) => {
        progressLabel = `深度校對中 · ${completed}/${total} 句`;
        setDeepseekReasoningSummaryHistory((current) => [
          ...current.filter((summary) => !isProgressLabel(summary)),
          progressLabel,
        ]);
      };
      const reasoningSummaryController = new ReasoningSummaryController({
        requestSummary: ({ reasoningSnippet, signal }) => (
          summarizeDeepSeekReasoningProgress({
            reasoningSnippet,
            userApiKey,
            signal,
          })
        ),
        onSummary: (summary) => {
          if (proofreadAbortControllerRef.current !== proofreadController) return;
          if (!summary) return;
          setDeepseekReasoningSummaryHistory((current) => {
            const withoutProgress = current.filter((item) => !isProgressLabel(item));
            if (isProgressLabel(summary)) return [...withoutProgress, summary];
            return [...withoutProgress, summary, progressLabel];
          });
        },
        onError: (error) => {
          console.warn('DeepSeek proofreading summary skipped:', error);
        },
      });
      reasoningSummaryControllerRef.current = reasoningSummaryController;
      reasoningSummaryController.start('');

      const finishProofreadStatus = (completionLabel: string) => {
        if (proofreadAbortControllerRef.current !== proofreadController) return;
        reasoningSummaryController.finish();
        if (reasoningSummaryControllerRef.current === reasoningSummaryController) {
          reasoningSummaryControllerRef.current = null;
        }
        setDeepseekReasoningCompletionLabel(completionLabel);
        setDeepseekReasoningDone(true);
      };

      console.info(`[深度审校] 已启动，底稿 ${proofreadTokens.length} 词`);
      writeClientDebugLog({
        scope: 'proofread.client',
        event: 'proofread.started',
        message: `深度审校已启动，底稿 ${proofreadTokens.length} 词`,
        data: {
          source: text,
          tokens: proofreadTokens,
          sourceCharacters: text.length,
          tokenCount: proofreadTokens.length,
          model: aiModel,
        },
      });

      void streamProofreadTokens(
        text,
        proofreadTokens,
        userApiKey,
        aiModel,
        {
          signal: proofreadController.signal,
          onStart: (totalSentences) => {
            if (proofreadAbortControllerRef.current !== proofreadController) return;
            updateProgressLabel(0, totalSentences);
            console.info(`[深度审校] 已分为 ${totalSentences} 句，并发 2`);
            writeClientDebugLog({
              scope: 'proofread.client',
              event: 'proofread.partitioned',
              message: `审校已分为 ${totalSentences} 句`,
              data: { totalSentences, concurrency: 2 },
            });
          },
          onUsage: (usage, sentenceIndex) => {
            if (proofreadAbortControllerRef.current !== proofreadController) return;
            console.info(`[深度审校] 第 ${sentenceIndex + 1} 句 Token用量 ${JSON.stringify(usage)}`);
            writeClientDebugLog({
              scope: 'proofread.client',
              event: 'sentence.usage',
              message: `第 ${sentenceIndex + 1} 句返回 token 用量`,
              data: { sentenceIndex, usage },
            });
          },
          onReasoning: (reasoningText) => {
            if (
              proofreadAbortControllerRef.current !== proofreadController
              || proofreadController.signal.aborted
            ) {
              return;
            }
            reasoningTextStore.setText(reasoningText);
            reasoningSummaryController.ingest(reasoningText);
          },
          onSentenceComplete: (sentenceResult) => {
            if (
              proofreadAbortControllerRef.current !== proofreadController
              || proofreadController.signal.aborted
            ) {
              return;
            }
            console.info(
              `[深度审校] 第 ${sentenceResult.sentenceIndex + 1} 句修正清单原文 ${sentenceResult.rawContent}`
            );
            writeClientDebugLog({
              scope: 'proofread.client',
              event: 'sentence.completed',
              message: `第 ${sentenceResult.sentenceIndex + 1} 句审校完成，修正 ${sentenceResult.corrections.length} 处`,
              data: sentenceResult,
            });
            if (sentenceResult.corrections.length === 0) return;

            const currentTokens = analyzedTokensRef.current;
            const currentSelectedIndex = selectedIndexRef.current;
            const selectedSourceIndex = currentSelectedIndex === null
              ? null
              : getTokenProofreadSourceIndex(
                currentTokens[currentSelectedIndex],
                currentSelectedIndex
              );
            const nextTokens = applyProofreadCorrections(
              currentTokens,
              sentenceResult.corrections
            );
            analyzedTokensRef.current = nextTokens;
            setAnalyzedTokens(nextTokens);

            if (selectedSourceIndex !== null) {
              const nextSelectedIndex = findTokenByProofreadSourceIndex(
                nextTokens,
                selectedSourceIndex
              );
              selectedIndexRef.current = nextSelectedIndex >= 0 ? nextSelectedIndex : null;
              setSelectedIndex(nextSelectedIndex >= 0 ? nextSelectedIndex : null);
            }
          },
          onProgress: (completed, total, sentenceResult) => {
            if (proofreadAbortControllerRef.current !== proofreadController) return;
            updateProgressLabel(completed, total);
            if (sentenceResult.status === 'failed') {
              console.info(
                `[深度审校] 第 ${sentenceResult.sentenceIndex + 1}/${total} 句已跳过：${sentenceResult.error}`
              );
              writeClientDebugLog({
                level: 'warn',
                scope: 'proofread.client',
                event: 'sentence.skipped',
                message: `第 ${sentenceResult.sentenceIndex + 1}/${total} 句已跳过`,
                data: sentenceResult,
              });
            }
          },
        }
      )
        .then((result) => {
          if (
            proofreadAbortControllerRef.current !== proofreadController
            || proofreadController.signal.aborted
          ) {
            return;
          }
          const elapsedSeconds = (performance.now() - startedAt) / 1000;
          console.info(`[深度审校] 修正清单原文 ${result.rawContent}`);
          console.info(`[深度审校] 修正清单 ${JSON.stringify(result.corrections)}`);
          console.info(`[深度审校] 完成，用时 ${elapsedSeconds.toFixed(1)} 秒`);
          writeClientDebugLog({
            scope: 'proofread.client',
            event: 'proofread.completed',
            message: `深度审校完成，用时 ${elapsedSeconds.toFixed(1)} 秒`,
            data: result,
          });
          finishProofreadStatus(
            result.failedSentences > 0
              ? `已深度校對(${result.completedSentences}/${result.totalSentences} 句)· 修正 ${result.corrections.length} 处`
              : `已深度校對 · 修正 ${result.corrections.length} 处`
          );
        })
        .catch((error) => {
          if (
            proofreadAbortControllerRef.current !== proofreadController
            || proofreadController.signal.aborted
          ) {
            return;
          }
          const elapsedSeconds = (performance.now() - startedAt) / 1000;
          const message = error instanceof Error ? error.message : '未知错误';
          console.info(`[深度审校] 已静默放弃，用时 ${elapsedSeconds.toFixed(1)} 秒：${message}`);
          writeClientDebugLog({
            level: 'error',
            scope: 'proofread.client',
            event: 'proofread.failed',
            message: `深度审校未完成：${message}`,
            data: { elapsedSeconds, error: message },
          });
          finishProofreadStatus('深度校對未完成');
        })
        .finally(() => {
          if (proofreadAbortControllerRef.current === proofreadController) {
            proofreadAbortControllerRef.current = null;
          }
        });
    };

    try {
      if (useStream) {
        // 使用流式API进行分析
        streamAnalyzeSentence(
          text,
          (chunk, isDone) => {
            if (!isCurrentAnalysis()) return;
            setStreamContent(chunk);
            if (isDone) {
              setIsAnalyzing(false);
              analysisAbortControllerRef.current = null;
              try {
                const tokens = parseAnalyzeResponseContent(chunk);
                setAnalyzedTokens(tokens);
                writeClientDebugLog({
                  scope: 'analysis.client',
                  event: 'analysis.completed',
                  message: `流式解析完成，生成 ${tokens.length} 个词元`,
                  data: {
                    source: text,
                    tokens,
                    tokenCount: tokens.length,
                    characters: text.length,
                  },
                });
                launchProofread(tokens);
              } catch (error) {
                console.error('Final stream analysis parse error:', error);
                setAnalysisError('解析结果JSON格式错误');
              }
            }
          },
          (error) => {
            if (!isCurrentAnalysis()) return;
            console.error('Stream analysis error:', error);
            writeClientDebugLog({
              level: 'error',
              scope: 'analysis.client',
              event: 'analysis.failed',
              message: `流式解析失败：${error.message || '未知错误'}`,
              data: error,
            });
            setAnalysisError(error.message || '流式解析错误');
            setStreamContent('');
            setAnalyzedTokens([]);
            setIsAnalyzing(false);
            analysisAbortControllerRef.current = null;
          },
          userApiKey,
          aiProvider,
          aiModel,
          analysisOptions
        );
      } else {
        // 使用传统API进行分析
        const tokens = await analyzeSentence(
          text,
          userApiKey,
          aiProvider,
          aiModel,
          analysisOptions
        );
        if (!isCurrentAnalysis()) return;
        setAnalyzedTokens(tokens);
        writeClientDebugLog({
          scope: 'analysis.client',
          event: 'analysis.completed',
          message: `解析完成，生成 ${tokens.length} 个词元`,
          data: {
            source: text,
            tokens,
            tokenCount: tokens.length,
            characters: text.length,
          },
        });
        setIsAnalyzing(false);
        analysisAbortControllerRef.current = null;
        launchProofread(tokens);
      }
    } catch (error) {
      if (!isCurrentAnalysis()) return;
      console.error('Analysis error:', error);
      writeClientDebugLog({
        level: 'error',
        scope: 'analysis.client',
        event: 'analysis.failed',
        message: `解析失败：${error instanceof Error ? error.message : '未知错误'}`,
        data: error,
      });
      setAnalysisError(error instanceof Error ? error.message : '未知错误');
      setAnalyzedTokens([]);
      setIsAnalyzing(false);
      analysisAbortControllerRef.current = null;
    }
  };

  const handleCancelAnalysis = () => {
    const controller = analysisAbortControllerRef.current;
    analysisAbortControllerRef.current = null;
    if (controller && !controller.signal.aborted) controller.abort();
    proofreadAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current = null;
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setIsAnalyzing(false);
    setAnalysisError('');
    setCurrentSentence('');
    setTranslationTrigger(0);
    setStreamContent('');
    setAnalyzedTokens([]);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel('已深度思考');
    setDeepseekReasoningDone(true);
    handleCloseWordDetail();
  };

  const handleResetAnalysis = () => {
    const controller = analysisAbortControllerRef.current;
    analysisAbortControllerRef.current = null;
    if (controller && !controller.signal.aborted) controller.abort();
    proofreadAbortControllerRef.current?.abort();
    proofreadAbortControllerRef.current = null;
    reasoningSummaryControllerRef.current?.cancel();
    reasoningSummaryControllerRef.current = null;
    reasoningTextStore.reset();
    hasDeepseekReasoningRef.current = false;
    setHasDeepseekReasoning(false);
    setIsAnalyzing(false);
    setAnalysisError('');
    setCurrentSentence('');
    setTranslationTrigger(0);
    setStreamContent('');
    setAnalyzedTokens([]);
    setDeepseekReasoningDone(true);
    setDeepseekReasoningSummaryHistory([]);
    setDeepseekReasoningCompletionLabel('已深度思考');
    handleCloseWordDetail();
  };

  const hasWordDetail = selectedIndex !== null
    && (isWordDetailLoading || isWordDetailStreaming || wordDetail !== null || !!wordDetailStreamError);
  const showDesktopWordDetail = isDesktop && isWordDetailPanelOpen && hasWordDetail;

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
      <div className="paper-page flex min-h-screen flex-col">
        <Header
          thinking={isAnalyzing}
          aiModel={aiModel}
          onSettingsClick={() => setIsSettingsModalOpen(true)}
        />

        <main className="paper-main mx-auto grid w-full max-w-[900px] flex-1 items-start gap-[22px] px-4 pb-6 pt-2 sm:px-[54px]">
          {/* 主列 */}
          <div className="flex min-w-0 flex-col gap-[22px]">
            <InputSection
              onAnalyze={handleAnalyze}
              onCancelAnalyze={handleCancelAnalysis}
              userApiKey={userApiKey}
              aiProvider={aiProvider}
              geminiApiKey={geminiApiKey}
              useStream={useStream}
              deepseekThinkingEnabled={deepseekThinkingEnabled}
              onDeepseekThinkingChange={handleDeepseekThinkingChange}
              ttsProvider={ttsProvider}
              onTtsProviderChange={handleTtsProviderChange}
              isAnalyzing={isAnalyzing}
              analyzedTokens={analyzedTokens}
              readingMode={annotationReadingMode}
              onReadingModeChange={setAnnotationReadingMode}
              showPosColors={showPosColors}
              onShowPosColorsChange={setShowPosColors}
              onWordClick={handleWordClick}
              isDesktop={isDesktop}
              wordDetail={wordDetail}
              isWordDetailLoading={isWordDetailLoading}
              isWordDetailStreaming={isWordDetailStreaming}
              onOpenWordDetails={handleOpenWordDetails}
              selectedIndex={selectedIndex}
              onResetAnalysis={handleResetAnalysis}
            />

            {aiProvider === 'deepseek'
              && deepseekThinkingEnabled
              && hasDeepseekReasoning && (
                <ReasoningStream
                  store={reasoningTextStore}
                  done={deepseekReasoningDone}
                  summaryHistory={deepseekReasoningSummaryHistory}
                  completionLabel={deepseekReasoningCompletionLabel}
                />
              )}

            {isAnalyzing
              && (!analyzedTokens.length || !useStream)
              && !hasDeepseekReasoning && (
              <div className="analysis-thinking-strip">
                <ThinkingIndicator />
              </div>
            )}

            {analysisError && (
              <div className="paper-notice is-error" role="alert">
                <span className="paper-notice-mark" aria-hidden="true">!</span>
                <span>解析错误：{analysisError}</span>
              </div>
            )}

            {currentSentence && !isAnalyzing && analyzedTokens.length > 0 && (
              <TranslationSection
                japaneseText={currentSentence}
                userApiKey={userApiKey}
                aiProvider={aiProvider}
                aiModel={aiModel}
                useStream={useStream}
                trigger={translationTrigger}
              />
            )}
          </div>

          {/* 侧栏：词汇详情（桌面端） */}
          {showDesktopWordDetail && (
            <aside className="desktop-word-detail-drawer">
              {wordDetailPanel}
            </aside>
          )}
        </main>

        <footer className="paper-footer">
          <span>解析由 AI 生成,細節請以詞典為準</span>
          <span className="paper-colophon">日本語文章解析</span>
        </footer>

        {/* 设置模态框 */}
        <SettingsModal
          aiProvider={aiProvider}
          aiModel={aiModel}
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
        aiModel={aiModel}
        currentSentence={currentSentence}
      />
    </>
  );
}
