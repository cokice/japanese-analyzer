import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'ja_session';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const AUTH_TOKEN_VERSION = 'v1';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isAuthRequired(): boolean {
  return Boolean(process.env.CODE);
}

function getAuthSecret(): string {
  return process.env.CODE || '';
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAuthToken(now = Date.now()): string {
  const secret = getAuthSecret();
  if (!secret) return '';

  const payload = `${AUTH_TOKEN_VERSION}.${now}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

export function isValidAuthToken(token: string | undefined | null, now = Date.now()): boolean {
  const secret = getAuthSecret();
  if (!secret) return true;
  if (!token) return false;

  const [version, issuedAtText, signature, ...extra] = token.split('.');
  if (extra.length > 0 || version !== AUTH_TOKEN_VERSION || !issuedAtText || !signature) {
    return false;
  }

  const issuedAt = Number(issuedAtText);
  if (!Number.isFinite(issuedAt)) return false;
  if (issuedAt > now + MAX_CLOCK_SKEW_MS) return false;
  if (now - issuedAt > AUTH_COOKIE_MAX_AGE_SECONDS * 1000) return false;

  const expectedSignature = signPayload(`${version}.${issuedAtText}`, secret);
  return safeEqual(signature, expectedSignature);
}

export function hasValidAuthSession(req: NextRequest): boolean {
  return isValidAuthToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function setAuthCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createAuthToken(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
