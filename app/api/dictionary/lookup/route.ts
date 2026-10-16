import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, requestBodyErrorResponse } from '../../_utils/requestBody';
import { requireApiSession } from '../../_utils/sessionAuth';
import { lookupDictionary } from '../../_utils/dictionaryProvider';
import { DictionaryUnavailableError } from '../../_utils/dictionaryStore';
import type { DictionaryProvider } from '../../../lib/dictionary';
import { normalizeLocale } from '../../../i18n';

export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const denied = requireApiSession(req); if (denied) return denied;
  try {
    const { query, dictionaryForm, reading, offset = 0, provider: rawProvider, test = false } = await readJsonBody(req);
    const optionalText = (v: unknown): v is string | undefined => v === undefined || typeof v === 'string' && [...v].length <= 120;
    const provider = rawProvider as DictionaryProvider | undefined;
    if (typeof query !== 'string' || !query.trim() || [...query].length > 120 || !optionalText(dictionaryForm) || !optionalText(reading) || typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > 10_000 || provider !== undefined && (!provider || !['builtin', 'http-v1'].includes(provider.adapter) || typeof provider.name !== 'string' || provider.apiKey !== undefined && (typeof provider.apiKey !== 'string' || /[\r\n]/.test(provider.apiKey)))) return NextResponse.json({ error: { message: '词典查询参数无效' } }, { status: 400 });
    return NextResponse.json(await lookupDictionary({ query, dictionaryForm, reading, offset, locale: normalizeLocale(req.headers.get('X-App-Locale')) }, provider, req.signal, test === true), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const body = requestBodyErrorResponse(error); if (body) return body;
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return NextResponse.json({ error: { message: error instanceof DictionaryUnavailableError ? error.message : '外部词典连接失败' } }, { status: 503 });
  }
}
