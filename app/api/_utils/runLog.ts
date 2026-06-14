import fs from 'fs';
import path from 'path';

const RUN_LOG_PATH = path.join(process.cwd(), 'run.log');

interface LogEntry {
  timestamp: string;
  endpoint: string;
  input: string;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export function writeRunLog(entry: Omit<LogEntry, 'timestamp'>): void {
  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  try {
    fs.appendFileSync(RUN_LOG_PATH, JSON.stringify(record) + '\n');
  } catch {
    console.error('Failed to write run.log');
  }
}
