import { NextRequest, NextResponse } from 'next/server';
import { getSingleWebUrl } from '../../lib/webUrl';
import { apiErrorResponse, upstreamErrorResponse } from '../_utils/apiErrorResponse';
import { readJsonBody, requestBodyErrorResponse } from '../_utils/requestBody';
import { requireApiSession } from '../_utils/sessionAuth';
import { reserveServerKeyRequest, serverKeyRateLimitResponse } from '../_utils/serverKeyRateLimit';
import { createUpstreamSignal, isUpstreamTimeoutError } from '../_utils/requestTimeout';

export async function POST(req: NextRequest) {
  try {
    const authError = requireApiSession(req);
    if (authError) return authError;
    const body = await readJsonBody(req);
    const url = getSingleWebUrl(body.url);
    if (!url) return apiErrorResponse('INVALID_REQUEST', 400);
    const apiKey = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return apiErrorResponse('MISSING_API_KEY', 500);
    reserveServerKeyRequest(req);

    // The target page is fetched by DeepSeek; our server only contacts this fixed endpoint.
    const response = await fetch('https://api.deepseek.com/v1/tools/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url }),
      signal: AbortSignal.any([req.signal, createUpstreamSignal()!]),
    });
    if (response.status === 403 || response.status === 404) return apiErrorResponse('WEB_PAGE_UNAVAILABLE', 422);
    if (!response.ok) return upstreamErrorResponse(response.status);
    let page: unknown;
    try { page = await response.json(); }
    catch (error) {
      if (req.signal.aborted || isUpstreamTimeoutError(error)) throw error;
      return apiErrorResponse('INVALID_RESPONSE', 502);
    }
    if (!page || typeof page !== 'object' || !('content' in page) || typeof page.content !== 'string') {
      return apiErrorResponse('INVALID_RESPONSE', 502);
    }
    if (!page.content.trim()) return apiErrorResponse('WEB_PAGE_UNAVAILABLE', 422);
    return NextResponse.json({
      title: 'title' in page && typeof page.title === 'string' ? page.title : '',
      content: page.content,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = requestBodyErrorResponse(error) || serverKeyRateLimitResponse(error);
    if (known) return known;
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (isUpstreamTimeoutError(error)) return apiErrorResponse('UPSTREAM_TIMEOUT', 504);
    return apiErrorResponse('SERVER_ERROR', 500);
  }
}
