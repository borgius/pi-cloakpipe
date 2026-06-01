export type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
export type TextTransform = (text: string) => string | Promise<string>;

export const DEFAULT_SKIP_KEYS = new Set([
  "id",
  "type",
  "role",
  "model",
  "name",
  "provider",
  "api",
  "toolCallId",
  "toolName",
  "tool_call_id",
  "tool_use_id",
  "signature",
  "thinkingSignature",
  "encrypted_content",
  "cache_control",
  "media_type",
  "mimeType",
  "file_id",
  "url",
  "source",
  "container",
  "caller",
  "stopReason",
  "stop_reason",
  "stop_sequence",
  "usage",
  "cost",
  "timestamp",
  "partialJson",
  "data",
]);

export class CloakPipeError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "CloakPipeError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "cloakpipe_error";
  }
}

export function joinEndpoint(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

export function deriveHealthUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  const v1Index = segments.indexOf("v1");
  const keptSegments = v1Index === -1 ? segments : segments.slice(0, v1Index);
  url.pathname = `/${[...keptSegments, "health"].join("/")}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function createTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("timed out"));
  }, timeoutMs);
  const onAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onAbort);
      if (timedOut) {
        // The flag is captured by callers through the thrown AbortError branch.
      }
    },
  };
}

async function readJsonResponse(response: Response, endpoint: string): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!response.ok) {
    const detail = raw.trim() ? `: ${raw.trim().slice(0, 240)}` : "";
    throw new CloakPipeError(`${endpoint} returned HTTP ${response.status}${detail}`, {
      status: response.status,
      code: "cloakpipe_http_error",
    });
  }
  if (!raw.trim()) return {};
  const data = JSON.parse(raw) as unknown;
  if (!isRecord(data)) {
    throw new CloakPipeError(`CloakPipe ${endpoint} response was not a JSON object`, {
      status: 502,
      code: "cloakpipe_invalid_response",
    });
  }
  return data;
}

function extractTextResult(data: Record<string, unknown>, endpoint: string): string {
  for (const key of ["text", "result", "output", "pseudonymized", "rehydrated"]) {
    const value = data[key];
    if (typeof value === "string") return value;
  }
  throw new CloakPipeError(`CloakPipe ${endpoint} response did not include a text field`, {
    status: 502,
    code: "cloakpipe_invalid_response",
  });
}

export interface TransformRequestOptions {
  signal?: AbortSignal;
}

export class PrivacyClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(baseUrl: string, options: { timeoutMs?: number } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async transformText(endpoint: "pseudonymize" | "rehydrate", text: string, options: TransformRequestOptions = {}): Promise<string> {
    if (!text) return text;
    const url = joinEndpoint(this.baseUrl, endpoint);
    const timeout = createTimeoutSignal(this.timeoutMs, options.signal);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: timeout.signal,
      });
      const data = await readJsonResponse(response, endpoint);
      return extractTextResult(data, endpoint);
    } catch (error) {
      if (error instanceof CloakPipeError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        const abortedByCaller = options.signal?.aborted === true;
        throw new CloakPipeError(abortedByCaller ? `Aborted calling ${url}` : `Timed out calling ${url}`, {
          status: abortedByCaller ? 499 : 504,
          code: abortedByCaller ? "cloakpipe_aborted" : "cloakpipe_timeout",
        });
      }
      throw new CloakPipeError(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`, {
        status: 503,
        code: "cloakpipe_unreachable",
      });
    } finally {
      timeout.cleanup();
    }
  }

  pseudonymizeText(text: string, options?: TransformRequestOptions): Promise<string> {
    return this.transformText("pseudonymize", text, options);
  }

  rehydrateText(text: string, options?: TransformRequestOptions): Promise<string> {
    return this.transformText("rehydrate", text, options);
  }
}

export async function probeHealth(baseUrl: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ ok: boolean; detail: string }> {
  const timeout = createTimeoutSignal(options.timeoutMs ?? 2_000, options.signal);
  try {
    const response = await fetch(deriveHealthUrl(baseUrl), { method: "GET", signal: timeout.signal });
    await response.text();
    return response.ok
      ? { ok: true, detail: `responded with HTTP ${response.status}` }
      : { ok: false, detail: `responded with HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    timeout.cleanup();
  }
}

export interface TransformJsonOptions {
  skipKeys?: ReadonlySet<string>;
}

export async function transformJsonStrings(
  value: unknown,
  transform: TextTransform,
  options: TransformJsonOptions = {},
): Promise<unknown> {
  const skipKeys = options.skipKeys ?? DEFAULT_SKIP_KEYS;
  if (typeof value === "string") return transform(value);
  if (Array.isArray(value)) return Promise.all(value.map((item) => transformJsonStrings(item, transform, options)));
  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = skipKeys.has(key) ? structuredCloneSafe(item) : await transformJsonStrings(item, transform, options);
    }
    return next;
  }
  return structuredCloneSafe(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}