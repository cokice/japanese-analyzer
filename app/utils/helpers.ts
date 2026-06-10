// 工具函数
import { synthesizeSpeech } from '../services/api';

// 检查字符串是否包含汉字
export function containsKanji(text: string): boolean {
  const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
  return kanjiRegex.test(text);
}

export interface FuriganaPart {
  base: string;
  ruby?: string;
}

// 智能解析单词和读音，生成用于Ruby标签渲染的结构
export function generateFuriganaParts(word: string, reading: string): FuriganaPart[] {
  // 如果没有读音，或者读���与单词相同，则直接返回原单词
  if (!reading || word === reading) {
    return [{ base: word }];
  }

  const KANJI_REGEX = /[\u4e00-\u9faf\u3005-\u3007]/;
  const KANA_REGEX = /[\u3041-\u3096\u30A1-\u30FA]/;

  const result: FuriganaPart[] = [];
  let wordIdx = 0;
  let readingIdx = 0;

  while (wordIdx < word.length) {
    const wordChar = word[wordIdx];

    // 如果是假名，则它是一个“锚点”，读音和写法应该一致
    if (KANA_REGEX.test(wordChar)) {
      result.push({ base: wordChar });
      wordIdx++;
      readingIdx++;
      continue;
    }

    // 如果是汉字
    if (KANJI_REGEX.test(wordChar)) {
      // 找到连续的汉字块
      let kanjiBlockEnd = wordIdx;
      while (
        kanjiBlockEnd + 1 < word.length &&
        KANJI_REGEX.test(word[kanjiBlockEnd + 1])
      ) {
        kanjiBlockEnd++;
      }
      const kanjiBlock = word.substring(wordIdx, kanjiBlockEnd + 1);

      // 找到这个汉字块后面的第一个假名块（作为下一个锚点）
      let nextKanaBlock = '';
      if (kanjiBlockEnd + 1 < word.length) {
        const nextKanaBlockStart = kanjiBlockEnd + 1;
        // 确保我们只匹配假名作为锚点
        if (KANA_REGEX.test(word[nextKanaBlockStart])) {
            let nextKanaBlockEnd = nextKanaBlockStart;
            while (
              nextKanaBlockEnd < word.length &&
              KANA_REGEX.test(word[nextKanaBlockEnd])
            ) {
              nextKanaBlockEnd++;
            }
            nextKanaBlock = word.substring(nextKanaBlockStart, nextKanaBlockEnd);
        }
      }

      // 根据下一个假名锚点在读音中的位置，来切分当前汉字块的读音
      let readingBlockEnd = reading.length;
      if (nextKanaBlock) {
        const nextKanaIdx = reading.indexOf(nextKanaBlock, readingIdx);
        if (nextKanaIdx !== -1) {
          readingBlockEnd = nextKanaIdx;
        }
      }

      const readingBlock = reading.substring(readingIdx, readingBlockEnd);
      result.push({ base: kanjiBlock, ruby: readingBlock });

      wordIdx = kanjiBlockEnd + 1;
      readingIdx = readingBlockEnd;
      continue;
    }
    
    // 如果不是汉字也不是假名（例如符号），直接添加
    result.push({ base: wordChar });
    wordIdx++;
    // 假设符号不影响读音指针
    if (reading[readingIdx] === wordChar) {
      readingIdx++;
    }
  }
  return result;
}


// 获取词性对应的CSS类名
export function getPosClass(pos: string): string {
  const basePos = pos.split('-')[0];
  const knownPos = ["名詞", "動詞", "形容詞", "副詞", "助詞", "助動詞", "接続詞", "感動詞", "連体詞", "代名詞", "形状詞", "記号", "接頭辞", "接尾辞", "フィラー", "その他"];
  if (knownPos.includes(basePos)) {
    return `pos-${basePos}`;
  }
  return 'pos-default';
}

// 新设计：词性分组（6 类颜色）
export type PosGroup = 'n' | 'v' | 'adj' | 'p' | 'aux' | 'o';

export function getPosGroup(pos: string): PosGroup {
  const basePos = pos.split('-')[0];
  switch (basePos) {
    case '名詞':
    case '代名詞':
      return 'n';
    case '動詞':
      return 'v';
    case '形容詞':
    case '形状詞':
      return 'adj';
    case '助詞':
      return 'p';
    case '助動詞':
      return 'aux';
    default:
      return 'o';
  }
}

