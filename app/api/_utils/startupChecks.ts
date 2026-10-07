import { hasAnyServerApiKey, isPublicServerKeyAllowed } from './providerConfig';
import { hasConfiguredSessionSecret, initSessionSecret, isAuthRequired } from './sessionAuth';

const BANNER = '='.repeat(72);

function printBlock(log: (message: string) => void, lines: string[]): void {
  log([BANNER, ...lines, BANNER].join('\n'));
}

/** 服务启动时检查与安全相关的配置，并在日志里写明风险和解决办法 */
export function runStartupSecurityChecks(): void {
  const authRequired = isAuthRequired();

  if (isPublicServerKeyAllowed()) {
    printBlock(console.warn, authRequired
      ? [
        '[安全警告] ALLOW_PUBLIC_SERVER_KEY=true。',
        '当前已设置 CODE，访问仍需密码；但一旦清空 CODE，任何人都能直接消耗服务器 API 密钥。',
      ]
      : [
        '[安全警告] ALLOW_PUBLIC_SERVER_KEY=true 且未设置 CODE：',
        '任何能访问本站的人都可以直接消耗服务器上配置的 API 密钥，应用本身不做限流。',
        '仅在个人或内网环境使用；公开部署请改为设置 CODE，',
        '并在 AI 服务商后台设置用量或预算上限。',
      ]);
  } else if (!authRequired && hasAnyServerApiKey()) {
    printBlock(console.warn, [
      '[提示] 未设置 CODE，已禁止匿名请求使用服务器 API 密钥：',
      '没有在「设置」中填写个人 API 密钥的请求会直接被拒绝。',
      '解决办法（二选一）：',
      '  1. 设置 CODE 开启访问密码，登录后的用户可以使用服务器密钥；',
      '  2. 设置 ALLOW_PUBLIC_SERVER_KEY=true 允许公开使用服务器密钥（仅限个人或内网使用）。',
    ]);
  }

  if (authRequired) {
    initSessionSecret();
    if (!hasConfiguredSessionSecret()) {
      console.warn(
        '[提示] 未设置 SESSION_SECRET，已随机生成会话签名密钥；服务重启后需要重新登录。'
        + '多实例部署（多副本、Vercel 等 Serverless）必须显式设置同一个 SESSION_SECRET，否则登录状态会在实例间失效。'
      );
    }
  }
}
