import type { LogLevel } from '@repo/logging/shared';

// Pino-compatible numeric severities so emitted records map cleanly onto the
// shared sinks' level handling (OTLP severityNumber / Seq @l).
export const LOG_LEVEL_NUMBERS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export const isLevelEnabled = (level: LogLevel, threshold: LogLevel): boolean =>
  LOG_LEVEL_NUMBERS[level] >= LOG_LEVEL_NUMBERS[threshold];
