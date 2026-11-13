import { type AIProvider, DEFAULT_AI_PROVIDER, getRequestProviderPayload } from '../lib/aiModels';
import { type WordDetailKind, type WordDetail } from '../lib/apiTypes';
import { getApiEndpoint, getHeaders, isAbortError } from './request';
import { apiErrorFromResponse } from '../utils/requestErrors';
import { validateCompletion, parseWordDetailResponseContent } from '../lib/apiResponse';
import { readOpenAIContentStream } from './openaiStream';

// 获取词汇详情
export async function getWordDetails(
  word: string, 
  pos: string, 
  sentence: string, 
  furigana?: string, 
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal,
  kind: WordDetailKind = 'word'
): Promise<WordDetail> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        word, 
        pos, 
        sentence, 
        furigana, 
        kind,
        ...getRequestProviderPayload(provider, model)
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Word Detail):', errorData);
      throw apiErrorFromResponse(errorData, response.status);
    }

    const result = await response.json();
    validateCompletion(result, '词语详解');
    
    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      const responseContent = result.choices[0].message.content;
      try {
        return parseWordDetailResponseContent(responseContent, { word, pos, furigana, kind });
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
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal,
  kind: WordDetailKind = 'word'
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/word-detail');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        word, 
        pos, 
        sentence, 
        furigana, 
        kind,
        ...getRequestProviderPayload(provider, model),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Stream Word Detail):', errorData);
      onError(apiErrorFromResponse(errorData, response.status));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      signal,
      debounceMs: 50,
      parseWarning: '解析流式数据时出错:',
      validateFinalContent: content => parseWordDetailResponseContent(content, { word, pos, furigana, kind }),
      invalidContentMessage: '词语详解没有完整生成，请重新生成。',
      completionLabel: '词语详解',
    });
    
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    console.error('Stream Word Detail error:', error);
    onError(error instanceof Error ? error : new Error('流式查询词汇详情时出错'));
  }
}
