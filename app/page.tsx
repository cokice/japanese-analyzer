'use client';

import { useState, useEffect } from 'react';
import InputSection from './components/InputSection';
import AnalysisResult from './components/AnalysisResult';
import TranslationSection from './components/TranslationSection';
import SettingsModal from './components/SettingsModal';
import TopToolbar from './components/TopToolbar';
import LoginModal from './components/LoginModal';
import AIChat from './components/AIChat';
import ThinkingIndicator from './components/ThinkingIndicator';
import {
  analyzeSentence,
  TokenData,
  DEFAULT_API_URL,
  DEFAULT_AI_PROVIDER,
  AIProvider,
  loadAISettingsFromStorage,
  streamAnalyzeSentence
} from './services/api';
import { FaExclamationTriangle, FaExclamationCircle } from 'react-icons/fa';

export default function Home() {
  const [currentSentence, setCurrentSentence] = useState('');
  const [analyzedTokens, setAnalyzedTokens] = useState<TokenData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [useStream, setUseStream] = useState<boolean>(true);
  const [streamContent, setStreamContent] = useState('');
  const [isJsonParseError, setIsJsonParseError] = useState(false);
  const [translationTrigger, setTranslationTrigger] = useState(0);
  const [showFurigana, setShowFurigana] = useState(true);
  
  // API设置相关状态
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>(DEFAULT_AI_PROVIDER);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiApiUrl, setGeminiApiUrl] = useState(DEFAULT_API_URL);
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [deepseekApiUrl, setDeepseekApiUrl] = useState(DEFAULT_API_URL);
  const [ttsProvider, setTtsProvider] = useState<'edge' | 'gemini'>('edge');
  
  // 密码验证相关状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [authError, setAuthError] = useState('');

  const userApiKey = aiProvider === 'gemini' ? geminiApiKey : deepseekApiKey;
  const userApiUrl = aiProvider === 'gemini' ? geminiApiUrl : deepseekApiUrl;

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
    const storedTtsProvider = (localStorage.getItem('ttsProvider') || 'edge') as 'edge' | 'gemini';
    
    setAiProvider(storedAISettings.aiProvider);
    setGeminiApiKey(storedAISettings.geminiApiKey);
    setGeminiApiUrl(storedAISettings.geminiApiUrl);
    setDeepseekApiKey(storedAISettings.deepseekApiKey);
    setDeepseekApiUrl(storedAISettings.deepseekApiUrl);
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
    geminiApiUrl: string;
    deepseekApiKey: string;
    deepseekApiUrl: string;
    useStream: boolean;
  }) => {
    localStorage.setItem('aiProvider', settings.aiProvider);
    localStorage.setItem('geminiApiKey', settings.geminiApiKey);
    localStorage.setItem('geminiApiUrl', settings.geminiApiUrl);
    localStorage.setItem('deepseekApiKey', settings.deepseekApiKey);
    localStorage.setItem('deepseekApiUrl', settings.deepseekApiUrl);
    localStorage.setItem('useStream', settings.useStream.toString());

    // 保留旧键，方便旧版本或其他工具读取 Gemini 配置。
    localStorage.setItem('userApiKey', settings.geminiApiKey);
    localStorage.setItem('userApiUrl', settings.geminiApiUrl);

    setAiProvider(settings.aiProvider);
    setGeminiApiKey(settings.geminiApiKey);
    setGeminiApiUrl(settings.geminiApiUrl);
    setDeepseekApiKey(settings.deepseekApiKey);
    setDeepseekApiUrl(settings.deepseekApiUrl);
    setUseStream(settings.useStream);
  };

  const handleTtsProviderChange = (provider: 'edge' | 'gemini') => {
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
      } catch (e) {
        console.log("无法解析处理后的JSON:", processedContent);
        console.error(e);
        return [];
      }
    } catch (e) {
      console.error("解析JSON时出错:", e);
      console.debug("尝试解析的内容:", content);
      setIsJsonParseError(true);
      return [];
    }
  };

  // 监听流式内容变化，尝试解析TokenData
  useEffect(() => {
    if (streamContent && isAnalyzing) {
      const tokens = parseStreamContent(streamContent);
      if (tokens.length > 0) {
        setAnalyzedTokens(tokens);
        setIsJsonParseError(false);
      } else if (streamContent.includes('{') && streamContent.includes('"word":')) {
        // 有内容但解析失败，可能是不完整的JSON
        setIsJsonParseError(true);
      }
    }
  }, [streamContent, isAnalyzing]);

  // 添加函数，检查是否显示分析器
  const shouldShowAnalyzer = (): boolean => {
    // 如果已经有解析结果，显示
    if (analyzedTokens.length > 0) return true;
    
    // 如果没有内容，不显示
    if (!streamContent) return false;
    
    // 如果有内容但解析失败，看情况
    if (isJsonParseError) {
      // 如果内容已经包含了完整的单词信息，可能是接近完成了
      return streamContent.includes('"word":') && streamContent.includes('"pos":');
    }
    
    return false;
  };

  const handleAnalyze = async (text: string) => {
    if (!text) return;

    setIsAnalyzing(true);
    setAnalysisError('');
    setCurrentSentence(text);
    setTranslationTrigger(Date.now());
    setStreamContent('');
    setAnalyzedTokens([]);
    setIsJsonParseError(false);
    
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
                setIsJsonParseError(false);
              } else if (chunk && chunk.includes('{') && chunk.includes('"word":')) {
                // 最终内容仍然解析失败
                setIsJsonParseError(true);
              }
            }
          },
          (error) => {
            console.error('Stream analysis error:', error);
            setAnalysisError(error.message || '流式解析错误');
            setIsAnalyzing(false);
          },
          userApiKey,
          userApiUrl,
          aiProvider
        );
      } else {
        // 使用传统API进行分析
        const tokens = await analyzeSentence(text, userApiKey, userApiUrl, aiProvider);
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

  // 如果需要认证但未认证，只显示登录界面
  if (requiresAuth && !isAuthenticated) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
          <div className="text-center mb-8">
            <h1 className="md-typescale-display-medium text-gray-800 dark:text-gray-100 transition-colors duration-200 mb-3">
              日本語<span className="text-primary">文章解析器</span>
            </h1>
            <p className="md-typescale-title-medium text-gray-600 dark:text-gray-400 transition-colors duration-200">
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
      <div className="min-h-screen flex flex-col items-center justify-start pt-16 sm:pt-20 lg:pt-24 p-3 sm:p-4 bg-white dark:bg-gray-900 transition-colors duration-200">
        {/* 顶部工具栏 */}
        <TopToolbar onSettingsClick={() => setIsSettingsModalOpen(true)} />
        
        <div className="w-full max-w-3xl">
          <header className="text-center mb-8 sm:mb-12">
            <h1 className="md-typescale-display-medium text-gray-800 dark:text-gray-100 transition-colors duration-200 mb-3">
              日本語<span className="text-primary">文章解析器</span>
            </h1>
            <p className="md-typescale-title-medium text-gray-600 dark:text-gray-400 transition-colors duration-200">
              AI驱动・深入理解日语句子结构与词义
            </p>
          </header>

          <main>
            <InputSection 
              onAnalyze={handleAnalyze}
              userApiKey={userApiKey}
              userApiUrl={userApiUrl}
              aiProvider={aiProvider}
              geminiApiKey={geminiApiKey}
              useStream={useStream}
              ttsProvider={ttsProvider}
              onTtsProviderChange={handleTtsProviderChange}
              isAnalyzing={isAnalyzing}
            />

            {isAnalyzing && (!analyzedTokens.length || !useStream) && (
              <div className="premium-card">
                <ThinkingIndicator className="py-6" />
              </div>
            )}

            {isJsonParseError && streamContent && (
              <div className="premium-card">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-3 sm:p-4 mb-4 transition-colors duration-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <FaExclamationTriangle className="text-yellow-500" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 transition-colors duration-200">
                        解析中，已经收到部分内容，但尚未形成完整的结果。
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md overflow-auto max-h-96 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 transition-colors duration-200">
                  {streamContent}
                </div>
              </div>
            )}

            {analysisError && (
              <div className="premium-card">
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 sm:p-4 transition-colors duration-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <FaExclamationCircle className="text-red-500" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700 dark:text-red-300 transition-colors duration-200">
                        解析错误：{analysisError}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {shouldShowAnalyzer() && (
              <AnalysisResult 
                tokens={analyzedTokens}
                originalSentence={currentSentence}
                userApiKey={userApiKey}
                userApiUrl={userApiUrl}
                aiProvider={aiProvider}
                showFurigana={showFurigana}
                onShowFuriganaChange={setShowFurigana}
                useStream={useStream}
              />
            )}

            {currentSentence && (
              <TranslationSection
                japaneseText={currentSentence}
                userApiKey={userApiKey}
                userApiUrl={userApiUrl}
                aiProvider={aiProvider}
                useStream={useStream}
                trigger={translationTrigger}
              />
            )}
          </main>

          <footer className="text-center mt-8 sm:mt-12 py-4 sm:py-6 border-t border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <p className="md-typescale-body-medium text-gray-500 dark:text-gray-400 transition-colors duration-200">&copy; 2025 高级日语解析工具 by Howen. All rights reserved.</p>
            
          </footer>
        </div>
        
        {/* 设置模态框 */}
        <SettingsModal
          aiProvider={aiProvider}
          geminiApiKey={geminiApiKey}
          geminiApiUrl={geminiApiUrl}
          deepseekApiKey={deepseekApiKey}
          deepseekApiUrl={deepseekApiUrl}
          defaultApiUrl={DEFAULT_API_URL}
          useStream={useStream}
          onSaveSettings={handleSaveSettings}
          isModalOpen={isSettingsModalOpen}
          onModalClose={() => setIsSettingsModalOpen(!isSettingsModalOpen)}
        />
      </div>
      
      {/* AI聊天助手 - 移到主容器外面 */}
      <AIChat 
        userApiKey={userApiKey}
        userApiUrl={userApiUrl}
        aiProvider={aiProvider}
        currentSentence={currentSentence}
      />
    </>
  );
}
