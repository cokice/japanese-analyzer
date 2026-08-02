import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDebugLogViewerEnabled } from '../../utils/serverDebugLog';
import DebugLogViewer from './DebugLogViewer';


export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '开发日志 · 日本語文章解析器',
  description: '本地开发环境的详细运行日志查看器',
};

export default function DebugLogsPage() {
  if (!isDebugLogViewerEnabled()) notFound();
  return <DebugLogViewer />;
}
