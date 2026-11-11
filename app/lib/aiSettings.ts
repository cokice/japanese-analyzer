import { type StorageLike, type StoredAISettings } from './apiTypes';
import { DEEPSEEK_THINKING_AVAILABLE, normalizeAIProvider, normalizeAIModel } from './aiModels';

export function loadAISettingsFromStorage(storage: StorageLike, thinkingAvailable = DEEPSEEK_THINKING_AVAILABLE): StoredAISettings {
  const legacyApiKey = storage.getItem('userApiKey') || '';

  let geminiApiKey = storage.getItem('geminiApiKey');
  if (geminiApiKey === null && legacyApiKey) {
    geminiApiKey = legacyApiKey;
    storage.setItem('geminiApiKey', legacyApiKey);
  }

  const aiProvider = normalizeAIProvider(storage.getItem('aiProvider'));

  return {
    aiProvider,
    aiModel: normalizeAIModel(aiProvider, storage.getItem('aiModel')),
    geminiApiKey: geminiApiKey || '',
    deepseekApiKey: storage.getItem('deepseekApiKey') || '',
    deepseekThinkingEnabled: thinkingAvailable && storage.getItem('deepseekThinkingEnabled') === 'true',
  };
}