// 词性分组对应的 CSS 变量颜色
export const POS_GROUP_COLORS: Record<PosGroup, string> = {
  n: 'var(--pos-n)',
  v: 'var(--pos-v)',
  adj: 'var(--pos-adj)',
  p: 'var(--pos-p)',
  aux: 'var(--pos-aux)',
  o: 'var(--pos-o)',
};

export const POS_GROUP_LABELS: Record<PosGroup, string> = {
  n: '名词',
  v: '动词',
  adj: '形容词',
  p: '助词',
  aux: '助动词',
  o: '其他',
};

// 词性中日对照表
export const posChineseMap: Record<string, string> = {
  "名詞": "名词", "動詞": "动词", "形容詞": "形容词", "副詞": "副词",
  "助詞": "助词", "助動詞": "助动词", "接続詞": "接续词", "感動詞": "感动词",
  "連体詞": "连体词", "代名詞": "代名词", "形状詞": "形容动词", "記号": "符号",
  "接頭辞": "接头辞", "接尾辞": "接尾辞", "フィラー": "填充词", "その���": "其他",
  "default": "未知词性"
};

// 朗读日语文本
export function speakJapanese(text: string): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } else {
    console.warn('浏览器不支持语音朗读功能');
  }
}

// 使用Edge/Gemini TTS朗读文本
export async function speakJapaneseWithTTS(
  text: string, 
  apiKey?: string, 
  provider: 'edge' | 'gemini' = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number } = {}
): Promise<void> {
  try {
    const url = await getJapaneseTtsAudioUrl(text, apiKey, provider, options);
    const audioElement = new Audio(url);
    audioElement.play();
  } catch (error) {
    console.warn(`${provider} TTS 播放失败`, error);
    // 回退到系统朗读（如果需要的话）
    speakJapanese(text);
  }
}

// 获取 TTS 音频 URL
export async function getJapaneseTtsAudioUrl(
  text: string, 
  apiKey?: string, 
  provider: 'edge' | 'gemini' = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number } = {}
): Promise<string> {
  const { audio, mimeType } = await synthesizeSpeech(text, provider, options, apiKey);
  return provider === 'edge' ? 
    createPlayableUrlFromAudio(audio, mimeType) : 
    createPlayableUrlFromPcm(audio, mimeType);
}

// 将 Base64 音频数据转换为可播放的 URL (Edge TTS用)
function createPlayableUrlFromAudio(base64: string, mimeType: string): string {
  const byteString = atob(base64);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  
  const blob = new Blob([arrayBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

// 将 Base64 PCM 数据转换为可播放的 WAV URL (Gemini TTS用)
function createPlayableUrlFromPcm(base64: string, mimeType: string): string {
  const byteString = atob(base64);
  const pcmData = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    pcmData[i] = byteString.charCodeAt(i);
  }

  const match = /rate=(\d+)/.exec(mimeType);
  const sampleRate = match ? parseInt(match[1], 10) : 24000;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);

  function writeString(off: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(off + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length, true);

  for (let i = 0; i < pcmData.length; i++) {
    view.setUint8(44 + i, pcmData[i]);
  }

  const wavBlob = new Blob([view], { type: 'audio/wav' });
  return URL.createObjectURL(wavBlob);
}

// 默认API URL
const DEFAULT_API_URL = 
  process.env.API_URL || 
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// 保存API设置到localStorage
export function saveApiSettings(apiKey: string, apiUrl: string): void {
  if (typeof window !== 'undefined') {
    if (apiKey) {
      localStorage.setItem('userApiKey', apiKey);
    } else {
      localStorage.removeItem('userApiKey');
    }
    
    if (apiUrl && apiUrl !== DEFAULT_API_URL) {
      localStorage.setItem('userApiUrl', apiUrl);
    } else {
      localStorage.removeItem('userApiUrl');
    }
  }
}

// 从localStorage获取API设置
export function getApiSettings(): { apiKey: string, apiUrl: string } {
  if (typeof window !== 'undefined') {
    // 尝试从localStorage读取
    const savedApiKey = localStorage.getItem('userApiKey') || '';
    const savedApiUrl = localStorage.getItem('userApiUrl') || DEFAULT_API_URL;
    
    // 尝试从环境变量读取默认值（如果本地没有值）
    const apiKey = savedApiKey || process.env.API_KEY || '';
    const apiUrl = savedApiUrl;
    
    return { apiKey, apiUrl };
  }
  return { 
    apiKey: process.env.API_KEY || '', 
    apiUrl: DEFAULT_API_URL 
  };
} 