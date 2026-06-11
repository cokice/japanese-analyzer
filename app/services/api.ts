// API与分析相关的服务函数

export interface TokenData {
  word: string;
  pos: string;
  furigana?: string;
  romaji?: string;
}

export interface WordDetail {
  originalWord: string;
  chineseTranslation: string;
  pos: string;
  furigana?: string;
  romaji?: string;
  dictionaryForm?: string;
  explanation: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AIProvider = 'gemini' | 'deepseek';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface StoredAISettings {
  aiProvider: AIProvider;
  geminiApiKey: string;
  geminiApiUrl: string;
  deepseekApiKey: string;
  deepseekApiUrl: string;
}

// 默认API地址 - 使用本地API路由
export const DEFAULT_API_URL = "/api";
export const DEFAULT_AI_PROVIDER: AIProvider = 'deepseek';
const GEMINI_MODEL_NAME = "gemini-3.5-flash";
const DEEPSEEK_MODEL_NAME = "deepseek-v4-flash";
const EDGE_TTS_URL = 'https://api.howen.ink/api/tts';
const EDGE_TTS_VOICES = {
  male: 'ja-JP-KeitaNeural',
  female: 'ja-JP-NanamiNeural',
};

export function normalizeAIProvider(value?: string | null): AIProvider {
  return value === 'gemini' || value === 'deepseek' ? value : DEFAULT_AI_PROVIDER;
}

export function getModelName(provider: AIProvider = DEFAULT_AI_PROVIDER): string {
  return provider === 'deepseek' ? DEEPSEEK_MODEL_NAME : GEMINI_MODEL_NAME;
}

function getProviderApiUrl(apiUrl?: string): string | undefined {
  return apiUrl && apiUrl !== DEFAULT_API_URL ? apiUrl : undefined;
}

export function getRequestProviderPayload(
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  apiUrl?: string
) {
  return {
    provider,
    model: getModelName(provider),
    apiUrl: getProviderApiUrl(apiUrl),
  };
}

export function loadAISettingsFromStorage(storage: StorageLike): StoredAISettings {
  const legacyApiKey = storage.getItem('userApiKey') || '';
  const legacyApiUrl = storage.getItem('userApiUrl') || DEFAULT_API_URL;

  let geminiApiKey = storage.getItem('geminiApiKey');
  if (geminiApiKey === null && legacyApiKey) {
    geminiApiKey = legacyApiKey;
    storage.setItem('geminiApiKey', legacyApiKey);
  }

  let geminiApiUrl = storage.getItem('geminiApiUrl');
  if (geminiApiUrl === null && legacyApiUrl && legacyApiUrl !== DEFAULT_API_URL) {
    geminiApiUrl = legacyApiUrl;
    storage.setItem('geminiApiUrl', legacyApiUrl);
  }

  return {
    aiProvider: normalizeAIProvider(storage.getItem('aiProvider')),
    geminiApiKey: geminiApiKey || '',
    geminiApiUrl: geminiApiUrl || DEFAULT_API_URL,
    deepseekApiKey: storage.getItem('deepseekApiKey') || '',
    deepseekApiUrl: storage.getItem('deepseekApiUrl') || DEFAULT_API_URL,
  };
}

// 获取API请求URL
export function getApiEndpoint(endpoint: string): string {
  return `${DEFAULT_API_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
}

// 构建请求头
function getHeaders(userApiKey?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  
  // 如果用户提供了自定义API密钥，则添加到请求头
  if (userApiKey) {
    headers['Authorization'] = `Bearer ${userApiKey}`;
  }
  
  return headers;
}

function buildAnalyzePrompt(sentence: string): string {
  return `请对以下日语句子进行详细的词法分析，并以JSON数组格式返回结果。每个对象应包含以下字段："word", "pos", "furigana", "romaji"。

请特别注意以下分析要求：
1. 将助动词与对应动词正确结合。如"食べた"应作为一个单词，而不是分开为"食べ"和"た"。
2. 正确识别动词的时态变化，如"いた"是"いる"的过去时，应作为一个完整单词处理。
3. 合理处理助词，应当与前后词汇适当分离。
4. 避免过度分词，特别是对于构成一个语法或语义单位的组合。
5. 对于复合词，如"持って行く"，根据语义和使用习惯确定是作为一个词还是分开处理。
6. 标点符号不要标记为普通词，不要给标点生成假名或罗马音。为了保留原文显示，若需要输出标点，只能使用 {"word": "标点原文", "pos": "記号", "furigana": "", "romaji": ""}，不能分配名词、助词、其他等词性。包括但不限于：。 、 ， . , ？ ? ！ ! ： : ； ; 「 」 『 』 （ ） ( ) 等。
7. 重要：如果待解析的句子中包含换行符，请在对应的位置输出一个JSON对象：{"word": "\n", "pos": "改行", "furigana": "", "romaji": ""}.

确保输出是严格的JSON格式，不包含任何markdown或其他非JSON字符。

待解析句子： "${sentence}"`;
}

function getDeltaContentFromStreamData(data: string, parseWarning: string): string {
  try {
    const parsed = JSON.parse(data);
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === 'string' ? content : '';
  } catch (error) {
    console.warn(parseWarning, error, data);
    return '';
  }
}

async function readOpenAIContentStream(
  response: Response,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  options: {
    debounceMs?: number;
    parseWarning?: string;
  } = {}
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError(new Error('无法创建流式读取器'));
    return;
  }

  const decoder = new TextDecoder();
  const debounceMs = options.debounceMs ?? 16;
  const parseWarning = options.parseWarning ?? 'Failed to parse streaming JSON chunk:';
  let buffer = '';
  let rawContent = '';
  let updateTimeout: ReturnType<typeof setTimeout> | null = null;

  const emit = (content: string, isComplete: boolean) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
      updateTimeout = null;
    }

    if (isComplete) {
      onChunk(content, true);
      return;
    }

    updateTimeout = setTimeout(() => {
      onChunk(content, false);
    }, debounceMs);
  };

  const handleData = (data: string): boolean => {
    if (data === '[DONE]') {
      emit(rawContent, true);
      return true;
    }

    const content = getDeltaContentFromStreamData(data, parseWarning);
    if (content) {
      rawContent += content;
      emit(rawContent, false);
    }

    return false;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim() === '') continue;

      const trimmedLine = line.trimEnd();
      if (!trimmedLine.startsWith('data:')) continue;

      const data = trimmedLine.substring(5).trimStart();
      if (handleData(data)) return;
    }
  }

  if (buffer.trim() !== '') {
    const trimmedBuffer = buffer.trim();
    if (trimmedBuffer.startsWith('data:')) {
      const data = trimmedBuffer.substring(5).trimStart();
      if (handleData(data)) return;
    }
  }

  emit(rawContent, true);
}

// 分析日语句子
export async function analyzeSentence(
  sentence: string,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  try {
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        prompt: buildAnalyzePrompt(sentence),
        ...getRequestProviderPayload(provider, userApiUrl)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Analysis):', errorData);
      throw new Error(`解析失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }
    
