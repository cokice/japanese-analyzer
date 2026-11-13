import { NextResponse } from 'next/server';
import type { ApiErrorCode } from '../../lib/apiErrors';

export function apiErrorResponse(code: ApiErrorCode, status: number, params?: (string | number)[], headers?: HeadersInit) {
  return NextResponse.json({ error: { code, ...(params?.length ? { params } : {}) } }, { status, headers });
}

export function upstreamErrorResponse(status: number) {
  return apiErrorResponse(status === 401 ? 'INVALID_API_KEY' : status === 429 ? 'UPSTREAM_RATE_LIMITED'
    : status === 504 ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', status);
}
