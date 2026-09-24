import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getJstDateKey, secondsUntilJstMidnight, type DailySentence } from '../../utils/dailySentences';
import { DailySentenceUnavailableError, generateDailySentence } from '../_utils/dailySentence';
import { requireApiSession } from '../_utils/sessionAuth';

export const dynamic = 'force-dynamic';

// 同一实例内并发请求共用一次生成；跨实例/重启由 Next 数据缓存保证一天只生成一次
const inflight = new Map<string, Promise<DailySentence>>();

function getDailySentence(dateKey: string): Promise<DailySentence> {
  const existing = inflight.get(dateKey);
  if (existing) return existing;

  const cached = unstable_cache(
    () => generateDailySentence(dateKey),
    ['daily-sentence', 'v1', dateKey],
    { revalidate: 60 * 60 * 30 },
  );
  const promise = cached().finally(() => {
    // 成功结果已进数据缓存；失败时不留在内存里，下次请求重新生成
    inflight.delete(dateKey);
  });
  inflight.set(dateKey, promise);
  return promise;
}

export async function GET(req: NextRequest) {
  const authError = requireApiSession(req);
  if (authError) return authError;

  const dateKey = getJstDateKey();
  try {
    const sentence = await getDailySentence(dateKey);
    return NextResponse.json(sentence, {
      headers: { 'Cache-Control': `private, max-age=${secondsUntilJstMidnight()}` },
    });
  } catch (error) {
    // 前端收到非 200 时会改用内置备用句
    if (!(error instanceof DailySentenceUnavailableError)) console.error('Daily sentence error:', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : '今日一句生成失败' } },
      { status: 503 },
    );
  }
}