    const result = await response.json();

    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      let responseContent = result.choices[0].message.content;
      try {
        const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          responseContent = jsonMatch[1];
        }
        return JSON.parse(responseContent) as TokenData[];
      } catch (e) {
        console.error("Failed to parse JSON from analysis response:", e, responseContent);
        throw new Error('解析结果JSON格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Analysis):', result);
      throw new Error('解析结果格式错误，请重试');
    }
  } catch (error) {
    console.error('Error analyzing sentence:', error);
    throw error;
  }
}

// 流式分析日语句子
export async function streamAnalyzeSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<void> {
  if (!sentence) {
    onError(new Error('缺少句子'));
    return;
  }

  try {
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        prompt: buildAnalyzePrompt(sentence),
        ...getRequestProviderPayload(provider, userApiUrl),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Analysis):', errorData);
      onError(new Error(`流式解析失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 16,
      parseWarning: 'Failed to parse streaming JSON chunk:',
    });
  } catch (error) {
    console.error('Error in stream analyzing sentence:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

// 流式翻译文本
export async function streamTranslateText(
  japaneseText: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        text: japaneseText,
        ...getRequestProviderPayload(provider, userApiUrl),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Translation):', errorData);
      onError(new Error(`流式翻译失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 16,
      parseWarning: 'Failed to parse streaming JSON chunk:',
    });
  } catch (error) {
    console.error('Error in stream translating text:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

// 获取词汇详情
export async function getWordDetails(
  word: string, 
  pos: string, 
  sentence: string, 
  furigana?: string, 
  romaji?: string,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<WordDetail> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        word, 
        pos, 
        sentence, 
        furigana, 
        romaji,
        ...getRequestProviderPayload(provider, userApiUrl)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Word Detail):', errorData);
      throw new Error(`查询释义失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      let responseContent = result.choices[0].message.content;
      try {
        const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          responseContent = jsonMatch[1];
        }
        return JSON.parse(responseContent) as WordDetail;
      } catch (e) {
        console.error("Failed to parse JSON from word detail response:", e, responseContent);
        throw new Error('释义结果JSON格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Word Detail):', result);
      throw new Error('释义结果格式错误');
    }
  }
  catch (error) {
    console.error('Error fetching word details:', error);
    throw error;
  }
}

// 流式词汇详情查询函数
export async function streamWordDetails(
  word: string,
  pos: string,
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  furigana?: string,
  romaji?: string,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        word, 
        pos, 
        sentence, 
        furigana, 
        romaji,
        ...getRequestProviderPayload(provider, userApiUrl),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Word Detail):', errorData);
      onError(new Error(`流式查询释义失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 30,
      parseWarning: '解析流式数据时出错:',
    });
    
  } catch (error) {
    console.error('Stream Word Detail error:', error);
    onError(error instanceof Error ? error : new Error('流式查询词汇详情时出错'));
  }
}

