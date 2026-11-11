import { isRecord, getFinishReasonErrorMessage } from '../lib/apiResponse';
import { apiErrorFromResponse, InvalidResponseError } from '../utils/requestErrors';

function getMessageFromUnknownStreamError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  if ('error' in value) {
    const error = value.error;
    if (typeof error === 'string') return error;
    if (isRecord(error) && typeof error.code === 'string') return apiErrorFromResponse({ error }, 502).message;
    if (isRecord(error) && typeof error.message === 'string') return error.message;
  }

  if (typeof value.message === 'string') return value.message;
  return undefined;
}

function getStreamEventFromData(
  data: string,
  parseWarning: string
): {
  content: string;
  reasoningContent: string;
  finishReason: string | null;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(data) as unknown;
    const errorMessage = getMessageFromUnknownStreamError(parsed);
    if (errorMessage) {
      return { content: '', reasoningContent: '', finishReason: null, errorMessage };
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return { content: '', reasoningContent: '', finishReason: null };
    }

    const firstChoice = parsed.choices[0];
    if (!isRecord(firstChoice)) {
      return { content: '', reasoningContent: '', finishReason: null };
    }

    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : null;
    const message = isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = typeof delta?.content === 'string'
      ? delta.content
      : typeof message?.content === 'string'
        ? message.content
        : '';
    const reasoningContent = typeof delta?.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof message?.reasoning_content === 'string'
        ? message.reasoning_content
        : '';
    const finishReason = typeof firstChoice.finish_reason === 'string'
      ? firstChoice.finish_reason
      : null;

    return { content, reasoningContent, finishReason };
  } catch (error) {
    console.warn(parseWarning, error, data);
    return { content: '', reasoningContent: '', finishReason: null };
  }
}

export async function readOpenAIContentStream(
  response: Response,
  onChunk: (chunk: string, isDone: boolean) => void,
  onError: (error: Error) => void,
  options: {
    signal?: AbortSignal;
    debounceMs?: number;
    parseWarning?: string;
    validateFinalContent?: (content: string) => unknown;
    invalidContentMessage?: string;
    completionLabel?: string;
    onReasoning?: (text: string, done: boolean) => void;
    onContentStart?: () => void;
    reasoningDebounceMs?: number;
  } = {}
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError(new InvalidResponseError('无法创建流式读取器'));
    return;
  }

  const decoder = new TextDecoder();
  const debounceMs = options.debounceMs ?? 16;
  const parseWarning = options.parseWarning ?? 'Failed to parse streaming JSON chunk:';
  const completionLabel = options.completionLabel ?? '流式响应';
  const reasoningDebounceMs = options.reasoningDebounceMs ?? 32;
  let buffer = '';
  let rawContent = '';
  let rawReasoningContent = '';
  let terminalError: Error | null = null;
  let hasTerminalSignal = false;
  let hasContentStarted = false;
  let updateTimeout: ReturnType<typeof setTimeout> | null = null;
  let reasoningUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
  let hasEmitted = false;

  const clearPendingUpdate = () => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
      updateTimeout = null;
    }
  };

  const clearPendingReasoningUpdate = () => {
    if (reasoningUpdateTimeout) {
      clearTimeout(reasoningUpdateTimeout);
      reasoningUpdateTimeout = null;
    }
  };

  const emitReasoning = (isComplete: boolean) => {
    if (options.signal?.aborted) return;
    if (!rawReasoningContent || !options.onReasoning) return;

    if (isComplete) {
      clearPendingReasoningUpdate();
      options.onReasoning(rawReasoningContent, true);
      return;
    }

    if (reasoningDebounceMs <= 0) {
      options.onReasoning(rawReasoningContent, false);
      return;
    }

    if (reasoningUpdateTimeout) return;
    reasoningUpdateTimeout = setTimeout(() => {
      reasoningUpdateTimeout = null;
      options.onReasoning?.(rawReasoningContent, false);
    }, reasoningDebounceMs);
  };

  const emit = (content: string, isComplete: boolean) => {
    if (options.signal?.aborted) return;

    if (isComplete) {
      clearPendingUpdate();
      onChunk(content, true);
      return;
    }

    if (debounceMs <= 0 || !hasEmitted) {
      hasEmitted = true;
      onChunk(content, false);
      return;
    }

    if (updateTimeout) return;
    updateTimeout = setTimeout(() => {
      updateTimeout = null;
      if (!options.signal?.aborted) onChunk(rawContent, false);
    }, debounceMs);
  };

  const fail = (error: Error): boolean => {
    if (options.signal?.aborted) return true;
    clearPendingUpdate();
    if (rawContent) {
      onChunk(rawContent, false);
    }
    if (rawReasoningContent) {
      emitReasoning(true);
    }
    onError(error);
    return true;
  };

  const complete = (): boolean => {
    if (options.signal?.aborted) return true;
    clearPendingUpdate();

    if (terminalError) {
      return fail(terminalError);
    }

    if (options.validateFinalContent) {
      try {
        options.validateFinalContent(rawContent);
      } catch {
        return fail(new InvalidResponseError(
          options.invalidContentMessage || `${completionLabel}没有完整生成，请重新生成。`
        ));
      }
    }

    if (rawReasoningContent) {
      emitReasoning(true);
    }
    emit(rawContent, true);
    return true;
  };

  const handleData = (data: string): boolean => {
    if (options.signal?.aborted) return true;
    if (data === '[DONE]') {
      hasTerminalSignal = true;
      return complete();
    }

    const {
      content,
      reasoningContent,
      finishReason,
      errorMessage,
    } = getStreamEventFromData(data, parseWarning);
    if (errorMessage) {
      return fail(new Error(errorMessage));
    }

    if (content) {
      if (!hasContentStarted) {
        hasContentStarted = true;
        options.onContentStart?.();
      }
      rawContent += content;
      emit(rawContent, false);
    }

    if (reasoningContent) {
      rawReasoningContent += reasoningContent;
      emitReasoning(false);
    }

    if (finishReason) {
      hasTerminalSignal = true;
      if (finishReason.toLowerCase() !== 'stop') {
        terminalError = new InvalidResponseError(getFinishReasonErrorMessage(finishReason, completionLabel));
        return fail(terminalError);
      }
    }

    return false;
  };

  const abort = () => {
    clearPendingUpdate();
    clearPendingReasoningUpdate();
    void reader.cancel().catch(() => {});
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    if (options.signal?.aborted) { abort(); return; }
    while (true) {
      const { value, done } = await reader.read();
      if (options.signal?.aborted) return;
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

    buffer += decoder.decode();
    if (buffer.trim() !== '') {
      const trimmedBuffer = buffer.trim();
      if (trimmedBuffer.startsWith('data:')) {
        const data = trimmedBuffer.substring(5).trimStart();
        if (handleData(data)) return;
      }
    }

    if (!hasTerminalSignal && options.validateFinalContent) {
      fail(new InvalidResponseError(`${completionLabel}连接已结束，但没有收到完整结束信号，请重新生成。`));
      return;
    }

    complete();
  } catch (error) {
    if (!options.signal?.aborted) throw error;
  } finally {
    clearPendingUpdate();
    clearPendingReasoningUpdate();
    options.signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
