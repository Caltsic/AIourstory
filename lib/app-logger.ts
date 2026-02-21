import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_LOG_STORAGE_KEY = "app_logs_v1";
const APP_LOG_LIMIT = 400;
const FLUSH_DEBOUNCE_MS = 800;

export type AppLogLevel = "info" | "warn" | "error";

export interface AppLogEntry {
  id: string;
  ts: string;
  level: AppLogLevel;
  tag: string;
  message: string;
}

const rawConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let initialized = false;
let captureInstalled = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writeInProgress = false;
let pending: AppLogEntry[] = [];
let internalWrite = false;

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message || String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toMessage(args: unknown[]): string {
  return args.map((item) => safeStringify(item)).join(" ");
}

async function readStoredLogs(): Promise<AppLogEntry[]> {
  const raw = await AsyncStorage.getItem(APP_LOG_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AppLogEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function enqueue(entry: AppLogEntry) {
  pending.push(entry);
  if (pending.length >= 20) {
    void flushLogs();
    return;
  }

  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushLogs();
    }, FLUSH_DEBOUNCE_MS);
  }
}

async function flushLogs() {
  if (writeInProgress || pending.length === 0) return;
  writeInProgress = true;
  internalWrite = true;
  try {
    const newItems = pending.splice(0, pending.length);
    const stored = await readStoredLogs();
    const merged = [...stored, ...newItems];
    const trimmed = merged.length > APP_LOG_LIMIT ? merged.slice(-APP_LOG_LIMIT) : merged;
    await AsyncStorage.setItem(APP_LOG_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    rawConsole.warn("[app-logger] flush failed:", error);
  } finally {
    internalWrite = false;
    writeInProgress = false;
    if (pending.length > 0) {
      void flushLogs();
    }
  }
}

function push(level: AppLogLevel, tag: string, message: string) {
  enqueue({
    id: makeId(),
    ts: nowIso(),
    level,
    tag,
    message,
  });
}

function installConsoleCapture() {
  if (captureInstalled) return;
  captureInstalled = true;

  console.log = (...args: unknown[]) => {
    rawConsole.log(...args);
    if (!internalWrite) push("info", "console", toMessage(args));
  };

  console.warn = (...args: unknown[]) => {
    rawConsole.warn(...args);
    if (!internalWrite) push("warn", "console", toMessage(args));
  };

  console.error = (...args: unknown[]) => {
    rawConsole.error(...args);
    if (!internalWrite) push("error", "console", toMessage(args));
  };
}

function installGlobalErrorCapture() {
  const maybeGlobal = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };
  const errorUtils = maybeGlobal.ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previousHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    push(
      "error",
      "global",
      `[fatal=${Boolean(isFatal)}] ${safeStringify(error)}`
    );
    previousHandler?.(error, isFatal);
  });
}

export function initAppLogger() {
  if (initialized) return;
  initialized = true;

  installConsoleCapture();
  installGlobalErrorCapture();
  push("info", "logger", "App logger initialized");
}

export function logInfo(tag: string, message: string) {
  push("info", tag, message);
}

export function logWarn(tag: string, message: string) {
  push("warn", tag, message);
}

export function logError(tag: string, message: string) {
  push("error", tag, message);
}

export async function getAppLogs(limit = 200): Promise<AppLogEntry[]> {
  await flushLogs();
  const stored = await readStoredLogs();
  const sliced = limit > 0 ? stored.slice(-limit) : stored;
  return sliced.reverse();
}

export async function clearAppLogs() {
  pending = [];
  await AsyncStorage.removeItem(APP_LOG_STORAGE_KEY);
}

export function formatLogLines(logs: AppLogEntry[]) {
  return logs
    .map((item) => `[${item.ts}] [${item.level.toUpperCase()}] [${item.tag}] ${item.message}`)
    .join("\n");
}
