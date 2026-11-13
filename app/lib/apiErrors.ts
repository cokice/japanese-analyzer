/** Stable transport codes; human-readable messages are selected by the client. */
export const API_ERROR_MESSAGES = {
  INVALID_REQUEST: '请求参数无效，请检查后重试。',
  PAYLOAD_TOO_LARGE: '请求内容过大，请缩短文本或压缩图片。',
  MISSING_API_KEY: '未提供API密钥，请在设置中配置API密钥或联系管理员配置服务器密钥',
  INVALID_API_KEY: 'API 密钥无效，请在设置中检查。',
  AUTH_REQUIRED: '请先登录后再使用此功能。',
  AUTH_FAILED: '密码错误，请重试',
  RATE_LIMITED: '请求过于频繁，请稍后重试。',
  UPSTREAM_RATE_LIMITED: '模型服务额度不足或请求过多，请稍后重试。',
  UPSTREAM_TIMEOUT: '请求超时，请稍后重试。',
  UPSTREAM_ERROR: '模型服务暂时不可用，请稍后重试。',
  INVALID_RESPONSE: '返回的结果不完整，请重试。',
  SERVER_ERROR: '服务器暂时不可用，请稍后重试。',
  WEB_PAGE_UNAVAILABLE: '无法读取网页正文，请复制正文后粘贴。',
  NOT_FOUND: '此功能暂不可用。',
} as const;
export type ApiErrorCode = keyof typeof API_ERROR_MESSAGES;
export interface ApiErrorPayload { code: ApiErrorCode; params?: (string | number)[]; }
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(API_ERROR_MESSAGES, value);
}
