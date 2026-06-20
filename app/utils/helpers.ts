// 工具函数
import { synthesizeSpeech } from '../services/api';

// 检查字符串是否包含汉字
export function containsKanji(text: string): boolean {
  const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
  return kanjiRegex.test(text);
}

// 学校文法词性分组（十类颜色，記号/改行/未知走其他）
export type PosGroup = 'n' | 'v' | 'adj' | 'adjv' | 'adv' | 'adn' | 'conj' | 'int' | 'p' | 'aux' | 'o';
export const POS_LEGEND_GROUPS = ['n', 'v', 'adj', 'adjv', 'adv', 'adn', 'conj', 'int', 'p', 'aux'] as const;

export function normalizePosBase(pos?: string | null): string {
  const value = (pos || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

  if (!value) return 'その他';

  if (/改行|linebreak|newline/.test(value)) return '改行';
  if (/記号|符号|標点|标点|句読点|punctuation|symbol/.test(value)) return '記号';
  if (/助動詞|助动词|auxiliary/.test(value)) return '助動詞';
  if (/助詞|助词|particle/.test(value)) return '助詞';
  if (/感動詞|感动词|interjection/.test(value)) return '感動詞';
  if (/接続詞|接续词|conjunction/.test(value)) return '接続詞';
  if (/連体詞|连体词|adnominal/.test(value)) return '連体詞';
  if (/副詞|副词|adverb/.test(value)) return '副詞';
  if (/形容動詞|形容动词|形状詞|na-adjective|adjectivalnoun/.test(value)) return '形容動詞';
  if (/形容詞|形容词|adjective|\badj\b/.test(value)) return '形容詞';
  if (/動詞|动词|verb/.test(value)) return '動詞';
  if (/代名詞|代名词|代词|名詞|名词|noun/.test(value)) return '名詞';

  const [basePos] = (pos || '').trim().split(/[-,，、/／・\s(（]/);
  return basePos || 'その他';
}

export function getPosClass(pos: string): string {
  return `pos-group-${getPosGroup(pos)}`;
}

export function getPosGroup(pos: string): PosGroup {
  const basePos = normalizePosBase(pos);
  switch (basePos) {
    case '名詞':
    case '代名詞':
      return 'n';
    case '動詞':
      return 'v';
    case '形容詞':
      return 'adj';
    case '形容動詞':
    case '形状詞':
      return 'adjv';
    case '副詞':
      return 'adv';
    case '連体詞':
      return 'adn';
    case '接続詞':
      return 'conj';
    case '感動詞':
      return 'int';
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
  adjv: 'var(--pos-adjv)',
  adv: 'var(--pos-adv)',
  adn: 'var(--pos-adn)',
  conj: 'var(--pos-conj)',
  int: 'var(--pos-int)',
  p: 'var(--pos-p)',
  aux: 'var(--pos-aux)',
  o: 'var(--pos-o)',
};

export const POS_GROUP_LABELS: Record<PosGroup, string> = {
  n: '名词',
  v: '动词',
  adj: '形容词',
  adjv: '形容动词',
  adv: '副词',
  adn: '连体词',
  conj: '接续词',
  int: '感动词',
  p: '助词',
  aux: '助动词',
  o: '其他',
};

// 词性中日对照表
export const posChineseMap: Record<string, string> = {
  "名詞": "名词", "動詞": "动词", "形容詞": "形容词", "副詞": "副词",
  "助詞": "助词", "助動詞": "助动词", "接続詞": "接续词", "感動詞": "感动词",
  "連体詞": "连体词", "代名詞": "代名词", "形容動詞": "形容动词", "形状詞": "形容动词", "記号": "符号",
  "接頭辞": "接头辞", "接尾辞": "接尾辞", "フィラー": "填充词", "その他": "其他",
  "改行": "换行",
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