// 翻译文本
export async function translateText(
  japaneseText: string,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        text: japaneseText,
        ...getRequestProviderPayload(provider, userApiUrl)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Translation):', errorData);
      throw new Error(`翻译失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      return result.choices[0].message.content.trim();
    } else {
      console.error('Unexpected API response structure (Translation):', result);
      throw new Error('翻译结果格式错误');
    }
  } catch (error) {
    console.error('Error translating text:', error);
    throw error;
  }
}

// 从图片提取文本
export async function extractTextFromImage(
  imageData: string, 
  prompt?: string,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<string> {
  if (provider === 'deepseek') {
    throw new Error('DeepSeek 当前不支持图片识别，请切换 Gemini 后重试。');
  }

  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        imageData, 
        prompt,
        ...getRequestProviderPayload(provider, userApiUrl)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Image to Text):', errorData);
      throw new Error(`图片文字提取失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      return result.choices[0].message.content.trim();
    } else {
      console.error('Unexpected API response structure (Image to Text):', result);
      throw new Error('图片文字提取结果格式错误');
    }
  } catch (error) {
    console.error('Error extracting text from image:', error);
    throw error;
  }
}

// 从图片提取文本 - 流式版本
export async function streamExtractTextFromImage(
  imageData: string, 
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  prompt?: string,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<void> {
  if (provider === 'deepseek') {
    onError(new Error('DeepSeek 当前不支持图片识别，请切换 Gemini 后重试。'));
    return;
  }

  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        imageData, 
        prompt,
        ...getRequestProviderPayload(provider, userApiUrl),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Image to Text):', errorData);
      onError(new Error(`流式图片文字提取失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 16,
      parseWarning: 'Failed to parse streaming JSON chunk:',
    });
  } catch (error) {
    console.error('Error in stream extracting text from image:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

// 合成语音
export async function synthesizeSpeech(
  text: string,
  provider: 'edge' | 'gemini' = 'edge',
  options: { gender?: 'male' | 'female'; voice?: string; rate?: number; pitch?: number } = {},
  userApiKey?: string
): Promise<{ audio: string; mimeType: string }> {
  const { gender = 'female', voice = 'Kore', rate = 0, pitch = 0 } = options;

  if (provider === 'edge') {
    const response = await fetch(EDGE_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: EDGE_TTS_VOICES[gender],
        rate,
        pitch,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = typeof errorData.error === 'string'
        ? errorData.error
        : errorData.error?.message || `Edge TTS 请求失败（HTTP ${response.status}）`;
      throw new Error(message);
    }

    const audioBuffer = await response.arrayBuffer();
    if (!audioBuffer.byteLength) {
      throw new Error('Edge TTS 返回空音频');
    }

    return {
      audio: arrayBufferToBase64(audioBuffer),
      mimeType: response.headers.get('content-type') || 'audio/mpeg',
    };
  }

  const apiUrl = getApiEndpoint('/tts');
  const headers = getHeaders(userApiKey);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ 
      text, 
      provider,
      gender,
      voice,
      rate,
      pitch
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'TTS 请求失败');
  }

  return response.json();
}

// 聊天API - 流式版本
export async function streamChat(
  messages: ChatMessage[],
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        messages,
        ...getRequestProviderPayload(provider, userApiUrl),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Stream Chat):', errorData);
      onError(new Error(`聊天失败：${errorData.error?.message || response.statusText || '未知错误'}`));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      debounceMs: 30,
      parseWarning: '解析聊天流式数据时出错:',
    });
    
  } catch (error) {
    console.error('Stream Chat error:', error);
    onError(error instanceof Error ? error : new Error('聊天时出错'));
  }
}

/**
 * @public Retained for non-streaming chat callers.
 */
export async function sendChat(
  messages: ChatMessage[],
  userApiKey?: string,
  userApiUrl?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        messages,
        ...getRequestProviderPayload(provider, userApiUrl),
        useStream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error (Chat):', errorData);
      throw new Error(`聊天失败：${errorData.error?.message || response.statusText || '未知错误'}`);
    }

    const result = await response.json();
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      return result.choices[0].message.content.trim();
    } else {
      console.error('Unexpected API response structure (Chat):', result);
      throw new Error('聊天结果格式错误');
    }
  } catch (error) {
    console.error('Error sending chat:', error);
    throw error;
  }
}
