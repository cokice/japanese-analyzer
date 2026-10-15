// 已知厂商 id → 本地静态 logo 路径的映射。
// 新增厂商时：把 SVG 放进 public/icons/providers/{id}.svg 并在此登记即可，ProviderLogo 自动识别。
export const PROVIDER_ICONS: Record<string, string> = {
  deepseek: '/icons/providers/deepseek.svg',
  openai: '/icons/providers/openai.svg',
  openrouter: '/icons/providers/openrouter.svg',
  qwen: '/icons/providers/qwen.svg',
  moonshot: '/icons/providers/moonshot.svg',
  zhipu: '/icons/providers/zhipu.svg',
  siliconflow: '/icons/providers/siliconflow.svg',
  volcengine: '/icons/providers/volcengine.svg',
  gemini: '/icons/providers/gemini.svg',
  groq: '/icons/providers/groq.svg',
  mistral: '/icons/providers/mistral.svg',
};
