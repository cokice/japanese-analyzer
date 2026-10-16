'use client';

import { LatestRequest } from '../utils/latestRequest';
import { browserStorage } from '../utils/storage';

import { getImageExtractionPrompt } from '../lib/languagePrompts';
import { useLanguage } from '../contexts/LanguageContext';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { extractTextFromImage, streamExtractTextFromImage } from '../services/api';
import type { EndpointPayload, ProviderProfile, TTSProvider } from '../services/api';
import { getJapaneseTtsAudioUrl, speakJapanese } from '../utils/helpers';
import {
  getImageRecognitionUsage,
  getTtsUsage,
  trackImageRecognitionUsage,
  trackTtsUsage,
  type AnalyzeUsageMetadata
} from '../utils/analytics';
import { Icon } from './Icons';
import ModelSwitcher from './ModelSwitcher';
import AnchoredPopover from './AnchoredPopover';
import { ProviderLogo } from './ProviderLogo';
import type { SpeechService } from '../lib/speechServices';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { StateMorphButton, StateMorphButtonState } from '@/components/ui/state-morph-button';
import { normalizePastedText } from '../utils/pastedText';
import AnalysisHistory from './AnalysisHistory';
import DailySentence from './DailySentence';
import type { useAnalysisHistory } from '../hooks/useAnalysisHistory';

interface InputSectionProps {
  draft: string;
  onDraftChange: (text: string) => void;
  history: ReturnType<typeof useAnalysisHistory>;
  onAnalyze: (text: string, usage?: AnalyzeUsageMetadata) => void;
  onCancelAnalyze: () => void;
  userApiKey?: string;
  activeService: ProviderProfile | null;
  /** 模型选择：输入区下方级联切换已配置的服务商/模型 */
  services?: ProviderProfile[];
  activeServiceId?: string;
  activeModelId?: string;
  onSelectModel?: (serviceId: string, modelId: string) => void;
  endpoint: EndpointPayload;
  speechService: SpeechService;
  speechServices: SpeechService[];
  useStream?: boolean;
  onSpeechServiceChange: (id: string, voice?: string) => void;
  isAnalyzing?: boolean;
  analysisError?: string;
  /** 阅读态：输入卡片收成一行文字按钮，把版面让给解析结果 */
  compact?: boolean;
  onExpand?: () => void;
  /** 有解析结果时，按 Esc 可回到阅读态 */
  onCollapse?: () => void;
  /** 阅读态胶囊右侧的附加控件（假名/罗马音开关） */
  compactExtras?: React.ReactNode;
  /** 「新句子」：清空当前解析回到首页；未提供时只展开输入框 */
  onNewSentence?: () => void;
  /** 首页：输入框上方显示「今日一句」，下方显示最近记录 */
  showSuggestions?: boolean;
}

