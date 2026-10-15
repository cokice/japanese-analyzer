// 模型服务的通用类型与预设。任意 OpenAI 兼容厂商都以「base URL + 模型名 + 密钥」描述，
// 不再用固定的厂商枚举。能力位（caps）告诉服务端按哪种结构化输出 / 思考参数调用上游。

/** 上游能力的开关，决定请求体里附加哪些字段 */
export interface ProviderCaps {
  /** true=用 json_schema strict（默认）；false=降级为 json_object（部分网关只认后者） */
  jsonSchema?: boolean;
  /** 该厂商支持 DeepSeek 风格的 thinking / reasoning_effort 参数 */
  thinking?: boolean;
}

/** 每次请求要发给服务端的最小端点信息（apiKey 走 Authorization: Bearer，不在此列） */
export interface ModelEndpoint {
  baseUrl: string;
  model: string;
}

/** 浏览器里持久化的一个模型服务配置 */
export interface ProviderProfile {
  /** 稳定标识：预设 id（如 'deepseek'）或自定义 slug */
  id: string;
  /** 展示名称 */
  name: string;
  /** 例如 https://api.deepseek.com 或 https://api.openai.com/v1 */
  baseUrl: string;
  /** 用户自己的 API 密钥，随请求以 Bearer 发送 */
  apiKey: string;
  /** 任意模型名，例如 deepseek-chat / gpt-4o-mini */
  model: string;
  caps?: ProviderCaps;
}

export type ProviderPreset = Pick<ProviderProfile, 'id' | 'name' | 'baseUrl' | 'model' | 'caps'>;

/** 前端「从预设创建」时的便利选项；密钥仍由用户自己填 */
export const PRESETS: readonly ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', caps: { jsonSchema: false, thinking: true } },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', caps: {} },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', caps: {} },
];

/** 归一化上游端点：始终以 /chat/completions 结尾（与 OpenAI 兼容接口一致） */
export function normalizeEndpointUrl(baseUrl: string): string {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** 程序化调用（如测试、无显式配置时）的兜底端点；真实客户端总会传入自己的端点 */
export const DEFAULT_ENDPOINT: ModelEndpoint = { baseUrl: '', model: '' };

/** 为自定义服务生成一个稳定的本地 id（仅客户端使用） */
export function createCustomProfileId(prefix = 'custom'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 把一个未知来源的 profile 数组清洗成合法结构，过滤缺字段的条目 */
export function sanitizeProfiles(raw: unknown): ProviderProfile[] {
  if (!Array.isArray(raw)) return [];
  const profiles: ProviderProfile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
    const baseUrl = typeof item.baseUrl === 'string' ? item.baseUrl.trim() : '';
    const model = typeof item.model === 'string' ? item.model.trim() : '';
    if (!baseUrl || !model) continue;
    const caps = item.caps && typeof item.caps === 'object' ? (item.caps as ProviderCaps) : {};
    profiles.push({
      id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id,
      baseUrl,
      apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
      model,
      caps,
    });
  }
  return profiles;
}
