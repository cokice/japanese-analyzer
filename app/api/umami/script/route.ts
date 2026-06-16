import { NextResponse } from 'next/server';
import { buildUmamiLoaderScript, resolveUmamiConfig } from '../../_utils/umami';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const javascriptHeaders = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
};

export function GET() {
  return new NextResponse(
    buildUmamiLoaderScript(resolveUmamiConfig()),
    { headers: javascriptHeaders }
  );
}
