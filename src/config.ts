export interface PiCloakPipeConfig {
  cloakpipeBaseUrl: string;
  strict: boolean;
  inputTransform: boolean;
  contextTransform: boolean;
  providerPayloadTransform: boolean;
  rehydrateMessages: boolean;
  pseudonymizeToolResults: boolean;
  transformToolDefinitions: boolean;
  transformThinking: boolean;
  requestTimeoutMs: number;
  audit: boolean;
  auditDir?: string;
}

export const DEFAULT_CLOAKPIPE_BASE_URL = "http://127.0.0.1:3100/v1";
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

type EnvLike = Record<string, string | undefined>;

function readString(env: EnvLike, name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

function readOptionalString(env: EnvLike, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function readBoolean(env: EnvLike, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return fallback;
}

function readPositiveInteger(env: EnvLike, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

export function loadConfig(env: EnvLike = process.env): PiCloakPipeConfig {
  const auditDir = readOptionalString(env, "PI_CLOAKPIPE_AUDIT_DIR");
  return {
    cloakpipeBaseUrl: normalizeBaseUrl(readString(env, "CLOAKPIPE_BASE_URL", DEFAULT_CLOAKPIPE_BASE_URL)),
    strict: readBoolean(env, "PI_CLOAKPIPE_STRICT", true),
    inputTransform: readBoolean(env, "PI_CLOAKPIPE_INPUT_TRANSFORM", true),
    contextTransform: readBoolean(env, "PI_CLOAKPIPE_CONTEXT_TRANSFORM", true),
    providerPayloadTransform: readBoolean(env, "PI_CLOAKPIPE_PROVIDER_PAYLOAD_TRANSFORM", true),
    rehydrateMessages: readBoolean(env, "PI_CLOAKPIPE_REHYDRATE_MESSAGES", true),
    pseudonymizeToolResults: readBoolean(env, "PI_CLOAKPIPE_PSEUDONYMIZE_TOOL_RESULTS", true),
    transformToolDefinitions: readBoolean(env, "PI_CLOAKPIPE_TRANSFORM_TOOL_DEFINITIONS", false),
    transformThinking: readBoolean(env, "PI_CLOAKPIPE_TRANSFORM_THINKING", false),
    requestTimeoutMs: readPositiveInteger(env, "PI_CLOAKPIPE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS),
    audit: readBoolean(env, "PI_CLOAKPIPE_AUDIT", true),
    ...(auditDir ? { auditDir } : {}),
  };
}