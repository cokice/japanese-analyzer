'use client';

import { useState, useEffect, useRef } from 'react';
import { extractTextFromImage, streamExtractTextFromImage } from '../services/api';
import { getJapaneseTtsAudioUrl, speakJapanese } from '../utils/helpers';
import { FaInfoCircle } from 'react-icons/fa';

// 添加内联样式
const placeholderStyle = `
  #japaneseInput::placeholder {
    color: rgba(0, 0, 0, 0.4) !important;
    opacity: 0.6 !important;
  }
`;

interface InputSectionProps {
  onAnalyze: (text: string) => void;
  userApiKey?: string;
  userApiUrl?: string;
  useStream?: boolean;
  ttsProvider: 'edge' | 'gemini';
  onTtsProviderChange: (provider: 'edge' | 'gemini') => void;
  isAnalyzing?: boolean;
}

// TTS配置选项
const TTS_GENDERS = [
  { value: 'female', label: '女声 (Nanami)' },
  { value: 'male', label: '男声 (Masaru)' }
];

// 语速标签函数
const getRateLabel = (value: number) => {
  if (value <= -50) return '很慢';
  if (value <= -20) return '慢';
  if (value >= 50) return '很快';
  if (value >= 20) return '快';
  return '正常';
};

const GEMINI_VOICES = [
  { value: 'Kore', label: 'Kore (坚定)', style: 'Firm' },
  { value: 'Puck', label: 'Puck (乐观)', style: 'Upbeat' },
  { value: 'Zephyr', label: 'Zephyr (明亮)', style: 'Bright' },
  { value: 'Aoede', label: 'Aoede (轻松)', style: 'Breezy' },
  { value: 'Leda', label: 'Leda (年轻)', style: 'Youthful' },
  { value: 'Charon', label: 'Charon (信息性)', style: 'Informative' }
];

const TTS_STYLES = [
  { value: '', label: '自然朗读', prompt: '' },
  { value: 'slowly', label: '慢速朗读', prompt: 'Say slowly: ' },
  { value: 'clearly', label: '清晰朗读', prompt: 'Say clearly: ' },
];

