'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DebugLogEntry, DebugLogLevel } from '../../types/debugLog';


interface DebugLogResponse {
  logs: DebugLogEntry[];
  enabled: boolean;
  filePath: string;
}

const LEVELS: Array<{ value: 'all' | DebugLogLevel; label: string }> = [
  { value: 'all', label: '全部级别' },
  { value: 'debug', label: 'DEBUG' },
  { value: 'info', label: 'INFO' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
];

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(timestamp));
}

function entryText(entry: DebugLogEntry): string {
  return [
    entry.timestamp,
    entry.level,
    entry.source,
    entry.scope,
    entry.event,
    entry.message,
    entry.data === undefined ? '' : JSON.stringify(entry.data),
  ].join(' ').toLocaleLowerCase();
}

function serializeEntry(entry: DebugLogEntry): string {
  return JSON.stringify(entry, null, 2);
}

export default function DebugLogViewer() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [filePath, setFilePath] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<'all' | DebugLogLevel>('all');
  const [scope, setScope] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedId, setCopiedId] = useState('');

  const loadLogs = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/debug/logs?limit=1000', { cache: 'no-store' });
      const data = await response.json() as DebugLogResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || '读取开发日志失败');
      setLogs(data.logs);
      setFilePath(data.filePath);
      setLastUpdated(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取开发日志失败');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void loadLogs(true), 3_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadLogs]);

  const scopes = useMemo(() => (
    [...new Set(logs.map((entry) => entry.scope))].sort()
  ), [logs]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return logs.filter((entry) => (
      (level === 'all' || entry.level === level)
      && (scope === 'all' || entry.scope === scope)
      && (!normalizedQuery || entryText(entry).includes(normalizedQuery))
    ));
  }, [level, logs, query, scope]);

  const levelCounts = useMemo(() => logs.reduce<Record<DebugLogLevel, number>>(
    (counts, entry) => ({ ...counts, [entry.level]: counts[entry.level] + 1 }),
    { debug: 0, info: 0, warn: 0, error: 0 }
  ), [logs]);

  const copyEntry = async (entry: DebugLogEntry) => {
    await navigator.clipboard.writeText(serializeEntry(entry));
    setCopiedId(entry.id);
    window.setTimeout(() => setCopiedId(''), 1_200);
  };

  const clearLogs = async () => {
    if (!window.confirm('确定清空本地开发日志吗？此操作无法撤销。')) return;
    const response = await fetch('/api/debug/logs', { method: 'DELETE' });
    if (!response.ok) {
      setError('清空日志失败');
      return;
    }
    await loadLogs();
  };

  return (
    <main className="debug-log-page" lang="zh-CN">
      <header className="debug-log-masthead">
        <div className="debug-log-brand">
          <span className="debug-log-seal" aria-hidden="true">誌</span>
          <div>
            <p className="debug-log-kicker">DEVELOPMENT LEDGER</p>
            <h1>开发日誌</h1>
          </div>
        </div>
        <div className="debug-log-head-actions">
          <Link href="/" className="debug-log-text-link">← 返回解析器</Link>
          <button type="button" onClick={() => void loadLogs()} disabled={loading}>
            {loading ? '读取中…' : '立即刷新'}
          </button>
        </div>
      </header>

      <section className="debug-log-notice">
        <span className="debug-log-notice-mark">内</span>
        <div>
          <strong>仅供本地排查</strong>
          <p>日志可能包含用户原文、完整提示词和模型响应。生产环境默认关闭，请勿直接对外分享。</p>
        </div>
      </section>

      <section className="debug-log-stats" aria-label="日志统计">
        <div><span>总记录</span><strong>{logs.length}</strong></div>
        <div><span>警告</span><strong>{levelCounts.warn}</strong></div>
        <div><span>错误</span><strong>{levelCounts.error}</strong></div>
        <div><span>当前显示</span><strong>{filteredLogs.length}</strong></div>
      </section>

      <section className="debug-log-toolbar" aria-label="日志筛选">
        <label className="debug-log-search">
          <span>检索</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索消息、事件、payload…"
          />
        </label>
        <label>
          <span>级别</span>
          <select value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>
            {LEVELS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>来源</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="all">全部来源</option>
            {scopes.map((scopeOption) => (
              <option key={scopeOption} value={scopeOption}>{scopeOption}</option>
            ))}
          </select>
        </label>
        <label className="debug-log-auto-refresh">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          <span>每 3 秒刷新</span>
        </label>
        <a className="debug-log-tool-action" href="/api/debug/logs?limit=2000&format=jsonl">
          下载 JSONL
        </a>
        <button type="button" className="is-danger" onClick={() => void clearLogs()}>
          清空
        </button>
      </section>

      <div className="debug-log-file-row">
        <span>持久化文件</span>
        <code>{filePath || '尚未建立'}</code>
        <span className="debug-log-updated">
          {lastUpdated ? `更新于 ${lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })}` : ''}
        </span>
      </div>

      {error && <div className="debug-log-error" role="alert">{error}</div>}

      <section className="debug-log-list" aria-live="polite" aria-busy={loading}>
        {!loading && filteredLogs.length === 0 ? (
          <div className="debug-log-empty">
            <strong>尚无匹配日志</strong>
            <span>执行一次解析或调整筛选条件后，这里会出现详细记录。</span>
          </div>
        ) : filteredLogs.map((entry) => (
          <details key={entry.id} className={`debug-log-entry is-${entry.level}`}>
            <summary>
              <span className="debug-log-level">{entry.level.toUpperCase()}</span>
              <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
              <span className="debug-log-scope">{entry.scope}</span>
              <span className="debug-log-message">{entry.message}</span>
              <span className="debug-log-expand">詳細</span>
            </summary>
            <div className="debug-log-entry-body">
              <dl>
                <div><dt>事件</dt><dd>{entry.event}</dd></div>
                <div><dt>来源</dt><dd>{entry.source}</dd></div>
                <div><dt>时间</dt><dd>{entry.timestamp}</dd></div>
                <div><dt>ID</dt><dd>{entry.id}</dd></div>
              </dl>
              <div className="debug-log-json-head">
                <span>完整记录</span>
                <button type="button" onClick={() => void copyEntry(entry)}>
                  {copiedId === entry.id ? '已复制' : '复制 JSON'}
                </button>
              </div>
              <pre>{serializeEntry(entry)}</pre>
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
