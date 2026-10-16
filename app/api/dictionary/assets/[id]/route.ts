import { NextRequest } from 'next/server';
import { requireApiSession } from '../../../_utils/sessionAuth';
import { dictionaryStore } from '../../../_utils/dictionaryStore';

export const runtime = 'nodejs';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireApiSession(req); if (denied) return denied;
  const { id } = await context.params;
  if (!/^[a-f0-9]{64}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const asset = await dictionaryStore.asset(id);
    return new Response(new Uint8Array(asset.bytes), { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
