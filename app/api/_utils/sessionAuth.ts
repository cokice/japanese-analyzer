import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'ja_session';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// v1 用 CODE 签名、payload 可预测，已废弃；旧 Cookie 一律视为无效，重新登录即可。
const AUTH_TOKEN_VERSION = 'v2';
const AUTH_TOKEN_TTL_MS = AUTH_COOKIE_MAX_AGE_SECONDS * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// 未设置 SESSION_SECRET 时，进程启动后随机生成一次，重启后旧 session 全部失效。
// 多实例部署（多副本、Vercel 等 Serverless）每个实例生成的值不同，必须显式设置 SESSION_SECRET。
// 挂在 globalThis 上，确保同一进程里不同路由的打包副本共用同一个密钥。
const GENERATED_SECRET_KEY = Symbol.for('japanese-analyzer.generatedSessionSecret');
type GlobalWithSessionSecret = typeof globalThis & { [GENERATED_SECRET_KEY]?: Buffer };

export function isAuthRequired(): boolean {
  return Boolean(process.env.CODE);
}

/** 是否显式设置了 SESSION_SECRET（启动日志用） */
export function hasConfiguredSessionSecret(): boolean {
  return Boolean(process.env.SESSION_SECRET);
}

// 签名密钥与访问密码 CODE 完全独立，不能从 CODE 派生。
function getSessionSecret(): Buffer {
  const configured = process.env.SESSION_SECRET;
  if (configured) return Buffer.from(configured);

  const globalScope = globalThis as GlobalWithSessionSecret;
  globalScope[GENERATED_SECRET_KEY] ??= randomBytes(32);
  return globalScope[GENERATED_SECRET_KEY];
}

/** 启动时生成随机签名密钥（已设置 SESSION_SECRET 时什么也不做） */
export function initSessionSecret(): void {
  getSessionSecret();
}

function signPayload(payload: string): Buffer {
  return createHmac('sha256', getSessionSecret()).update(payload).digest();
}

export function createAuthToken(now = Date.now()): string {
  if (!isAuthRequired()) return '';

  const expiresAt = now + AUTH_TOKEN_TTL_MS;
  const nonce = randomBytes(16).toString('base64url');
  const payload = `${AUTH_TOKEN_VERSION}.${expiresAt}.${nonce}`;
  return `${payload}.${signPayload(payload).toString('base64url')}`;
}

export function isValidAuthToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!isAuthRequired()) return true;
  if (!token) return false;

  const [version, expiresAtText, nonce, signature, ...extra] = token.split('.');
  if (
    extra.length > 0
    || version !== AUTH_TOKEN_VERSION
    || !/^\d{1,16}$/.test(expiresAtText ?? '')
    || !NONCE_PATTERN.test(nonce ?? '')
    || !SIGNATURE_PATTERN.test(signature ?? '')
  ) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  if (now >= expiresAt) return false;
  // 有效期不可能超过签发时的 TTL；超出说明签发方时钟异常，按无效处理。
  if (expiresAt > now + AUTH_TOKEN_TTL_MS + MAX_CLOCK_SKEW_MS) return false;

  const expected = signPayload(`${version}.${expiresAtText}.${nonce}`);
  const actual = Buffer.from(signature, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hasValidAuthSession(req: NextRequest): boolean {
  return isValidAuthToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function setAuthCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createAuthToken(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_COOKIE_SECURE === 'true'
      || (process.env.AUTH_COOKIE_SECURE !== 'false' && request.nextUrl.protocol === 'https:'),
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function requireApiSession(req: NextRequest): NextResponse | null {
  if (hasValidAuthSession(req)) return null;

  return NextResponse.json(
    { error: { message: '请先通过密码验证' } },
    { status: 401 }
  );
}
