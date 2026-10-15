// 校验客户端提供的上游 base URL，防止把服务端当成跳板去打内网 / 云元数据。
// 仅放行 http(s)；默认拦截私有 / 环回 / 链路本地 / 保留网段以及 .local / .internal 主机名。
// 个人自托管可通过 ALLOW_PRIVATE_BASE_URL=true 放开内网访问。

export class BaseUrlError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BaseUrlError';
    this.status = status;
  }
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    if (!/^[0-9]+$/.test(part)) return NaN;
    const value = Number(part);
    if (value > 255) return NaN;
    return value;
  });
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

/** 判断 IPv4 是否落在私有 / 环回 / 链路本地 / 保留网段 */
export function isPrivateIpv4(ip: string): boolean {
  const nums = parseIpv4(ip);
  if (!nums) return false;
  const [a, b] = nums;
  if (a === 10) return true;                       // 10.0.0.0/8
  if (a === 127) return true;                      // 127.0.0.0/8
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGN
  if (a === 169 && b === 254) return true;         // 169.254.0.0/16 链路本地 + 云元数据
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 基准测试
  return false;
}

const PRIVATE_HOST_SUFFIXES = ['.local', '.internal', '.lan', '.home'];

function hostLooksPrivate(host: string): boolean {
  const lower = host.toLowerCase().replace(/\.+$/, '');
  if (lower === 'localhost') return true;
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  if (parseIpv4(lower)) return isPrivateIpv4(lower);
  // IPv6 字面量在 URL 里带中括号，如 [::1]
  const v6 = lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
  if (v6 === '::1') return true;            // 环回
  if (v6 === '::') return true;             // 未指定
  if (v6.startsWith('fe80')) return true;   // 链路本地
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // ULA
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
  return false;
}

/**
 * 校验上游 base URL。
 * - 必须为 http/https，且非空、可解析
 * - 默认拦截私有网段 / 元数据地址（ALLOW_PRIVATE_BASE_URL=true 时跳过该拦截）
 * 返回去尾部斜杠后的地址（不含 /chat/completions 拼接）。
 */
export function validateBaseUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new BaseUrlError('未提供模型服务地址，请在设置中填写 API 地址');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BaseUrlError('模型服务地址不是有效的 URL，请检查后重试');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BaseUrlError('模型服务地址仅支持 http 或 https');
  }

  const allowPrivate = process.env.ALLOW_PRIVATE_BASE_URL === 'true';
  if (!allowPrivate && hostLooksPrivate(url.hostname)) {
    throw new BaseUrlError('出于安全考虑，暂不支持内网或保留地址作为模型服务地址');
  }

  return value.replace(/\/+$/, '');
}
