import { type ChatMessage } from '../lib/apiTypes';
import { type AIProvider, DEFAULT_AI_PROVIDER, getRequestProviderPayload } from '../lib/aiModels';
import { getApiEndpoint, getHeaders } from './request';
import { apiErrorFromResponse, InvalidResponseError } from '../utils/requestErrors';
import { readOpenAIContentStream } from './openaiStream';
import { validateCompletion } from '../lib/apiResponse';

// 聊天API - 流式版本
export async function streamChat(
  messages: ChatMessage[],
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        messages,
        ...getRequestProviderPayload(provider, model),
        useStream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error (Stream Chat):', errorData);
      onError(apiErrorFromResponse(errorData, response.status));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      signal,
      debounceMs: 30,
      parseWarning: '解析聊天流式数据时出错:',
      validateFinalContent: content => {
        if (!content.trim()) throw new InvalidResponseError('聊天回复为空');
      },
      invalidContentMessage: '聊天回复为空，请重试。',
    });
    
  } catch (error) {
    if (signal?.aborted) return;
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
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/chat');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        messages,
        ...getRequestProviderPayload(provider, model),
        useStream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Chat):', errorData);
      throw apiErrorFromResponse(errorData, response.status);
    }

    const result = await response.json();
    validateCompletion(result, '聊天');
    
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
