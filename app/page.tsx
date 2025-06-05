'use client';

import { useState, useEffect } from 'react';
import InputSection from './components/InputSection';
import AnalysisResult from './components/AnalysisResult';
import TranslationSection from './components/TranslationSection';
import SettingsModal from './components/SettingsModal';
import { analyzeSentence, TokenData, DEFAULT_API_URL, streamAnalyzeSentence, cleanTokenFurigana } from './services/api';

export default function Home() {
  const [currentSentence, setCurrentSentence] = useState('');
  const [analyzedTokens, setAnalyzedTokens] = useState<TokenData[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [useStream, setUseStream] = useState<boolean>(true);
  const [streamContent, setStreamContent] = useState('');
  const [isJsonParseError, setIsJsonParseError] = useState(false);
  
  // API设置相关状态
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const [userApiUrl, setUserApiUrl] = useState(DEFAULT_API_URL);

  // 从本地存储加载用户API设置
  useEffect(() => {
    const storedApiKey = localStorage.getItem('userApiKey') || '';
    const storedApiUrl = localStorage.getItem('userApiUrl') || DEFAULT_API_URL;
    const storedUseStream = localStorage.getItem('useStream');
    
    setUserApiKey(storedApiKey);
    setUserApiUrl(storedApiUrl);
    
    // 只有当明确设置了值时才更新，否则保持默认值
    if (storedUseStream !== null) {
      setUseStream(storedUseStream === 'true');
    }
  }, []);
  
  // 保存用户API设置
  const handleSaveSettings = (apiKey: string, apiUrl: string, streamEnabled: boolean) => {
    localStorage.setItem('userApiKey', apiKey);
    localStorage.setItem('userApiUrl', apiUrl);
    localStorage.setItem('useStream', streamEnabled.toString());
    
    setUserApiKey(apiKey);
    setUserApiUrl(apiUrl);
    setUseStream(streamEnabled);
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
            return cleanTokenFurigana(validTokens as TokenData[]);
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
          userApiUrl
        );
      } else {
        // 使用传统API进行分析
        const tokens = await analyzeSentence(text, userApiKey, userApiUrl);
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-4 sm:pt-8 lg:pt-16 p-3 sm:p-4">
      <div className="w-full max-w-3xl">
        <header className="text-center mb-6 sm:mb-8 mt-12 sm:mt-16">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">日本語<span className="text-[#007AFF]">文章</span>解析器</h1>
          <p className="text-base sm:text-lg text-gray-600 mt-2">AI驱动・深入理解日语句子结构与词义</p>
        </header>

        <main>
          <InputSection 
            onAnalyze={handleAnalyze}
            userApiKey={userApiKey}
            userApiUrl={userApiUrl}
            useStream={useStream}
          />

          {isAnalyzing && (!analyzedTokens.length || !useStream) && (
            <div className="premium-card">
              <div className="flex items-center justify-center py-6">
                <div className="loading-spinner"></div>
                <span className="ml-3 text-gray-600">正在解析中，请稍候...</span>
              </div>
            </div>
          )}

          {isJsonParseError && streamContent && (
            <div className="premium-card">
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 sm:p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <i className="fas fa-exclamation-triangle text-yellow-500"></i>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      解析中，已经收到部分内容，但尚未形成完整的结果。
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-md overflow-auto max-h-96 text-xs font-mono whitespace-pre-wrap">
                {streamContent}
              </div>
            </div>
          )}

          {analysisError && (
            <div className="premium-card">
              <div className="bg-red-50 border-l-4 border-red-500 p-3 sm:p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <i className="fas fa-exclamation-circle text-red-500"></i>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">
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
            />
          )}

          {!isAnalyzing && currentSentence && (
            <TranslationSection 
              japaneseText={currentSentence}
              userApiKey={userApiKey}
              userApiUrl={userApiUrl}
              useStream={useStream}
            />
          )}
        </main>

        <footer className="text-center mt-8 sm:mt-12 py-4 sm:py-6 border-t border-gray-200">
          <p className="text-gray-500 text-xs sm:text-sm">&copy; 2025 高级日语解析工具 by Howen. All rights reserved.</p>
          
        </footer>
      </div>
      
      {/* 设置模态框 */}
      <SettingsModal
        userApiKey={userApiKey}
        userApiUrl={userApiUrl}
        defaultApiUrl={DEFAULT_API_URL}
        useStream={useStream}
        onSaveSettings={handleSaveSettings}
        isModalOpen={isSettingsModalOpen}
        onModalClose={() => setIsSettingsModalOpen(!isSettingsModalOpen)}
      />
    </div>
  );
}