export default function InputSection({ 
  onAnalyze,
  userApiKey,
  userApiUrl,
  useStream = true, // 默认启用流式输出
  ttsProvider,
  onTtsProviderChange,
  isAnalyzing = false
}: InputSectionProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadStatusClass, setUploadStatusClass] = useState('');
  const [showTtsDropdown, setShowTtsDropdown] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('female');
  const [selectedRate, setSelectedRate] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [selectedStyle, setSelectedStyle] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 监听外部分析状态，同步内部loading状态
  useEffect(() => {
    setIsLoading(isAnalyzing);
  }, [isAnalyzing]);

  // 从本地存储加载TTS设置
  useEffect(() => {
    const storedGender = (localStorage.getItem('ttsGender') || 'female') as 'male' | 'female';
    const storedRate = parseInt(localStorage.getItem('ttsRate') || '0');
    const storedVoice = localStorage.getItem('ttsVoice') || 'Kore';
    const storedStyle = localStorage.getItem('ttsStyle') || '';
    setSelectedGender(storedGender);
    setSelectedRate(storedRate);
    setSelectedVoice(storedVoice);
    setSelectedStyle(storedStyle);
  }, []);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTtsDropdown(false);
      }
    };

    if (showTtsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTtsDropdown]);

  const handleAnalyze = () => {
    if (!inputText.trim()) {
      alert('请输入日语句子！');
      return;
    }

    onAnalyze(inputText);
  };

  const handleSpeak = async () => {
    if (!inputText.trim()) return;
    setIsSpeaking(true);
    
    try {
      if (ttsProvider === 'edge') {
        // 使用 Edge TTS
                const url = await getJapaneseTtsAudioUrl(inputText, userApiKey, 'edge', { 
          gender: selectedGender,
          rate: selectedRate,
          pitch: 0
        });
        setTtsAudioUrl(url);
      } else if (ttsProvider === 'gemini') {
        // 使用 Gemini TTS，添加风格控制
        const stylePrompt = TTS_STYLES.find(s => s.value === selectedStyle)?.prompt || '';
        const textToSpeak = stylePrompt + inputText;
        const url = await getJapaneseTtsAudioUrl(textToSpeak, userApiKey, 'gemini', { voice: selectedVoice, pitch: 0 });
        setTtsAudioUrl(url);
      }
    } catch (e) {
      console.error('TTS error:', e);
      setTtsAudioUrl(null);
      // 如果失败，回退到系统 TTS
      speakJapanese(inputText);
    } finally {
      setIsSpeaking(false);
    }
  };

  const handleTtsProviderSelect = (provider: 'edge' | 'gemini') => {
    onTtsProviderChange(provider);
    setShowTtsDropdown(false);
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    localStorage.setItem('ttsVoice', voice);
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    setSelectedGender(gender);
    localStorage.setItem('ttsGender', gender);
  };

  const handleRateChange = (rate: number) => {
    setSelectedRate(rate);
    localStorage.setItem('ttsRate', rate.toString());
  };

  const handleStyleChange = (style: string) => {
    setSelectedStyle(style);
    localStorage.setItem('ttsStyle', style);
  };

  // 根据文本长度估算合成时间
  const getEstimatedTime = (text: string): string => {
    const length = text.length;
    if (length <= 20) return '5-10秒';
    if (length <= 50) return '10-20秒';
    if (length <= 100) return '20-30秒';
    return '30-60秒';
  };

  // 处理图片识别的通用函数
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadStatus('请上传图片文件！');
      setUploadStatusClass('mt-2 text-sm text-red-600');
      return;
    }

    setIsImageUploading(true);
    setUploadStatus('正在上传并识别图片中的文字...');
    setUploadStatusClass('mt-2 text-sm text-gray-600');

    try {
      // 压缩图片以减小数据大小
      const compressedImageData = await compressImage(file);
      
      // 优化提示词，明确不要换行符
      const imageExtractionPrompt = "请提取并返回这张图片中的所有日文文字。提取的文本应保持原始格式，但不要输出换行符，用空格替代。不要添加任何解释或说明。";
      
      if (useStream) {
        // 使用流式API进行图片文字提取
        streamExtractTextFromImage(
          compressedImageData,
          (chunk, isDone) => {
            setInputText(chunk);
            
            if (isDone) {
              setIsImageUploading(false);
              setUploadStatus('文字提取成功！请确认后点击"解析句子"。');
              setUploadStatusClass('mt-2 text-sm text-green-600');
            }
          },
          (error) => {
            console.error('Error during streaming image text extraction:', error);
            setUploadStatus(`提取时发生错误: ${error.message || '未知错误'}。`);
            setUploadStatusClass('mt-2 text-sm text-red-600');
            setIsImageUploading(false);
          },
          imageExtractionPrompt,
          userApiKey,
          userApiUrl
        );
      } else {
        // 使用传统API进行图片文字提取
        const extractedText = await extractTextFromImage(compressedImageData, imageExtractionPrompt, userApiKey, userApiUrl);
        setInputText(extractedText); 
        setUploadStatus('文字提取成功！请确认后点击"解析句子"。');
        setUploadStatusClass('mt-2 text-sm text-green-600');
        setIsImageUploading(false);
      }
    } catch (error) {
      console.error('Error during image text extraction:', error);
      setUploadStatus(`提取时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`);
      setUploadStatusClass('mt-2 text-sm text-red-600');
      setIsImageUploading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    await processImageFile(file);
    
    // 清理file input
    event.target.value = '';
  };

  // 处理粘贴事件
  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    // 检查粘贴的内容中是否有图片
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        // 阻止默认粘贴行为
        event.preventDefault();
        
        const file = item.getAsFile();
        if (file) {
          setUploadStatus('检测到粘贴的图片，正在识别...');
          setUploadStatusClass('mt-2 text-sm text-blue-600');
          await processImageFile(file);
        }
        break;
      }
    }
  };

  // 图片压缩函数
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 创建canvas进行图片压缩
          const canvas = document.createElement('canvas');
          // 确定压缩后尺寸（保持宽高比）
          let width = img.width;
          let height = img.height;
          
          // 如果图片尺寸大于1600px，按比例缩小
          const maxDimension = 1600;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // 在canvas上绘制压缩后的图片
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建canvas上下文'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          
          // 转换为dataURL，使用较低的质量
          const quality = 0.7; // 70%的质量，可以根据需要调整
          const dataUrl = canvas.toDataURL(file.type, quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('无法读取文件'));
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: placeholderStyle }} />
      
      <div className="relative bg-white dark:bg-gray-800 border-2 border-purple-200 dark:border-purple-600 rounded-3xl shadow-lg focus-within:border-purple-400 focus-within:shadow-xl transition-all duration-200">
        <textarea 
          id="japaneseInput" 
          className="w-full p-6 pr-40 pb-20 resize-none japanese-text bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 border-none outline-none text-lg leading-relaxed scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent dark:scrollbar-thumb-gray-600" 
          rows={3} 
          placeholder="输入日语句子，例：天気がいいから、散歩しましょう。或上传图片识别文字，也可直接粘贴图片。"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onPaste={handlePaste}
          style={{ 
            fontSize: '16px',
            fontFamily: "'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif",
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent'
          }}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        ></textarea>
        
        {/* 底部渐变遮罩，防止文字进入按钮区域 */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-gray-800 via-white/80 dark:via-gray-800/80 to-transparent pointer-events-none rounded-b-3xl"></div>
        
        {/* 左侧工具按钮区域 */}
        <div className="absolute left-4 bottom-4 flex items-center gap-1 z-[1]">
          {/* 上传图片按钮 */}
          <button
            id="uploadImageButton"
            className="material-icon-button material-ripple w-10 h-10 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all duration-200"
            onClick={() => document.getElementById('imageUploadInput')?.click()}
            disabled={isImageUploading}
            title="上传图片提取文字"
          >
            <i className="fas fa-camera text-lg"></i>
            {isImageUploading && <div className="loading-spinner ml-1" style={{ width: '12px', height: '12px' }}></div>}
          </button>

          {/* TTS按钮组 */}
          <div className="relative flex" ref={dropdownRef}>
            <button
              id="speakButton"
              className="material-icon-button material-ripple w-10 h-10 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-l-full transition-all duration-200"
              onClick={handleSpeak}
              disabled={!inputText.trim() || isLoading || isSpeaking}
              title={inputText.trim() ? 
                (ttsProvider === 'edge' ? 
                  `朗读文本 (Edge TTS，预计需要 ${getEstimatedTime(inputText)})` : 
                  `朗读文本 (Gemini TTS，预计需要 ${getEstimatedTime(inputText)})`
                ) : 
                '请先输入文本'
              }
            >
              <i className="fas fa-volume-up text-lg"></i>
              {isSpeaking && <div className="loading-spinner ml-1" style={{ width: '12px', height: '12px' }}></div>}
            </button>
            
            <button
              className="material-icon-button material-ripple w-6 h-10 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-r-full border-l border-gray-300 dark:border-gray-600 transition-all duration-200"
              onClick={() => setShowTtsDropdown(!showTtsDropdown)}
              disabled={isLoading || isSpeaking}
              title="语音设置"
            >
              <i className="fas fa-chevron-down text-sm"></i>
            </button>
            
            {/* TTS设置下拉菜单 */}
            {showTtsDropdown && (
              <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-xl z-20 p-4 min-w-[280px]">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">语音设置</div>
                
                {/* TTS提供商选择 */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">语音引擎</label>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-2 text-sm rounded-full transition-colors ${ttsProvider === 'edge' ? 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                      onClick={() => handleTtsProviderSelect('edge')}
                    >
                      Edge TTS
                    </button>
                    <button
                      className={`px-3 py-2 text-sm rounded-full transition-colors ${ttsProvider === 'gemini' ? 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                      onClick={() => handleTtsProviderSelect('gemini')}
                    >
                      Gemini TTS
                    </button>
                  </div>
                </div>

                {/* Edge TTS 设置 */}
                {ttsProvider === 'edge' && (
                  <>
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">语音性别</label>
                      <select
                        value={selectedGender}
                        onChange={(e) => handleGenderChange(e.target.value as 'male' | 'female')}
                        className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        {TTS_GENDERS.map((gender) => (
                          <option key={gender.value} value={gender.value}>
                            {gender.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        语速: {getRateLabel(selectedRate)} ({selectedRate})
                      </label>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="10"
                        value={selectedRate}
                        onChange={(e) => handleRateChange(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>-100</span>
                        <span>0</span>
                        <span>100</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Gemini TTS 设置 */}
                {ttsProvider === 'gemini' && (
                  <>
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">语音选择</label>
                      <select
                        value={selectedVoice}
                        onChange={(e) => handleVoiceChange(e.target.value)}
                        className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        {GEMINI_VOICES.map((voice) => (
                          <option key={voice.value} value={voice.value}>
                            {voice.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="mb-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">语音风格</label>
                      <select
                        value={selectedStyle}
                        onChange={(e) => handleStyleChange(e.target.value)}
                        className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      >
                        {TTS_STYLES.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* 右侧按钮组 */}
        <div className="absolute right-4 bottom-4 flex items-center gap-2 z-[1]">
          {/* 清空按钮 */}
          {inputText.trim() !== '' && (
            <button 
              className="material-icon-button material-ripple w-10 h-10 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all duration-200"
              onClick={() => setInputText('')}
              title="清空内容"
            >
              <i className="fas fa-times text-lg"></i>
            </button>
          )}

          {/* 解析按钮 */}
          <button
            id="analyzeButton"
            className="material-filled-button material-button-base material-ripple px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
            onClick={handleAnalyze}
            disabled={isLoading}
          >
            <i className="fas fa-search text-sm mr-2"></i>
            {isLoading ? '解析中...' : '解析'}
            {isLoading && <div className="loading-spinner ml-2" style={{ width: '16px', height: '16px' }}></div>}
          </button>
        </div>
        
        {/* 隐藏的文件输入 */}
        <input 
          type="file" 
          id="imageUploadInput" 
          accept="image/*" 
          className="hidden" 
          onChange={handleImageUpload}
        />
      </div>
      
      <div id="imageUploadStatus" className={uploadStatusClass}>{uploadStatus}</div>
      
      {ttsAudioUrl && (
        <div className="mt-6 mb-8">
          <audio 
            key={ttsAudioUrl} 
            src={ttsAudioUrl} 
            controls 
            autoPlay 
            className="w-full rounded-lg"
            style={{ height: '40px' }}
          />
        </div>
      )}

      {isSpeaking && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-xl">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <FaInfoCircle className="text-blue-500 mt-0.5" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>正在进行高质量语音合成，请稍候...</strong>
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                • 使用 {ttsProvider === 'edge' ? 'Edge' : 'Gemini'} TTS 技术，音质更自然<br/>
                • 当前文本预计需要：{getEstimatedTime(inputText)}<br/>
                • 请保持页面打开，不要离开或刷新
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 