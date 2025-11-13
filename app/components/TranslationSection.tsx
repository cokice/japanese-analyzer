'use client';

import { useState, useEffect } from 'react';
import { translateText, streamTranslateText } from '../services/api';

interface TranslationSectionProps {
  japaneseText: string;
  userApiKey?: string;
  userApiUrl?: string;
  useStream?: boolean;
  trigger?: number;
}

export default function TranslationSection({
  japaneseText,
  userApiKey,
  userApiUrl,
  useStream = true, // 默认为true，保持向后兼容
  trigger
}: TranslationSectionProps) {
  const [translation, setTranslation] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const handleTranslate = async () => {
    if (!japaneseText) {
      alert('请先输入或分析日语句子！');
      return;
    }

    setIsLoading(true);
    setIsVisible(true); // 确保显示翻译区域
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
          userApiUrl
        );
      } else {
        // 使用传统API进行翻译
        const translatedText = await translateText(japaneseText, userApiKey, userApiUrl);
        setTranslation(translatedText);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error during full sentence translation:', error);
      setTranslation(`翻译时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`);
      setIsLoading(false);
    }
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  // 当trigger变化时自动开始翻译
  useEffect(() => {
    if (trigger && japaneseText) {
      handleTranslate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <>
      <div className="mt-6 flex flex-col sm:flex-row sm:justify-center space-y-3 sm:space-y-0 sm:space-x-4">
        <button
          id="translateSentenceButton"
          className="premium-button premium-button-primary w-full sm:w-auto z-0"
          onClick={handleTranslate}
          disabled={isLoading}
        >
          {!isLoading && <span className="button-text">翻译整句</span>}
          <div className="loading-spinner" style={{ display: isLoading ? 'inline-block' : 'none' }}></div>
          {isLoading && <span className="button-text">翻译中...</span>}
        </button>
      </div>

      {(isLoading || translation) && (
        <div id="fullTranslationCard" className="premium-card mt-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-2xl font-semibold text-gray-700" style={{ marginBottom: isVisible ? '0.75rem' : '0' }}>全文翻译 (中)</h2>
            <button 
              id="toggleFullTranslationButton" 
              className="premium-button premium-button-outlined text-sm px-3 py-1"
              onClick={toggleVisibility}
            >
              {isVisible ? '隐藏' : '显示'}
            </button>
          </div>
          
          {isVisible && (
            <div id="fullTranslationOutput" className="text-gray-800 p-3 bg-gray-50 rounded-lg min-h-[50px] whitespace-pre-wrap">
              {isLoading && !translation ? (
                <div className="flex items-center justify-center py-4">
                  <div className="loading-spinner"></div>
                  <span className="ml-2 text-gray-500">正在翻译，请稍候...</span>
                </div>
              ) : (
                translation
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
} 