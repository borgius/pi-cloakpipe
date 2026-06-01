import { DEFAULT_SKIP_KEYS, transformJsonStrings, type TextTransform } from "./privacy.ts";

export interface ProviderPayloadTransformOptions {
  transformToolDefinitions?: boolean;
  transformThinking?: boolean;
}

const THINKING_KEYS = ["thinking", "reasoning", "reasoning_content", "reasoningContent"];

function buildSkipKeys(options: ProviderPayloadTransformOptions): Set<string> {
  const skipKeys = new Set(DEFAULT_SKIP_KEYS);
  if (!options.transformToolDefinitions) skipKeys.add("tools");
  if (!options.transformThinking) {
    for (const key of THINKING_KEYS) skipKeys.add(key);
  }
  return skipKeys;
}

export async function transformProviderPayload(
  payload: unknown,
  transform: TextTransform,
  options: ProviderPayloadTransformOptions = {},
): Promise<unknown> {
  return transformJsonStrings(payload, transform, { skipKeys: buildSkipKeys(options) });
}

export function redactText(): string {
  return "[pi-cloakpipe redacted text because CloakPipe is unavailable]";
}

export async function redactProviderPayload(payload: unknown, options: ProviderPayloadTransformOptions = {}): Promise<unknown> {
  return transformProviderPayload(payload, redactText, options);
}