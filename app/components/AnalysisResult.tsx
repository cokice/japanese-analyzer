'use client';

import { useState, useEffect, useCallback } from 'react';
import { containsKanji, getPosClass, posChineseMap, speakJapanese, generateFuriganaParts } from '../utils/helpers';
import { getWordDetails, TokenData, WordDetail } from '../services/api';
import { FaVolumeUp, FaCopy, FaCheck } from 'react-icons/fa';

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
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 768);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const handleWordClick = async (e: React.MouseEvent<HTMLSpanElement>, token: TokenData) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    
    if (activeWordToken === target) {
      setActiveWordToken(null);
      setWordDetail(null);
      if (isMobile) setIsModalOpen(false);
      return;
    }

    if (activeWordToken) activeWordToken.classList.remove('active-word');
    target.classList.add('active-word');
    setActiveWordToken(target);
    
    setIsLoading(true);
    if (isMobile) setIsModalOpen(true);
    
    try {
      const details = await getWordDetails(token.word, token.pos, originalSentence, token.furigana, token.romaji, userApiKey, userApiUrl);
      setWordDetail(details);
    } catch (error) {
      console.error('Error fetching word details:', error);
      setWordDetail({ 
        originalWord: token.word, 
        pos: token.pos, 
        furigana: (token.furigana && token.furigana !== token.word && containsKanji(token.word)) ? token.furigana : '', 
        romaji: token.romaji || '', 
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const wordDetailElement = document.getElementById('wordDetailInlineContainer') || document.getElementById('wordDetailModal');
      if (activeWordToken && !activeWordToken.contains(event.target as Node) && wordDetailElement && !wordDetailElement.contains(event.target as Node)) {
        handleCloseWordDetail();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeWordToken, handleCloseWordDetail]);

  const handleWordSpeak = (word: string) => {
    try {
      speakJapanese(word);
    } catch (error) {
      console.error('朗读失败:', error);
    }
  };

  const formatExplanation = (text: string | undefined): { __html: string } => {
    if (!text) return { __html: '' };
    const formattedText = text
      .replace(/\n/g, '<br />')
      .replace(/【([^】]+)】/g, '<strong class="text-indigo-600">$1</strong>')
      .replace(/「([^」]+)」/g, '<strong class="text-indigo-600">$1</strong>');
    return { __html: formattedText };
  };

  const handleCopy = () => {
    const plainText = tokens.map(token => token.pos === '改行' ? '\n' : token.word).join('');
    let contentToCopy: string;
    let isHtml = false;

    if (showFurigana) {
      isHtml = true;
      contentToCopy = tokens.map(token => {
        if (token.pos === '改行') return '<br>';
        const shouldUseFurigana = token.furigana && token.furigana !== token.word && containsKanji(token.word) && token.pos !== '記号';
        if (shouldUseFurigana && token.furigana) {
          return generateFuriganaParts(token.word, token.furigana)
            .map(part => part.ruby ? `<ruby>${part.base}<rt>${part.ruby}</rt></ruby>` : part.base)
            .join('');
        }
        return token.word;
      }).join('');
    } else {
      contentToCopy = plainText;
    }

    try {
      if (isHtml) {
        const blobHtml = new Blob([contentToCopy], { type: 'text/html' });
        const blobText = new Blob([plainText], { type: 'text/plain' });
        navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
      } else {
        navigator.clipboard.writeText(contentToCopy);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard API 失败，回退到旧方法。', e);
      const textarea = document.createElement('textarea');
      textarea.value = contentToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error('后备复制方案失败:', err);
        alert('复制功能在此浏览器中不受支持。');
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const WordDetailContent = () => wordDetail && (
    <>
      <h3 className="text-xl font-semibold text-[#007AFF] mb-3">词汇详解</h3>
      <p className="mb-1">
        <strong>原文:</strong> 
        <span className="font-mono text-lg text-gray-800">{wordDetail.originalWord}</span> 
        <button className="read-aloud-button" title="朗读此词汇" onClick={() => handleWordSpeak(wordDetail.originalWord)}>
          <FaVolumeUp />
        </button>
      </p>
      {wordDetail.furigana && <p className="mb-1"><strong>读音:</strong> <span className="text-sm text-purple-700">{wordDetail.furigana}</span></p>}
      {wordDetail.romaji && <p className="mb-1"><strong>罗马音:</strong> <span className="text-sm text-cyan-700">{wordDetail.romaji}</span></p>}
      {wordDetail.dictionaryForm && wordDetail.dictionaryForm !== wordDetail.originalWord && <p className="mb-2"><strong>辞书形:</strong> <span className="text-md text-blue-700 font-medium">{wordDetail.dictionaryForm}</span></p>}
      <p className="mb-2"><strong>词性:</strong> <span className={`detail-pos-tag ${getPosClass(wordDetail.pos)}`}>{wordDetail.pos} ({posChineseMap[wordDetail.pos.split('-')[0]] || posChineseMap['default']})</span></p>
      <p className="mb-2"><strong>中文译文:</strong> <span className="text-lg text-green-700 font-medium">{wordDetail.chineseTranslation}</span></p>
      <div className="mb-1"><strong>解释:</strong></div>
      <div className="text-gray-700 bg-gray-50 p-3 rounded-md text-base leading-relaxed" dangerouslySetInnerHTML={formatExplanation(wordDetail.explanation)} />
    </>
  );

  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="premium-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold text-gray-700">解析结果</h2>
          <button onClick={handleCopy} className={`p-2 rounded-full transition-all duration-200 ${isCopied ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`} title={isCopied ? "已复制!" : (showFurigana ? "以带注音的HTML格式复制" : "以纯文本格式复制")}>
            {isCopied ? <FaCheck /> : <FaCopy />}
          </button>
        </div>
        <div className="flex items-center">
          <label htmlFor="furiganaToggle" className="text-sm font-medium text-gray-700 mr-2">显示假名:</label>
          <label className="inline-flex items-center cursor-pointer">
            <input type="checkbox" id="furiganaToggle" className="sr-only peer" checked={showFurigana} onChange={(e) => onShowFuriganaChange(e.target.checked)} />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>
      <div id="analyzedSentenceOutput" className="text-gray-800 mb-2 p-3 bg-gray-50 rounded-lg min-h-[70px]">
        {tokens.map((token, index) => 
          token.pos === '改行' ? <br key={index} /> : (
            <span key={index} className="word-unit-wrapper tooltip">
              <span className={`word-token ${getPosClass(token.pos)}`} onClick={(e) => handleWordClick(e, token)}>
                {showFurigana && token.furigana && token.furigana !== token.word && containsKanji(token.word) && token.pos !== '記号'
                  ? generateFuriganaParts(token.word, token.furigana).map((part, i) =>
                      part.ruby ? <ruby key={i}>{part.base}<rt>{part.ruby}</rt></ruby> : <span key={i}>{part.base}</span>
                    )
                  : token.word}
              </span>
              {token.romaji && token.pos !== '記号' && <span className="romaji-text">{token.romaji}</span>}
              <span className="tooltiptext">{posChineseMap[token.pos.split('-')[0]] || posChineseMap['default']}</span>
            </span>
          )
        )}
      </div>
      
      {!isMobile && (isLoading || wordDetail) && (
        <div id="wordDetailInlineContainer" className="relative mt-4 p-4 border rounded-lg bg-white shadow-md">
          <button className="detail-close-button" title="关闭详情" onClick={handleCloseWordDetail}>&times;</button>
          {isLoading ? <div className="flex items-center justify-center py-5"><div className="loading-spinner"></div><span className="ml-2 text-gray-600">正在查询释义...</span></div> : <WordDetailContent />}
        </div>
      )}
      
      {isMobile && isModalOpen && (
        <div id="wordDetailModal" className="word-detail-modal" onClick={(e) => { if (e.target === e.currentTarget) handleCloseWordDetail(); }}>
          <div className="word-detail-modal-content">
            <button className="modal-close-button" title="关闭详情" onClick={handleCloseWordDetail}>&times;</button>
            {isLoading ? <div className="flex items-center justify-center py-5"><div className="loading-spinner"></div><span className="ml-2 text-gray-600">正在查询释义...</span></div> : <WordDetailContent />}
          </div>
        </div>
      )}
      
      <p className="text-sm text-gray-500 italic mt-3">点击词汇查看详细释义。悬停词汇可查看词性。</p>
    </div>
  );
}