export type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DebugLogSource = 'server' | 'client';

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  level: DebugLogLevel;
  source: DebugLogSource;
  scope: string;
  event: string;
  message: string;
  data?: unknown;
}

export interface DebugLogInput {
  level?: DebugLogLevel;
  source?: DebugLogSource;
  scope: string;
  event: string;
  message: string;
  data?: unknown;
}
