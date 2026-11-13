import { type AIProvider, DEFAULT_AI_PROVIDER, getRequestProviderPayload } from '../lib/aiModels';
import { getApiEndpoint, getHeaders, isAbortError } from './request';
import { apiErrorFromResponse, InvalidResponseError } from '../utils/requestErrors';
import { validateCompletion } from '../lib/apiResponse';
import { readOpenAIContentStream } from './openaiStream';

// 从图片提取文本
export async function extractTextFromImage(
  imageData: string, 
  prompt?: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal
): Promise<string> {
  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        imageData, 
        prompt,
        ...getRequestProviderPayload(provider, model)
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Image to Text):', errorData);
      throw apiErrorFromResponse(errorData, response.status);
    }

    const result = await response.json();
    validateCompletion(result, '图片文字提取');
    
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
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  signal?: AbortSignal
): Promise<void> {
  try {
    const apiUrl = getApiEndpoint('/image-to-text');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ 
        imageData, 
        prompt,
        ...getRequestProviderPayload(provider, model),
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error (Stream Image to Text):', errorData);
      onError(apiErrorFromResponse(errorData, response.status));
      return;
    }
    
    await readOpenAIContentStream(response, onChunk, onError, {
      signal,
      debounceMs: 16,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: content => {
        if (!content.trim()) throw new InvalidResponseError('没有识别到图片中的文字');
      },
      invalidContentMessage: '没有识别到图片中的文字，请换一张图片重试。',
      completionLabel: '图片文字提取',
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    console.error('Error in stream extracting text from image:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}
