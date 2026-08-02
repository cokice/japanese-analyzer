import { NextRequest, NextResponse } from 'next/server';
import { requireApiSession } from '../../_utils/sessionAuth';
import type { DebugLogLevel } from '../../../types/debugLog';
import {
  clearDebugLogs,
  getDebugLogFilePath,
  isDebugLogViewerEnabled,
  readDebugLogs,
  writeDebugLog,
} from '../../../utils/serverDebugLog';


export const runtime = 'nodejs';

const LOG_LEVELS = new Set<DebugLogLevel>(['debug', 'info', 'warn', 'error']);

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: { message: '开发日志查看器未启用' } },
    { status: 404 }
  );
}

export async function GET(req: NextRequest) {
  if (!isDebugLogViewerEnabled()) return unavailableResponse();
  const authError = requireApiSession(req);
  if (authError) return authError;

  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 500);
  const logs = await readDebugLogs(Number.isFinite(requestedLimit) ? requestedLimit : 500);
  if (req.nextUrl.searchParams.get('format') === 'jsonl') {
    return new NextResponse(logs.map((entry) => JSON.stringify(entry)).join('\n'), {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="japanese-analyzer-${Date.now()}.jsonl"`,
      },
    });
  }

  return NextResponse.json({
    logs,
    enabled: true,
    filePath: getDebugLogFilePath(),
  });
}

export async function POST(req: NextRequest) {
  if (!isDebugLogViewerEnabled()) return unavailableResponse();
  const authError = requireApiSession(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.scope !== 'string' || typeof body.message !== 'string') {
    return NextResponse.json(
      { error: { message: '日志必须包含 scope 和 message' } },
      { status: 400 }
    );
  }
  const level = typeof body.level === 'string' && LOG_LEVELS.has(body.level as DebugLogLevel)
    ? body.level as DebugLogLevel
    : 'info';
  const entry = writeDebugLog({
    level,
    source: 'client',
    scope: body.scope.slice(0, 80),
    event: typeof body.event === 'string' ? body.event.slice(0, 80) : 'client.event',
    message: body.message.slice(0, 500),
    data: body.data,
  });
  return NextResponse.json({ entry }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!isDebugLogViewerEnabled()) return unavailableResponse();
  const authError = requireApiSession(req);
  if (authError) return authError;
  await clearDebugLogs();
  writeDebugLog({
    level: 'warn',
    scope: 'debug.logs',
    event: 'logs.cleared',
    message: '开发日志已由查看器清空',
  });
  return NextResponse.json({ success: true });
}
