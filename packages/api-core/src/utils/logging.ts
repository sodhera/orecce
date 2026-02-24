type LogLevel = "INFO" | "WARN" | "ERROR";

function serializeLogEntry(level: LogLevel, event: string, payload: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload
  });
}

function write(level: LogLevel, event: string, payload: Record<string, unknown>): void {
  const line = serializeLogEntry(level, event, payload);
  if (level === "ERROR") {
    console.error(line);
    return;
  }
  if (level === "WARN") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function logInfo(event: string, payload: Record<string, unknown> = {}): void {
  write("INFO", event, payload);
}

export function logWarn(event: string, payload: Record<string, unknown> = {}): void {
  write("WARN", event, payload);
}

export function logError(event: string, payload: Record<string, unknown> = {}): void {
  write("ERROR", event, payload);
}

export function redactSecret(rawValue: string, visiblePrefix = 7, visibleSuffix = 4): string {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }
  if (value.length <= visiblePrefix + visibleSuffix) {
    return "*".repeat(Math.max(4, value.length));
  }
  return `${value.slice(0, visiblePrefix)}...${value.slice(-visibleSuffix)}`;
}
