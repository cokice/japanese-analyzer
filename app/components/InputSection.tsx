'use client';

import { useState, useEffect, useRef } from 'react';
import { extractTextFromImage, streamExtractTextFromImage } from '../services/api';
import type { AIProvider } from '../services/api';
import { getJapaneseTtsAudioUrl, speakJapanese } from '../utils/helpers';
import { Icon } from './Icons';

interface InputSectionProps {
  onAnalyze: (text: string) => void;
  userApiKey?: string;
  userApiUrl?: string;
  aiProvider: AIProvider;
  geminiApiKey?: string;
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
  aiProvider,
  geminiApiKey,
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
        const url = await getJapaneseTtsAudioUrl(inputText, undefined, 'edge', {
          gender: selectedGender,
          rate: selectedRate,
          pitch: 0
        });
        setTtsAudioUrl(url);
      } else if (ttsProvider === 'gemini') {
        // 使用 Gemini TTS，添加风格控制
        const stylePrompt = TTS_STYLES.find(s => s.value === selectedStyle)?.prompt || '';
        const textToSpeak = stylePrompt + inputText;
        const url = await getJapaneseTtsAudioUrl(textToSpeak, geminiApiKey, 'gemini', { voice: selectedVoice, pitch: 0 });
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
    if (aiProvider === 'deepseek') {
      setUploadStatus('DeepSeek 当前不支持图片识别，请切换 Gemini 后重试。');
      setUploadStatusClass('mt-2 text-sm');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUploadStatus('请上传图片文件！');
      setUploadStatusClass('mt-2 text-sm');
      return;
    }

    setIsImageUploading(true);
    setUploadStatus('正在上传并识别图片中的文字...');
    setUploadStatusClass('mt-2 text-sm');

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
              setUploadStatus('文字提取成功！请确认后点击"解析"。');
              setUploadStatusClass('mt-2 text-sm');
            }
          },
          (error) => {
            console.error('Error during streaming image text extraction:', error);
            setUploadStatus(`提取时发生错误: ${error.message || '未知错误'}。`);
            setUploadStatusClass('mt-2 text-sm');
            setIsImageUploading(false);
          },
          imageExtractionPrompt,
          userApiKey,
          userApiUrl,
          aiProvider
        );
      } else {
        // 使用传统API进行图片文字提取
        const extractedText = await extractTextFromImage(compressedImageData, imageExtractionPrompt, userApiKey, userApiUrl, aiProvider);
        setInputText(extractedText);
        setUploadStatus('文字提取成功！请确认后点击"解析"。');
        setUploadStatusClass('mt-2 text-sm');
        setIsImageUploading(false);
      }
    } catch (error) {
      console.error('Error during image text extraction:', error);
      setUploadStatus(`提取时发生错误: ${error instanceof Error ? error.message : '未知错误'}。`);
      setUploadStatusClass('mt-2 text-sm');
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

        if (aiProvider === 'deepseek') {
          setUploadStatus('DeepSeek 当前不支持图片识别，请切换 Gemini 后重试。');
          setUploadStatusClass('mt-2 text-sm');
          break;
        }

        const file = item.getAsFile();
        if (file) {
          setUploadStatus('检测到粘贴的图片，正在识别...');
          setUploadStatusClass('mt-2 text-sm');
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
    <div className="w-full">
      <section className="nd-card">
        <textarea
          id="japaneseInput"
          className="jp w-full resize-none border-none bg-transparent outline-none"
          rows={5}
          placeholder="粘贴或输入日语句子…也可上传 / 粘贴图片识别文字。"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onPaste={handlePaste}
          style={{
            color: 'var(--ink)',
            fontSize: '20px',
            lineHeight: 1.6,
            letterSpacing: '0.3px',
            minHeight: '148px',
          }}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        ></textarea>

        <div className="mt-3.5 flex items-center">
          {/* 左侧工具按钮区域 */}
          <div className="flex items-center gap-2.5" style={{ color: 'var(--ink-3)' }}>
            {/* 上传图片按钮 */}
            <button
              id="uploadImageButton"
              className="nd-icon-btn"
              onClick={() => document.getElementById('imageUploadInput')?.click()}
              disabled={isImageUploading || aiProvider === 'deepseek'}
              title={aiProvider === 'deepseek' ? 'DeepSeek 当前不支持图片识别，请切换 Gemini' : '上传图片提取文字'}
            >
              {isImageUploading
                ? <span className="loading-spinner" style={{ width: 16, height: 16, margin: 0 }} />
                : Icon.cameraLg}
            </button>

            {/* TTS按钮组 */}
            <div className="relative" ref={dropdownRef}>
              <div className="flex">
                <button
                  id="speakButton"
                  className="nd-icon-btn"
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
                  onClick={handleSpeak}
                  disabled={!inputText.trim() || isLoading || isSpeaking}
                  title={inputText.trim() ?
                    `朗读文本 (${ttsProvider === 'edge' ? 'Edge' : 'Gemini'} TTS，预计需要 ${getEstimatedTime(inputText)})` :
                    '请先输入文本'
                  }
                >
                  {isSpeaking
                    ? <span className="loading-spinner" style={{ width: 16, height: 16, margin: 0 }} />
                    : Icon.speakerLg}
                </button>

                <button
                  className="nd-icon-btn"
                  style={{ width: 26, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                  onClick={() => setShowTtsDropdown(!showTtsDropdown)}
                  disabled={isLoading || isSpeaking}
                  title="语音设置"
                >
                  {Icon.chev}
                </button>
              </div>

              {/* TTS设置下拉菜单 */}
              {showTtsDropdown && (
                <div
                  className="absolute bottom-full left-0 z-20 mb-2 min-w-[280px] rounded-2xl p-4"
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid var(--line)',
                    boxShadow: '0 20px 50px -10px rgba(40,10,80,.25), 0 2px 8px rgba(20,10,40,.06)',
                  }}
                >
                  <div className="mb-3 text-sm font-medium" style={{ color: 'var(--ink)' }}>语音设置</div>

                  {/* TTS提供商选择 */}
                  <div className="mb-3">
                    <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>语音引擎</label>
                    <div className="flex gap-2">
                      {(['edge', 'gemini'] as const).map((provider) => (
                        <button
                          key={provider}
                          className="cursor-pointer rounded-full border-none px-3 py-2 text-sm transition-colors"
                          style={ttsProvider === provider
                            ? { background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 600 }
                            : { background: 'var(--bg)', color: 'var(--ink-3)' }}
                          onClick={() => handleTtsProviderSelect(provider)}
                        >
                          {provider === 'edge' ? 'Edge TTS' : 'Gemini TTS'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Edge TTS 设置 */}
                  {ttsProvider === 'edge' && (
                    <>
                      <div className="mb-3">
                        <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>语音性别</label>
                        <select
                          value={selectedGender}
                          onChange={(e) => handleGenderChange(e.target.value as 'male' | 'female')}
                          className="nd-input text-sm"
                        >
                          {TTS_GENDERS.map((gender) => (
                            <option key={gender.value} value={gender.value}>
                              {gender.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-2">
                        <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                          语速: {getRateLabel(selectedRate)} ({selectedRate})
                        </label>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          step="10"
                          value={selectedRate}
                          onChange={(e) => handleRateChange(parseInt(e.target.value))}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg"
                          style={{ background: 'var(--line-2)', accentColor: 'var(--primary)' }}
                        />
                        <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--ink-3)' }}>
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
                        <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>语音选择</label>
                        <select
                          value={selectedVoice}
                          onChange={(e) => handleVoiceChange(e.target.value)}
                          className="nd-input text-sm"
                        >
                          {GEMINI_VOICES.map((voice) => (
                            <option key={voice.value} value={voice.value}>
                              {voice.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-2">
                        <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>语音风格</label>
                        <select
                          value={selectedStyle}
                          onChange={(e) => handleStyleChange(e.target.value)}
                          className="nd-input text-sm"
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

          <div className="flex-1" />

          {/* 清空按钮 */}
          {inputText.trim() !== '' && (
            <button
              className="mr-3 grid cursor-pointer place-items-center border-none bg-transparent"
              style={{ color: 'var(--ink-3)' }}
              onClick={() => setInputText('')}
              title="清空内容"
            >
              {Icon.x}
            </button>
          )}

          {/* 解析按钮 */}
          <button
            id="analyzeButton"
            className="nd-primary-btn"
            onClick={handleAnalyze}
            disabled={isLoading}
          >
            {Icon.search}
            <span>{isLoading ? '解析中…' : '解析'}</span>
          </button>
        </div>

        {/* 隐藏的文件输入 */}
        <input
          type="file"
          id="imageUploadInput"
          accept="image/*"
          className="hidden"
          disabled={aiProvider === 'deepseek'}
          onChange={handleImageUpload}
        />
      </section>

      {uploadStatus && <div id="imageUploadStatus" className={uploadStatusClass}>{uploadStatus}</div>}

      {ttsAudioUrl && (
        <div className="mt-4">
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
        <div
          className="mt-4 rounded-xl p-4 text-sm"
          style={{ background: 'var(--primary-soft)', color: 'var(--ink-2)' }}
        >
          <p className="m-0 font-medium" style={{ color: 'var(--primary)' }}>正在进行高质量语音合成，请稍候...</p>
          <p className="mb-0 mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            • 使用 {ttsProvider === 'edge' ? 'Edge' : 'Gemini'} TTS 技术，音质更自然<br/>
            • 当前文本预计需要：{getEstimatedTime(inputText)}<br/>
            • 请保持页面打开，不要离开或刷新
          </p>
        </div>
      )}
    </div>
  );
}
