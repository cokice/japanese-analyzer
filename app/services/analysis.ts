import { type AIProvider, DEFAULT_AI_PROVIDER, getRequestProviderPayload } from '../lib/aiModels';
import { type AnalyzeRequestOptions, type TokenData } from '../lib/apiTypes';
import { protectAnalysisUrls } from '../utils/analysisUrls';
import { getApiEndpoint, getHeaders, isAbortError } from './request';
import { apiErrorFromResponse, InvalidResponseError } from '../utils/requestErrors';
import { parseAnalyzeResponseContent } from '../lib/apiResponse';
import { reconcileChunkReconstruction, formatChunkReasoning } from '../lib/analysisReconstruction';
import { splitJapaneseText, type JapaneseTextChunk } from '../utils/japaneseChunking';
import { readOpenAIContentStream } from './openaiStream';

const ANALYSIS_CHUNK_CONCURRENCY = 3;

// 分析单个语义块
async function analyzeSingleSentence(
  sentence: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  try {
    const protectedInput = protectAnalysisUrls(sentence);
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({ 
        sentence,
        ...getRequestProviderPayload(provider, model),
        thinkingEnabled: provider === 'deepseek' && options.deepseekThinkingEnabled === true,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error (Analysis):', errorData);
      throw apiErrorFromResponse(errorData, response.status);
    }
    
    const result = await response.json();

    if (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) {
      const reasoningContent = result.choices[0].message.reasoning_content;
      if (typeof reasoningContent === 'string' && reasoningContent) {
        options.onReasoning?.(reasoningContent, true);
      }
      const responseContent = result.choices[0].message.content;
      try {
        const tokens = parseAnalyzeResponseContent(protectedInput.restoreContent(responseContent));
        return reconcileChunkReconstruction({ text: sentence, start: 0, end: sentence.length, sentenceCount: 0, overLimit: false }, tokens, 0, 1);
      } catch (e) {
        console.error("Failed to parse JSON from analysis response:", e, responseContent);
        throw new InvalidResponseError('解析结果JSON格式错误');
      }
    } else {
      console.error('Unexpected API response structure (Analysis):', result);
      throw new InvalidResponseError('解析结果格式错误，请重试');
    }
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error;
    console.error('Error analyzing sentence:', error);
    throw error;
  }
}

// 分析日语文本；长文本按完整句子切块后顺序合并
export async function analyzeSentence(
  sentence: string,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<TokenData[]> {
  if (!sentence) {
    throw new Error('缺少句子');
  }

  const chunks = splitJapaneseText(sentence);
  if (chunks.length <= 1) {
    return analyzeSingleSentence(sentence, userApiKey, provider, model, options);
  }

  const mergedTokens: TokenData[] = [];
  const reasoningByChunk = Array<string>(chunks.length).fill('');

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const chunkTokens = await analyzeSingleSentence(
      chunk.text,
      userApiKey,
      provider,
      model,
      {
        ...options,
        onReasoning: options.onReasoning
          ? (text) => {
              reasoningByChunk[index] = text;
              options.onReasoning?.(
                formatChunkReasoning(reasoningByChunk, index),
                false
              );
            }
          : undefined,
      }
    );
    const reconciledTokens = reconcileChunkReconstruction(
      chunk,
      chunkTokens,
      index,
      chunks.length
    );
    mergedTokens.push(...reconciledTokens);
  }

  if (options.onReasoning && reasoningByChunk.some(Boolean)) {
    options.onReasoning(formatChunkReasoning(reasoningByChunk, chunks.length - 1), true);
  }

  return mergedTokens;
}

// 流式分析单个语义块
async function streamAnalyzeSingleSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<void> {
  if (!sentence) {
    onError(new Error('缺少句子'));
    return;
  }

  try {
    const protectedInput = protectAnalysisUrls(sentence);
    const apiUrl = getApiEndpoint('/analyze');
    const headers = getHeaders(userApiKey);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      signal: options.signal,
      body: JSON.stringify({ 
        sentence,
        ...getRequestProviderPayload(provider, model),
        thinkingEnabled: provider === 'deepseek' && options.deepseekThinkingEnabled === true,
        stream: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error (Stream Analysis):', errorData);
      onError(apiErrorFromResponse(errorData, response.status));
      return;
    }
    
    const parseContent = (content: string) => {
      const tokens = parseAnalyzeResponseContent(protectedInput.restoreContent(content));
      return reconcileChunkReconstruction({ text: sentence, start: 0, end: sentence.length, sentenceCount: 0, overLimit: false }, tokens, 0, 1);
    };
    await readOpenAIContentStream(response, (content, done) => {
      onChunk(done
        ? JSON.stringify({ tokens: parseContent(content) })
        : protectedInput.restoreContent(content), done);
    }, onError, {
      debounceMs: 40,
      signal: options.signal,
      parseWarning: 'Failed to parse streaming JSON chunk:',
      validateFinalContent: parseContent,
      invalidContentMessage: '句子解析结果没有完整生成，请重新解析。',
      completionLabel: '句子解析',
      onReasoning: options.onReasoning,
      onContentStart: options.onContentStart,
    });
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) return;
    console.error('Error in stream analyzing sentence:', error);
    onError(error instanceof Error ? error : new Error('未知错误'));
  }
}

async function streamAnalyzeChunk(
  chunk: JapaneseTextChunk,
  chunkIndex: number,
  chunkCount: number,
  onReasoning: ((text: string, done: boolean) => void) | undefined,
  userApiKey: string | undefined,
  provider: AIProvider,
  model: string | null | undefined,
  options: AnalyzeRequestOptions
): Promise<TokenData[]> {
  let finalTokens: TokenData[] | null = null;
  let streamError: Error | null = null;

  await streamAnalyzeSingleSentence(
    chunk.text,
    (content, isDone) => {
      if (isDone) finalTokens = parseAnalyzeResponseContent(content);
    },
    (error) => {
      streamError = error;
    },
    userApiKey,
    provider,
    model,
    {
      ...options,
      onReasoning,
    }
  );

  if (streamError) throw streamError;
  if (!finalTokens) {
    throw new InvalidResponseError(`第 ${chunkIndex + 1}/${chunkCount} 段没有返回完整解析结果，请重试。`);
  }

  return reconcileChunkReconstruction(chunk, finalTokens, chunkIndex, chunkCount);
}

// 流式分析日语文本；长文本保持完整句界，最多并行处理三个语义块
export async function streamAnalyzeSentence(
  sentence: string,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  userApiKey?: string,
  provider: AIProvider = DEFAULT_AI_PROVIDER,
  model?: string | null,
  options: AnalyzeRequestOptions = {}
): Promise<void> {
  if (!sentence) {
    onError(new Error('缺少句子'));
    return;
  }

  const chunks = splitJapaneseText(sentence);
  if (chunks.length <= 1) {
    await streamAnalyzeSingleSentence(
      sentence,
      onChunk,
      onError,
      userApiKey,
      provider,
      model,
      options
    );
    return;
  }

  const groupController = new AbortController();
  const requestOptions = { ...options, signal: options.signal
    ? AbortSignal.any([options.signal, groupController.signal]) : groupController.signal };
  const tokensByChunk = Array<TokenData[] | null>(chunks.length).fill(null);
  const reasoningByChunk = Array<string>(chunks.length).fill('');
  const reasoningDoneByChunk = Array<boolean>(chunks.length).fill(false);
  let nextChunkIndex = 0;
  let emittedChunkCount = 0;
  let emittedReasoningText = '';
  let emittedReasoningDone = false;
  let failed = false;

  const emitReasoning = () => {
    if (failed || !options.onReasoning) return;

    let includeThroughIndex = 0;
    while (
      includeThroughIndex < chunks.length - 1
      && reasoningDoneByChunk[includeThroughIndex]
    ) {
      includeThroughIndex += 1;
    }

    const text = formatChunkReasoning(reasoningByChunk, includeThroughIndex);
    const done = tokensByChunk.every(Boolean);
    if (!text || (text === emittedReasoningText && done === emittedReasoningDone)) return;

    emittedReasoningText = text;
    emittedReasoningDone = done;
    options.onReasoning(text, done);
  };

  const emitCompletedTokens = () => {
    if (failed) return;

    let contiguousChunkCount = 0;
    while (tokensByChunk[contiguousChunkCount]) contiguousChunkCount += 1;
    if (contiguousChunkCount === emittedChunkCount) return;

    emittedChunkCount = contiguousChunkCount;
    const mergedTokens = tokensByChunk
      .slice(0, contiguousChunkCount)
      .flatMap((tokens) => tokens ?? []);
    onChunk(
      JSON.stringify({ tokens: mergedTokens }),
      contiguousChunkCount === chunks.length
    );
  };

  const reportError = (error: unknown) => {
    if (failed || options.signal?.aborted) return;
    failed = true;
    groupController.abort();
    onError(error instanceof Error ? error : new Error('未知错误'));
  };

  const worker = async () => {
    while (!failed && !requestOptions.signal.aborted) {
      const chunkIndex = nextChunkIndex;
      if (chunkIndex >= chunks.length) return;
      nextChunkIndex += 1;

      try {
        const tokens = await streamAnalyzeChunk(
          chunks[chunkIndex],
          chunkIndex,
          chunks.length,
          options.onReasoning
            ? (text, done) => {
                if (failed || requestOptions.signal.aborted) return;
                reasoningByChunk[chunkIndex] = text;
                reasoningDoneByChunk[chunkIndex] = done;
                emitReasoning();
              }
            : undefined,
          userApiKey,
          provider,
          model,
          requestOptions
        );
        if (failed) return;
        tokensByChunk[chunkIndex] = tokens;
        reasoningDoneByChunk[chunkIndex] = true;
        emitCompletedTokens();
        emitReasoning();
      } catch (error) {
        reportError(error);
        return;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(ANALYSIS_CHUNK_CONCURRENCY, chunks.length) },
      () => worker()
    )
  );
}
