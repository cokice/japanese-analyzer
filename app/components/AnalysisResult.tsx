'use client';

import { useState, useEffect, useCallback } from 'react';
import { containsKanji, getPosClass, posChineseMap, speakJapanese, generateFuriganaParts } from '../utils/helpers';
import { getWordDetails, TokenData, WordDetail } from '../services/api';
import { FaVolumeUp } from 'react-icons/fa';

interface AnalysisResultProps {
  tokens: TokenData[];
  originalSentence: string;
  userApiKey?: string;
  userApiUrl?: string;
  showFurigana: boolean;
  onShowFuriganaChange: (show: boolean) => void;
}

export default function AnalysisResult({ 
  tokens, 
  originalSentence,
  userApiKey,
  userApiUrl,
  showFurigana,
  onShowFuriganaChange
}: AnalysisResultProps) {
  const [wordDetail, setWordDetail] = useState<WordDetail | null>(null);
  const [activeWordToken, setActiveWordToken] = useState<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 检测设备是���为移动端
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // 初始检测
    checkIsMobile();
    
    // 窗口大小变化时重新检测
    window.addEventListener('resize', checkIsMobile);
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  const handleWordClick = async (e: React.MouseEvent<HTMLSpanElement>, token: TokenData) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    
    // 如果点击的是当前活动词，切换关闭
    if (activeWordToken === target) {
      setActiveWordToken(null);
      setWordDetail(null);
      if (isMobile) {
        setIsModalOpen(false);
      }
      return;
    }

    // 设置新活动词
    if (activeWordToken) {
      activeWordToken.classList.remove('active-word');
    }
    target.classList.add('active-word');
    setActiveWordToken(target);
    
    // 如果是移动端，先打开模态窗口，显示加载动画
    if (isMobile) {
      setIsLoading(true);
      setIsModalOpen(true);
      // 然后获取词汇详情
      await fetchWordDetails(token.word, token.pos, originalSentence, token.furigana, token.romaji);
    } else {
      // PC端保持原来的逻辑
      await fetchWordDetails(token.word, token.pos, originalSentence, token.furigana, token.romaji);
    }
  };

  const fetchWordDetails = async (word: string, pos: string, sentence: string, furigana?: string, romaji?: string) => {
    setIsLoading(true);

          try {
        // 使用服务端API获取词汇详情，传递用户API设置
        const details = await getWordDetails(word, pos, sentence, furigana, romaji, userApiKey, userApiUrl);
        setWordDetail(details);
    } catch (error) {
      console.error('Error fetching word details:', error);
      setWordDetail({ 
        originalWord: word, 
        pos: pos, 
        furigana: (furigana && furigana !== word && containsKanji(word)) ? furigana : '', 
        romaji: romaji || '', 
        dictionaryForm: '', 
        chineseTranslation: '错误', 
        explanation: `查询释义时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseWordDetail = useCallback(() => {
    if (activeWordToken) {
      activeWordToken.classList.remove('active-word');
      setActiveWordToken(null);
    }
    setWordDetail(null);
    setIsModalOpen(false);
  }, [activeWordToken]);

  // 点击外部关闭详情
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        activeWordToken && 
        wordDetail && 
        !(activeWordToken.contains(event.target as Node)) && 
        !(document.getElementById('wordDetailInlineContainer')?.contains(event.target as Node)) &&
        !(document.getElementById('wordDetailModal')?.contains(event.target as Node)) &&
        !(event.target as Element)?.closest('.word-unit-wrapper')
      ) {
        handleCloseWordDetail();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeWordToken, wordDetail, handleCloseWordDetail]);

  // 朗读单词的函数
  const handleWordSpeak = async (word: string) => {
    try {
      // 词汇详解中统一使用系统TTS，速度更快
      speakJapanese(word);
    } catch (error) {
      console.error('朗读失败:', error);
    }
  };

  // 格式化解释文本，支持换行和高亮
  const formatExplanation = (text: string): { __html: string } | undefined => {
    if (!text) return undefined;
    
    const formattedText = text
      .replace(/\n/g, '<br />')
      .replace(/【([^】]+)】/g, '<strong class="text-indigo-600">$1</strong>')
      .replace(/「([^」]+)」/g, '<strong class="text-indigo-600">$1</strong>');

    return { __html: formattedText };
  };

  // 词语详情内容组件
  const WordDetailContent = () => (
    <>
      <h3 className="text-xl font-semibold text-[#007AFF] mb-3">词汇详解</h3>
      <p className="mb-1">
        <strong>原文:</strong> 
        <span className="font-mono text-lg text-gray-800">{wordDetail?.originalWord}</span> 
        <button 
          className="read-aloud-button" 
          title="朗读此词汇"
          onClick={() => handleWordSpeak(wordDetail?.originalWord || '')}
        >
          <FaVolumeUp />
        </button>
      </p>
      
      {wordDetail?.furigana && (
        <p className="mb-1">
          <strong>读音 (Furigana):</strong> 
          <span className="text-sm text-purple-700">{wordDetail.furigana}</span>
        </p>
      )}
      
      {wordDetail?.romaji && (
        <p className="mb-1">
          <strong>罗马音 (Romaji):</strong> 
          <span className="text-sm text-cyan-700">{wordDetail.romaji}</span>
        </p>
      )}
      
      {wordDetail?.dictionaryForm && wordDetail.dictionaryForm !== wordDetail.originalWord && (
        <p className="mb-2">
          <strong>辞书形:</strong> 
          <span className="text-md text-blue-700 font-medium">{wordDetail.dictionaryForm}</span>
        </p>
      )}
      
      <p className="mb-2">
        <strong>词性:</strong> 
        <span className={`detail-pos-tag ${getPosClass(wordDetail?.pos || '')}`}>
          {wordDetail?.pos} ({posChineseMap[wordDetail?.pos.split('-')[0] || ''] || posChineseMap['default']})
        </span>
      </p>
      
      <p className="mb-2">
        <strong>中文译文:</strong> 
        <span className="text-lg text-green-700 font-medium">{wordDetail?.chineseTranslation}</span>
      </p>
      
      <div className="mb-1"><strong>解释:</strong></div>
      <div 
        className="text-gray-700 bg-gray-50 p-3 rounded-md text-base leading-relaxed"
        dangerouslySetInnerHTML={formatExplanation(wordDetail?.explanation || '')}
      />
    </>
  );

  if (!tokens || tokens.length === 0) {
    return null;
  }

  return (
    <div className="premium-card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-700">解析结果</h2>
        <div className="flex items-center">
          <label htmlFor="furiganaToggle" className="text-sm font-medium text-gray-700 mr-2">显示假名:</label>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="furiganaToggle"
              className="sr-only peer"
              checked={showFurigana}
              onChange={(e) => onShowFuriganaChange(e.target.checked)}
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>
      <div id="analyzedSentenceOutput" className="text-gray-800 mb-2 p-3 bg-gray-50 rounded-lg min-h-[70px]">
        {tokens.map((token, index) => {
          if (token.pos === '改行') {
            return <br key={index} />;
          }
          
          return (
            <span key={index} className="word-unit-wrapper tooltip">
              <span 
                className={`word-token ${getPosClass(token.pos)}`}
                onClick={(e) => handleWordClick(e, token)}
              >
                {showFurigana && token.furigana && token.furigana !== token.word && containsKanji(token.word) && token.pos !== '記号'
                  ? generateFuriganaParts(token.word, token.furigana).map((part, i) =>
                      part.ruby ? (
                        <ruby key={i}>
                          {part.base}
                          <rt>{part.ruby}</rt>
                        </ruby>
                      ) : (
                        <span key={i}>{part.base}</span>
                      )
                    )
                  : token.word}
              </span>
              
              {token.romaji && token.pos !== '記号' && (
                <span className="romaji-text">{token.romaji}</span>
              )}
              
              <span className="tooltiptext">
                {posChineseMap[token.pos.split('-')[0]] || posChineseMap['default']}
              </span>
            </span>
          );
        })}
      </div>
      
      {/* 非移动端的内嵌详情展示 */}
      {!isMobile && (isLoading || wordDetail) && (
        <div id="wordDetailInlineContainer" style={{ display: 'block' }}>
          <button 
            className="detail-close-button" 
            title="关闭详情"
            onClick={handleCloseWordDetail}
          >
            &times;
          </button>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-5">
              <div className="loading-spinner"></div>
              <span className="ml-2 text-gray-600">正在查询释义...</span>
            </div>
          ) : (
            <WordDetailContent />
          )}
        </div>
      )}
      
      {/* 移动端的模态窗口详情展示 */}
      {isMobile && isModalOpen && (
        <div id="wordDetailModal" className="word-detail-modal" onClick={(e) => {
          if (e.target === e.currentTarget) handleCloseWordDetail();
        }}>
          <div className="word-detail-modal-content">
            <button 
              className="modal-close-button" 
              title="关闭详情"
              onClick={handleCloseWordDetail}
            >
              &times;
            </button>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-5">
                <div className="loading-spinner"></div>
                <span className="ml-2 text-gray-600">正在查询释义...</span>
              </div>
            ) : (
              <WordDetailContent />
            )}
          </div>
        </div>
      )}
      
      <p className="text-sm text-gray-500 italic mt-3">点击词汇查看详细释义。悬停词汇可查看词性。</p>
    </div>
  );
}