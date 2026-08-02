import 'server-only';

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DebugLogEntry, DebugLogInput } from '../types/debugLog';


const MEMORY_ENTRY_LIMIT = 1_000;
const FILE_SIZE_LIMIT_BYTES = 8 * 1024 * 1024;
const FILE_RETAIN_BYTES = 4 * 1024 * 1024;
const DEBUG_LOG_DIRECTORY = path.join(process.cwd(), '.codex-dev');
const DEBUG_LOG_FILE = path.join(DEBUG_LOG_DIRECTORY, 'app-debug.jsonl');

interface DebugLogState {
  entries: DebugLogEntry[];
  writeChain: Promise<void>;
}

const globalWithDebugLog = globalThis as typeof globalThis & {
  __japaneseAnalyzerDebugLog?: DebugLogState;
};

const state = globalWithDebugLog.__japaneseAnalyzerDebugLog ?? {
  entries: [],
  writeChain: Promise.resolve(),
};
globalWithDebugLog.__japaneseAnalyzerDebugLog = state;

export function isDebugLogViewerEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
    || process.env.ENABLE_DEBUG_LOG_VIEWER === 'true';
}

function makeSerializable(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  try {
    return JSON.parse(JSON.stringify(value, (_key, nestedValue) => (
      nestedValue instanceof Error
        ? { name: nestedValue.name, message: nestedValue.message, stack: nestedValue.stack }
        : nestedValue
    ))) as unknown;
  } catch {
    return String(value);
  }
}

async function rotateIfNeeded(): Promise<void> {
  try {
    const fileStat = await stat(DEBUG_LOG_FILE);
    if (fileStat.size <= FILE_SIZE_LIMIT_BYTES) return;
    const content = await readFile(DEBUG_LOG_FILE);
    const retained = content.subarray(Math.max(0, content.length - FILE_RETAIN_BYTES));
    const firstNewline = retained.indexOf(0x0a);
    await writeFile(
      DEBUG_LOG_FILE,
      firstNewline >= 0 ? retained.subarray(firstNewline + 1) : retained
    );
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? (error as NodeJS.ErrnoException).code
      : '';
    if (code !== 'ENOENT') throw error;
  }
}

function persistEntry(entry: DebugLogEntry): void {
  state.writeChain = state.writeChain
    .then(async () => {
      await mkdir(DEBUG_LOG_DIRECTORY, { recursive: true });
      await rotateIfNeeded();
      await appendFile(DEBUG_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    })
    .catch((error) => {
      console.error('写入开发日志失败:', error);
    });
}

export function writeDebugLog(input: DebugLogInput): DebugLogEntry | null {
  if (!isDebugLogViewerEnabled()) return null;
  const entry: DebugLogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    level: input.level ?? 'info',
    source: input.source ?? 'server',
    scope: input.scope,
    event: input.event,
    message: input.message,
    ...(input.data === undefined ? {} : { data: makeSerializable(input.data) }),
  };
  state.entries = [...state.entries, entry].slice(-MEMORY_ENTRY_LIMIT);
  persistEntry(entry);
  return entry;
}

async function readPersistedEntries(): Promise<DebugLogEntry[]> {
  await state.writeChain;
  try {
    const content = await readFile(DEBUG_LOG_FILE, 'utf8');
    return content
      .split(/\r?\n/u)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as DebugLogEntry];
        } catch {
          return [];
        }
      });
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? (error as NodeJS.ErrnoException).code
      : '';
    if (code === 'ENOENT') return [];
    throw error;
  }
}

export async function readDebugLogs(limit = 500): Promise<DebugLogEntry[]> {
  const persisted = await readPersistedEntries();
  const byId = new Map<string, DebugLogEntry>();
  [...persisted, ...state.entries].forEach((entry) => byId.set(entry.id, entry));
  return [...byId.values()]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, Math.max(1, Math.min(limit, 2_000)));
}

export async function clearDebugLogs(): Promise<void> {
  state.entries = [];
  await state.writeChain;
  await mkdir(DEBUG_LOG_DIRECTORY, { recursive: true });
  await writeFile(DEBUG_LOG_FILE, '', 'utf8');
}

export function getDebugLogFilePath(): string {
  return DEBUG_LOG_FILE;
}
