import { type AIProvider, DEFAULT_AI_PROVIDER, getRequestProviderPayload } from '../lib/aiModels';
import { getApiEndpoint, getHeaders, isAbortError } from './request';
import { apiErrorFromResponse, InvalidResponseError } from '../utils/requestErrors';
import { readOpenAIContentStream } from './openaiStream';
import { validateCompletion } from '../lib/apiResponse';

// 流式翻译文本
export async function streamTranslateText(
  japaneseText: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        text: japaneseText,
        ...getRequestProviderPayload(provider, model),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Stream Translation):', errorData);
      onError(apiErrorFromResponse(errorData, response.status));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      signal,
      debounceMs: 60,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: content => {
        if (!content.trim()) throw new InvalidResponseError('译文为空');
      },
      invalidContentMessage: '译文为空，请重试。',
      completionLabel: '翻译结果',
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    console.error('Error in stream translating text:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

// 翻译文本
export async function translateText(
  japaneseText: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/translate');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        text: japaneseText,
        ...getRequestProviderPayload(provider, model)
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Translation):', errorData);
      throw apiErrorFromResponse(errorData, response.status);
    }

    const result = await response.json();
    validateCompletion(result, '翻译');
    
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