// TTS配置选项
const TTS_GENDERS = [
  { value: 'female', label: '女声 (Nanami)' },
  { value: 'male', label: '男声 (Keita)' }
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

const FIRST_VISIT_EXAMPLE_KEY = 'japaneseAnalyzer:firstVisitExampleSeen';
const FIRST_VISIT_EXAMPLE = '天気がいいから、散歩しましょう';
// 首次访问预填示例 + 提示气泡 + 按钮呼吸光：已由输入框下方的「试试」示例句取代。
// 实现保留，改回 true 即可恢复。
const FIRST_VISIT_EXAMPLE_ENABLED = false;


export default function InputSection({
  draft: inputText,
  onDraftChange: setInputText,
  history,
  onAnalyze,
  onCancelAnalyze,
  userApiKey,
  activeService,
  services = [],
  activeServiceId = '',
  activeModelId = '',
  onSelectModel,
  endpoint,
  speechService,
  speechServices,
  useStream = true, // 默认启用流式输出
  onSpeechServiceChange,
  isAnalyzing = false,
  analysisError = '',
  compact = false,
  onExpand,
  onCollapse,
  compactExtras,
  onNewSentence,
  showSuggestions = false,
}: InputSectionProps) {
  const { t, locale, errorText } = useLanguage();
  const ttsProvider = speechService.provider;
  const isLoading = isAnalyzing;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState('');
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadStatusClass, setUploadStatusClass] = useState('');
  const [showTtsDropdown, setShowTtsDropdown] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>('female');
  const [selectedRate, setSelectedRate] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [submitState, setSubmitState] = useState<StateMorphButtonState>('idle');
  const [showFirstVisitExample, setShowFirstVisitExample] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const japaneseInputRef = useRef<HTMLTextAreaElement>(null);
  const inputShimmerFrameRef = useRef<HTMLDivElement>(null);
  const submitStartedRef = useRef(false);
  const wasAnalyzingRef = useRef(false);
  const submitResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageMetadataRef = useRef<AnalyzeUsageMetadata>({});
  const spokenTextRef = useRef('');
  const wasCompactRef = useRef(compact);
  const reduceMotion = useReducedMotion();
  const imageRequest = useRef(new LatestRequest());
  const speechRequest = useRef(new LatestRequest());

  useEffect(() => () => {
    imageRequest.current.cancel();
    speechRequest.current.cancel();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => () => {
    if (ttsAudioUrl) URL.revokeObjectURL(ttsAudioUrl);
  }, [ttsAudioUrl]);

  useEffect(() => {
    imageRequest.current.cancel();
    speechRequest.current.cancel();
    setIsImageUploading(false);
    setIsSpeaking(false);
    setUploadStatus('');
    setTtsAudioUrl(null);
    window.speechSynthesis?.cancel();
    setTtsError('');
  }, [endpoint, locale, speechService]);

  useEffect(() => { setSelectedVoice(speechService.voice); }, [speechService]);

  const cancelInputRequests = () => {
    imageRequest.current.cancel();
    speechRequest.current.cancel();
    setIsImageUploading(false);
    setIsSpeaking(false);
    setUploadStatus('');
    setTtsAudioUrl(null);
    window.speechSynthesis?.cancel();
  };

  // 从阅读态展开时把光标放回输入框末尾
  useEffect(() => {
    const expanded = wasCompactRef.current && !compact;
    wasCompactRef.current = compact;
    if (!expanded) return;
    const input = japaneseInputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [compact]);

  // Only show progress while the parent actually has a running request.
  useEffect(() => {
    if (isAnalyzing) {
      wasAnalyzingRef.current = true;
      if (submitStartedRef.current) {
        if (submitResetTimerRef.current) {
          clearTimeout(submitResetTimerRef.current);
          submitResetTimerRef.current = null;
        }
        setSubmitState('loading');
      }
      return;
    }

    if (wasAnalyzingRef.current && submitStartedRef.current) {
      wasAnalyzingRef.current = false;
      setSubmitState(analysisError ? 'idle' : 'success');
      submitResetTimerRef.current = setTimeout(() => {
        setSubmitState('idle');
        submitStartedRef.current = false;
        submitResetTimerRef.current = null;
      }, 1500);
    }
  }, [isAnalyzing, analysisError]);

  useEffect(() => {
    return () => {
      if (submitResetTimerRef.current) {
        clearTimeout(submitResetTimerRef.current);
      }
    };
  }, []);

  // 仅在当前浏览器第一次进入网站时展示示例引导。
  useEffect(() => {
    if (!FIRST_VISIT_EXAMPLE_ENABLED) return;
    try {
      if (browserStorage.getItem(FIRST_VISIT_EXAMPLE_KEY) !== 'true') {
        setInputText(FIRST_VISIT_EXAMPLE);
        setShowFirstVisitExample(true);
        browserStorage.setItem(FIRST_VISIT_EXAMPLE_KEY, 'true');
      }
    } catch {
      // localStorage 不可用时仍展示一次当前会话内的引导。
      setInputText(FIRST_VISIT_EXAMPLE);
      setShowFirstVisitExample(true);
    }
  }, [setInputText]);

  // 从本地存储加载TTS设置
  useEffect(() => {
    const storedGender = (browserStorage.getItem('ttsGender') || 'female') as 'male' | 'female';
    const storedRate = parseInt(browserStorage.getItem('ttsRate') || '0');
    const storedVoice = browserStorage.getItem('ttsVoice') || 'Kore';
    const storedStyle = browserStorage.getItem('ttsStyle') || '';
    setSelectedGender(storedGender);
    setSelectedRate(storedRate);
    setSelectedVoice(storedVoice);
    setSelectedStyle(storedStyle);
  }, []);

  const clearUsageMetadata = () => {
    usageMetadataRef.current = {};
    spokenTextRef.current = '';
  };

  const getCurrentUsageMetadata = (): AnalyzeUsageMetadata => {
    const usage = usageMetadataRef.current;

    return {
      ...(usage.imageRecognition ? { imageRecognition: { ...usage.imageRecognition } } : {}),
      ...(usage.tts && spokenTextRef.current === inputText ? { tts: { ...usage.tts } } : {}),
    };
  };

  const handleInputTextChange = (value: string) => {
    cancelInputRequests();
    setInputText(value);
    setShowFirstVisitExample(false);

    if (!value.trim()) {
      clearUsageMetadata();
      return;
    }

    if (spokenTextRef.current && spokenTextRef.current !== value) {
      usageMetadataRef.current = usageMetadataRef.current.imageRecognition
        ? { imageRecognition: usageMetadataRef.current.imageRecognition }
        : {};
      spokenTextRef.current = '';
    }
  };

  const markImageRecognitionUsed = () => {
    usageMetadataRef.current = {
      ...usageMetadataRef.current,
      imageRecognition: getImageRecognitionUsage(activeService?.id ?? '', endpoint.model),
    };
    trackImageRecognitionUsage(activeService?.id ?? '', endpoint.model);
  };

  const markTtsUsed = (provider: TTSProvider) => {
    usageMetadataRef.current = {
      ...usageMetadataRef.current,
      tts: getTtsUsage(provider, speechService.model),
    };
    spokenTextRef.current = inputText;
    trackTtsUsage(provider, speechService.model);
  };

  const startAnalysis = (text: string, usage: AnalyzeUsageMetadata) => {
    if (!text.trim()) {
      alert(t("请输入日语句子！"));
      return;
    }

    if (submitResetTimerRef.current) {
      clearTimeout(submitResetTimerRef.current);
      submitResetTimerRef.current = null;
    }
    submitStartedRef.current = true;
    setSubmitState('idle');
    onAnalyze(text, usage);
  };

  const handleAnalyze = () => {
    setShowFirstVisitExample(false);
    startAnalysis(inputText, getCurrentUsageMetadata());
  };

  // 今日一句 / 最近记录：填入并直接解析
  const analyzeSuggestion = (text: string) => {
    handleInputTextChange(text);
    clearUsageMetadata();
    setTtsAudioUrl(null);
    startAnalysis(text, {});
  };

  const handleCancelAnalyze = () => {
    if (submitResetTimerRef.current) {
      clearTimeout(submitResetTimerRef.current);
      submitResetTimerRef.current = null;
    }
    submitStartedRef.current = false;
    wasAnalyzingRef.current = false;
    setSubmitState('idle');
    onCancelAnalyze();
  };

  const handleSpeak = async () => {
    if (!inputText.trim()) return;
    const request = speechRequest.current.start();
    setIsSpeaking(true);
    setTtsAudioUrl(null);
    setTtsError('');

    try {
      if (ttsProvider === 'edge') {
        // 使用 Edge TTS
        const url = await getJapaneseTtsAudioUrl(inputText, undefined, 'edge', {
          gender: selectedGender,
          rate: selectedRate,
          pitch: 0,
          signal: request.signal
        });
        if (!request.isCurrent()) { URL.revokeObjectURL(url); return; }
        setTtsAudioUrl(url);
        markTtsUsed('edge');
      } else if (ttsProvider === 'gemini') {
        // 使用 Gemini TTS，添加风格控制
        const stylePrompt = TTS_STYLES.find(s => s.value === selectedStyle)?.prompt || '';
        const textToSpeak = stylePrompt + inputText;
        const url = await getJapaneseTtsAudioUrl(textToSpeak, speechService.apiKey, 'gemini', { baseUrl: speechService.baseUrl, model: speechService.model, voice: selectedVoice, pitch: 0, signal: request.signal });
        if (!request.isCurrent()) { URL.revokeObjectURL(url); return; }
        setTtsAudioUrl(url);
        markTtsUsed('gemini');
      } else {
        const url = await getJapaneseTtsAudioUrl(inputText, speechService.apiKey, ttsProvider, { baseUrl: speechService.baseUrl, model: speechService.model, voice: selectedVoice, speed: speechService.speed, signal: request.signal });
        if (!request.isCurrent()) { URL.revokeObjectURL(url); return; }
        setTtsAudioUrl(url);
        markTtsUsed(ttsProvider);
      }
    } catch (e) {
      if (!request.isCurrent()) return;
      console.error('TTS error:', e);
      setTtsAudioUrl(null);
      setTtsError(t('语音服务调用失败，已尝试系统朗读：{0}', errorText(e instanceof Error ? e.message : t('未知错误'))));
      // 如果失败，回退到系统 TTS
      speakJapanese(inputText);
    } finally {
      if (request.isCurrent()) setIsSpeaking(false);
    }
  };

  const handleTtsProviderSelect = (id: string) => {
    onSpeechServiceChange(id);
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
    browserStorage.setItem('ttsVoice', voice);
    if (voice.trim()) onSpeechServiceChange(speechService.id, voice);
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    setSelectedGender(gender);
    browserStorage.setItem('ttsGender', gender);
  };

  const handleRateChange = (rate: number) => {
    setSelectedRate(rate);
    browserStorage.setItem('ttsRate', rate.toString());
  };

  const handleStyleChange = (style: string) => {
    setSelectedStyle(style);
    browserStorage.setItem('ttsStyle', style);
  };

  // 根据文本长度估算合成时间
  const getEstimatedTime = (text: string): string => {
    const length = text.length;
    if (length <= 20) return t("5-10秒");
    if (length <= 50) return t("10-20秒");
    if (length <= 100) return t("20-30秒");
    return t("30-60秒");
  };

  // 处理图片识别的通用函数
  const processImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadStatus(t("请上传图片文件！"));
      setUploadStatusClass('mt-2 text-sm');
      return;
    }

    cancelInputRequests();
    const request = imageRequest.current.start();
    setIsImageUploading(true);
    setUploadStatus(t("正在上传并识别图片中的文字..."));
    setUploadStatusClass('mt-2 text-sm');

    try {
      // 压缩图片以减小数据大小
      const compressedImageData = await compressImage(file);
      if (!request.isCurrent()) return;

      // 优化提示词，明确不要换行符
      const imageExtractionPrompt = getImageExtractionPrompt(locale);

      if (useStream) {
        // 使用流式API进行图片文字提取
        await streamExtractTextFromImage(
          compressedImageData,
          (chunk, isDone) => {
            if (!request.isCurrent()) return;
            setInputText(chunk);

            if (isDone) {
              markImageRecognitionUsed();
              setIsImageUploading(false);
              setUploadStatus(t("文字提取成功！请确认后点击\"解析\"。"));
              setUploadStatusClass('mt-2 text-sm');
            }
          },
          (error) => {
            if (!request.isCurrent()) return;
            console.error('Error during streaming image text extraction:', error);
            setUploadStatus(t("提取时发生错误: {0}。", errorText(error.message || "未知错误")));
            setUploadStatusClass('mt-2 text-sm');
            setIsImageUploading(false);
          },
           imageExtractionPrompt,
           userApiKey,
           endpoint,
           request.signal
         );
       } else {
         // 使用传统API进行图片文字提取
         const extractedText = await extractTextFromImage(compressedImageData, imageExtractionPrompt, userApiKey, endpoint, request.signal);
        if (!request.isCurrent()) return;
        setInputText(extractedText);
        markImageRecognitionUsed();
        setUploadStatus(t("文字提取成功！请确认后点击\"解析\"。"));
        setUploadStatusClass('mt-2 text-sm');
        setIsImageUploading(false);
      }
    } catch (error) {
      if (!request.isCurrent()) return;
      console.error('Error during image text extraction:', error);
      setUploadStatus(t("提取时发生错误: {0}。", error instanceof Error ? errorText(error.message) : t("未知错误")));
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

  const [isDragOver, setIsDragOver] = useState(false);

  // 处理拖放图片事件
  const handleDragOver = (event: React.DragEvent) => {
    if (event.dataTransfer?.types?.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file && file.type.startsWith('image/')) {
      setUploadStatus(t("检测到拖放的图片，正在识别..."));
      setUploadStatusClass('mt-2 text-sm');
      await processImageFile(file);
    }
  };

  // 处理粘贴事件
  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    let imageItem: DataTransferItem | null = null;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          imageItem = items[i];
          break;
        }
      }
    }

    const plainText = event.clipboardData.getData('text/plain');
    const html = event.clipboardData.getData('text/html');
    const pasted = plainText || html ? normalizePastedText(plainText, html) : '';

    // 如果剪贴板包含图片，且没有有效的文字内容（例如空白字符或空文本），优先识别图片
    if (imageItem && !pasted.trim()) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        setUploadStatus(t("检测到粘贴的图片，正在识别..."));
        setUploadStatusClass('mt-2 text-sm');
        await processImageFile(file);
      }
      return;
    }

    if (pasted) {
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      // Native insertion keeps the browser's undo history when available.
      if (document.execCommand('insertText', false, pasted)) {
        handleInputTextChange(input.value);
        return;
      }
      handleInputTextChange(input.value.slice(0, start) + pasted + input.value.slice(end));
      requestAnimationFrame(() => input.setSelectionRange(start + pasted.length, start + pasted.length));
      return;
    }

    if (imageItem) {
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        setUploadStatus(t("检测到粘贴的图片，正在识别..."));
        setUploadStatusClass('mt-2 text-sm');
        await processImageFile(file);
      }
      return;
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
            reject(new Error(t("无法创建canvas上下文")));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          // 转换为dataURL，使用较低的质量
          const quality = 0.7; // 70%的质量，可以根据需要调整
          const dataUrl = canvas.toDataURL(file.type, quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error(t("图片加载失败")));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error(t("无法读取文件")));
      reader.readAsDataURL(file);
    });
  };

  const inputTextStyle = {
    color: 'var(--ink)',
    fontSize: 'clamp(19px, 1.1vw + 6px, 22px)',
    lineHeight: 1.6,
    letterSpacing: '0.3px',
  };
  const showInputShimmer = !reduceMotion && isLoading && inputText.trim().length > 0;

  // 输入框高度随内容自适应；compact 切换会重新挂载输入框，需要对新的 textarea 重新测量和监听
  useLayoutEffect(() => {
    const input = japaneseInputRef.current;
    if (!input) return;
    const resizeInput = () => {
      const scrollTop = input.scrollTop;
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
      input.scrollTop = scrollTop;
    };
    resizeInput();
    let previousWidth = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== previousWidth) {
        previousWidth = input.clientWidth;
        resizeInput();
      }
    });
    observer.observe(input);
    window.addEventListener('resize', resizeInput);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resizeInput);
    };
  }, [compact, inputText, showFirstVisitExample]);

  useEffect(() => {
    if (!showInputShimmer) return;

    const input = japaneseInputRef.current;
    const shimmerFrame = inputShimmerFrameRef.current;
    if (!input || !shimmerFrame) return;

    shimmerFrame.scrollTop = input.scrollTop;
    shimmerFrame.scrollLeft = input.scrollLeft;
  }, [inputText, showInputShimmer]);

  // 卡片 ⇄ 胶囊：只动 opacity/transform（字符串形式），交给合成线程跑；
  // 解析开始时主线程要渲染流式结果，逐帧算尺寸的布局动画会掉帧。
  const ease = [0.22, 1, 0.36, 1] as const;
  const swap = (enterMs: number, exitMs: number, from: string, to: string, delayMs = 0) => ({
    initial: { opacity: 0, transform: from },
    animate: {
      opacity: 1,
      // 终值要与起止值同构（translateY + scale），写 'none' 会被插值成 scale(0)
      transform: 'translateY(0px) scale(1)',
      transition: reduceMotion ? { duration: 0 } : { duration: enterMs / 1000, delay: delayMs / 1000, ease },
    },
    exit: {
      opacity: 0,
      transform: to,
      transition: reduceMotion ? { duration: 0 } : { duration: exitMs / 1000, ease },
    },
  });
  const pillMotion = swap(320, 120, 'translateY(8px) scale(0.96)', 'translateY(4px) scale(0.98)', 60);
  const cardMotion = swap(300, 160, 'translateY(-6px) scale(0.985)', 'translateY(-10px) scale(0.97)');

  const compactBar = (
    <>
      <button type="button" className="nd-ghost-btn" onClick={onExpand} aria-label={t("编辑原文")}>
        {Icon.pencil}<span className="compact-label">{t("编辑原文")}</span>
      </button>
      <button
        type="button"
        className="nd-ghost-btn"
        onClick={() => {
          handleInputTextChange('');
          setTtsAudioUrl(null);
          (onNewSentence ?? onExpand)?.();
        }}
        disabled={isLoading}
        aria-label={t("新句子")}
      >
        {Icon.plus}<span className="compact-label">{t("新句子")}</span>
      </button>
      <button
        type="button"
        className="nd-ghost-btn compact-speak"
        onClick={handleSpeak}
        disabled={!inputText.trim() || isLoading || isSpeaking}
        title={inputText.trim() ? t("朗读文本（约 {0}）", getEstimatedTime(inputText)) : undefined}
      >
        {isSpeaking
          ? <span className="loading-spinner" style={{ width: 14, height: 14, margin: 0 }} />
          : Icon.speaker}
        <span>{t("朗读")}</span>
      </button>
      {isLoading && (
        <button type="button" className="nd-ghost-btn" onClick={handleCancelAnalyze} aria-label={t("终止解析")}>
          {Icon.stop}<span>{t("停止")}</span>
        </button>
      )}
      {compactExtras && (
        <>
          <span className="compact-divider" aria-hidden="true" />
          {compactExtras}
        </>
      )}
    </>
  );

  return (
    // 阅读态整块吸顶：长文往下读时胶囊工具条一直在屏幕上方
    <div className={compact ? 'w-full input-section-sticky' : 'w-full'}>
      {!compact && showSuggestions && (
        <DailySentence onAnalyze={analyzeSuggestion} disabled={isAnalyzing || isImageUploading} />
      )}

      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false}>
          {compact ? (
            <motion.div
              key="compact"
              className="input-compact-bar"
              role="toolbar"
              aria-label={t("原文操作")}
              {...pillMotion}
            >
              {compactBar}
            </motion.div>
          ) : (
            <motion.section
              key="full"
              className={`nd-card input-card ${isDragOver ? 'ring-2 ring-[var(--primary)]' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              {...cardMotion}
            >
              <div className="relative">
                {showFirstVisitExample && (
                  <div className="first-visit-example-kicker">
                    {t("第一次来？从这个句子开始")}
                  </div>
                )}
                <textarea
                  id="japaneseInput"
                  aria-label={t("日语原文")}
                  ref={japaneseInputRef}
                  lang="ja"
                  className={`jp w-full resize-none border-none bg-transparent outline-none ${showFirstVisitExample ? 'first-visit-example-input' : ''} ${showInputShimmer ? 'input-text-shimmer-source' : ''}`}
                  rows={3}
                  placeholder={t("粘贴或输入日语，看懂每一个词")}
                  value={inputText}
                  onChange={(e) => handleInputTextChange(e.target.value)}
                  onScroll={(event) => {
                    const shimmerFrame = inputShimmerFrameRef.current;
                    if (!shimmerFrame) return;
                    shimmerFrame.scrollTop = event.currentTarget.scrollTop;
                    shimmerFrame.scrollLeft = event.currentTarget.scrollLeft;
                  }}
                  onPaste={handlePaste}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && onCollapse) {
                      e.preventDefault();
                      onCollapse();
                    }
                  }}
                  style={inputTextStyle}
                  aria-describedby={showFirstVisitExample ? 'firstVisitExampleHint' : undefined}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                ></textarea>
                {showFirstVisitExample && (
                  <div id="firstVisitExampleHint" className="first-visit-example-hint" role="status">
                    {t("点击「解析」试试")}
                  </div>
                )}
                {showInputShimmer && (
                  <div
                    ref={inputShimmerFrameRef}
                    className="input-text-shimmer-layer-frame"
                    aria-hidden="true"
                    lang="ja"
                  >
                    <TextShimmer
                      as="div"
                      className="input-text-shimmer-layer jp"
                      duration={2.2}
                      spread={1.4}
                    >
                      {inputText}
                    </TextShimmer>
                  </div>
                )}
              </div>

              <div className="input-action-bar mt-3.5 flex items-center">
                {/* 左侧工具按钮区域 */}
                <div className="input-tools flex items-center gap-2">
                  {/* 模型选择：先选服务商，再选其下的模型 */}
                  {onSelectModel && (
                    <ModelSwitcher
                      services={services}
                      activeServiceId={activeServiceId}
                      activeModelId={activeModelId}
                      onSelectModel={onSelectModel}
                    />
                  )}

                  {/* 上传图片按钮 */}
                  <button
                    id="uploadImageButton"
                    className="input-tool-button"
                    onClick={() => document.getElementById('imageUploadInput')?.click()}
                    disabled={isImageUploading}
                    title={t("上传图片提取文字")}
                    aria-label={t("上传图片提取文字")}
                  >
                    {isImageUploading
                      ? <span className="loading-spinner" style={{ width: 16, height: 16, margin: 0 }} />
                      : Icon.photo}
                  </button>

                  {/* TTS按钮组 */}
                  <div className="relative" ref={dropdownRef}>
                    <div className="input-voice-controls flex">
                      <button
                        id="speakButton"
                        className="input-tool-button"
                        onClick={handleSpeak}
                        disabled={!inputText.trim() || isLoading || isSpeaking}
                        title={inputText.trim() ?
                          t("朗读文本（约 {0}）", getEstimatedTime(inputText)) :
                          t("请先输入文本")
                        }
                        aria-label={t("朗读文本")}
                      >
                        {isSpeaking
                          ? <span className="loading-spinner" style={{ width: 16, height: 16, margin: 0 }} />
                          : Icon.speakerLg}
                      </button>

                      <button
                        className="input-tool-button input-tool-disclosure"
                        onClick={() => setShowTtsDropdown(!showTtsDropdown)}
                        disabled={isLoading || isSpeaking}
                        title={t("语音设置")}
                        aria-label={t("语音设置")}
                        aria-expanded={showTtsDropdown}
                        aria-controls="inputVoiceSettings"
                      >
                        {Icon.chev}
                      </button>
                    </div>

                    {/* TTS设置下拉菜单 */}
                    {showTtsDropdown && (
                      <AnchoredPopover anchorRef={dropdownRef} onClose={() => setShowTtsDropdown(false)} role="dialog" label={t('语音设置')}
                        id="inputVoiceSettings"
                        className="input-voice-menu rounded-2xl p-4"
                      >
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ink)' }}><ProviderLogo profile={{ id: speechService.provider, name: speechService.name }} />{t("语音设置")}</div>

                        {/* TTS提供商选择 */}
                        <div className="mb-3">
                          <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{t("语音引擎")}</label>
                          <select className="nd-input text-sm" aria-label={t('语音服务')} value={speechService.id} onChange={(event) => handleTtsProviderSelect(event.target.value)}>
                            {speechServices.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.model}</option>)}
                          </select>
                        </div>

                        {/* Edge TTS 设置 */}
                        {ttsProvider === 'edge' && (
                          <>
                            <div className="mb-3">
                              <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{t("语音性别")}</label>
                              <select
                                value={selectedGender}
                                onChange={(e) => handleGenderChange(e.target.value as 'male' | 'female')}
                                className="nd-input text-sm"
                              >
                                {TTS_GENDERS.map((gender) => (
                                  <option key={gender.value} value={gender.value}>
                                    {t(gender.label)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mb-2">
                              <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                                {t("语速 ·")} {t(getRateLabel(selectedRate))}
                              </label>
                              <input
                                type="range"
                                aria-label={t("语速")}
                                aria-valuetext={t(getRateLabel(selectedRate))}
                                min="-100"
                                max="100"
                                step="10"
                                value={selectedRate}
                                onChange={(e) => handleRateChange(parseInt(e.target.value))}
                                className="h-2 w-full cursor-pointer appearance-none rounded-lg"
                                style={{ background: 'var(--line-2)', accentColor: 'var(--primary)' }}
                              />
                              <div className="mt-1 flex justify-between text-xs" style={{ color: 'var(--ink-3)' }}>
                                <span>{t("慢")}</span>
                                <span>{t("正常")}</span>
                                <span>{t("快")}</span>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Gemini TTS 设置 */}
                        {ttsProvider === 'gemini' && (
                          <>
                            <div className="mb-3">
                              <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{t("语音选择")}</label>
                              <select
                                value={selectedVoice}
                                onChange={(e) => handleVoiceChange(e.target.value)}
                                className="nd-input text-sm"
                              >
                                {!GEMINI_VOICES.some((voice) => voice.value === selectedVoice) && <option value={selectedVoice}>{selectedVoice}</option>}
                                {GEMINI_VOICES.map((voice) => (
                                  <option key={voice.value} value={voice.value}>
                                    {t(voice.label)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mb-2">
                              <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{t("语音风格")}</label>
                              <select
                                value={selectedStyle}
                                onChange={(e) => handleStyleChange(e.target.value)}
                                className="nd-input text-sm"
                              >
                                {TTS_STYLES.map((style) => (
                                  <option key={style.value} value={style.value}>
                                    {t(style.label)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                        {(ttsProvider === 'openai' || ttsProvider === 'minimax') && <label className="block text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{t('音色 ID')}<input className="nd-input mt-2 text-sm" value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)} onBlur={(event) => handleVoiceChange(event.target.value)} /></label>}
                      </AnchoredPopover>
                    )}
                  </div>
                </div>

                <div className="input-submit-controls">
                  {/* 清空按钮 */}
                  {inputText.trim() !== '' && (
                    <button
                      className="input-tool-button input-clear-button"
                      onClick={() => {
                        handleInputTextChange('');
                        setTtsAudioUrl(null);
                        setShowFirstVisitExample(false);
                        clearUsageMetadata();
                      }}
                      title={t("清空内容")}
                      aria-label={t("清空内容")}
                    >
                      {Icon.xSm}
                    </button>
                  )}

                  {/* 解析按钮 */}
                  <StateMorphButton
                    id="analyzeButton"
                    onClick={isLoading ? handleCancelAnalyze : handleAnalyze}
                    disabled={!isLoading && !inputText.trim()}
                    state={isAnalyzing ? 'loading' : submitState === 'success' && !analysisError ? 'success' : 'idle'}
                    className={showFirstVisitExample ? 'first-visit-submit-cue' : undefined}
                  />
                </div>
              </div>

              {/* 隐藏的文件输入 */}
              <input
                type="file"
                id="imageUploadInput"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {!compact && showSuggestions && (
        <div className="home-suggestions">
          <AnalysisHistory
            entries={history.entries}
            storageUnavailable={history.storageUnavailable}
            disabled={isAnalyzing || isImageUploading || isSpeaking}
            onClear={history.clear}
            onSelect={analyzeSuggestion}
          />
        </div>
      )}

      {uploadStatus && <div id="imageUploadStatus" className={uploadStatusClass}>{errorText(uploadStatus)}</div>}
      {ttsError && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--pos-p)' }}>{ttsError}</p>}

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
          <p className="m-0 font-medium">{t("正在准备朗读…")}</p>
          <p className="mb-0 mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
            {t("预计需要")} {getEstimatedTime(inputText)}
          </p>
        </div>
      )}
    </div>
  );
}
