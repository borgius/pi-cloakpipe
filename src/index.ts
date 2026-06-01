import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeAuditEvent } from "./audit.ts";
import { loadConfig, type PiCloakPipeConfig } from "./config.ts";
import { transformAgentMessage, transformAgentMessages, transformToolResultContent } from "./piMessages.ts";
import { CloakPipeError, PrivacyClient, isRecord, probeHealth, transformJsonStrings } from "./privacy.ts";
import { redactProviderPayload, redactText, transformProviderPayload } from "./providerPayload.ts";

type ExtensionContextLike = Parameters<Parameters<ExtensionAPI["on"]>[1]>[1];

function notify(ctx: ExtensionContextLike, message: string, type: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(message, type);
}

function replaceRecordInPlace(target: Record<string, unknown>, replacement: unknown): void {
  if (!isRecord(replacement)) return;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, replacement);
}

async function safeAudit(config: PiCloakPipeConfig, event: string, fields: Record<string, unknown> = {}): Promise<void> {
  try {
    await writeAuditEvent(config, event, fields);
  } catch {
    // Audit failures must not cause privacy failures.
  }
}

function errorDetail(error: unknown): { code: string; message: string } {
  if (error instanceof CloakPipeError) return { code: error.code, message: error.message };
  return { code: "unknown_error", message: error instanceof Error ? error.message : String(error) };
}

export default function piCloakPipe(pi: ExtensionAPI): void {
  const config = loadConfig();
  const client = new PrivacyClient(config.cloakpipeBaseUrl, { timeoutMs: config.requestTimeoutMs });

  const pseudonymize = (text: string, signal?: AbortSignal) =>
    client.pseudonymizeText(text, signal ? { signal } : undefined);
  const rehydrate = (text: string, signal?: AbortSignal) => client.rehydrateText(text, signal ? { signal } : undefined);

  pi.on("session_start", async (event, ctx) => {
    const health = await probeHealth(config.cloakpipeBaseUrl, { timeoutMs: Math.min(config.requestTimeoutMs, 3_000) });
    ctx.ui.setStatus("pi-cloakpipe", health.ok ? "cloakpipe: ready" : "cloakpipe: unavailable");
    if (!health.ok) notify(ctx, `pi-cloakpipe could not reach CloakPipe: ${health.detail}`, config.strict ? "error" : "warning");
    await safeAudit(config, "session_start", { reason: event.reason, cloakpipe_ok: health.ok, strict: config.strict });
  });

  pi.on("session_shutdown", async (event) => {
    await safeAudit(config, "session_shutdown", { reason: event.reason });
  });

  pi.on("input", async (event, ctx) => {
    if (!config.inputTransform) return { action: "continue" as const };
    try {
      const text = await pseudonymize(event.text, ctx.signal);
      await safeAudit(config, "input_transform", { source: event.source, changed: text !== event.text });
      return text === event.text
        ? { action: "continue" as const }
        : { action: "transform" as const, text, ...(event.images ? { images: event.images } : {}) };
    } catch (error) {
      const detail = errorDetail(error);
      await safeAudit(config, "input_transform_error", { code: detail.code, strict: config.strict });
      if (config.strict) {
        notify(ctx, "pi-cloakpipe blocked this prompt because CloakPipe is unavailable.", "error");
        return { action: "handled" as const };
      }
      notify(ctx, "pi-cloakpipe could not mask this prompt; continuing because strict mode is off.", "warning");
      return { action: "continue" as const };
    }
  });

  pi.on("context", async (event, ctx) => {
    if (!config.contextTransform) return undefined;
    try {
      const messages = await transformAgentMessages(event.messages, (text) => pseudonymize(text, ctx.signal), {
        transformThinking: config.transformThinking,
      });
      await safeAudit(config, "context_transform", { messages: messages.length });
      return { messages: messages as typeof event.messages };
    } catch (error) {
      const detail = errorDetail(error);
      await safeAudit(config, "context_transform_error", { code: detail.code, strict: config.strict });
      if (!config.strict) return undefined;
      const messages = await transformAgentMessages(event.messages, redactText, { transformThinking: config.transformThinking });
      return { messages: messages as typeof event.messages };
    }
  });

  pi.on("before_provider_request", async (event, ctx) => {
    if (!config.providerPayloadTransform) return undefined;
    try {
      const payload = await transformProviderPayload(event.payload, (text) => pseudonymize(text, ctx.signal), {
        transformToolDefinitions: config.transformToolDefinitions,
        transformThinking: config.transformThinking,
      });
      await safeAudit(config, "provider_payload_transform", { transformed: true });
      return payload;
    } catch (error) {
      const detail = errorDetail(error);
      await safeAudit(config, "provider_payload_transform_error", { code: detail.code, strict: config.strict });
      if (!config.strict) return undefined;
      return redactProviderPayload(event.payload, {
        transformToolDefinitions: config.transformToolDefinitions,
        transformThinking: config.transformThinking,
      });
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!config.pseudonymizeToolResults) return undefined;
    try {
      const content = await transformToolResultContent(event.content, (text) => pseudonymize(text, ctx.signal), {
        transformThinking: config.transformThinking,
      });
      await safeAudit(config, "tool_result_transform", { tool: event.toolName, is_error: event.isError });
      return { content: content as typeof event.content };
    } catch (error) {
      const detail = errorDetail(error);
      await safeAudit(config, "tool_result_transform_error", { tool: event.toolName, code: detail.code, strict: config.strict });
      if (!config.strict) return undefined;
      const content = await transformToolResultContent(event.content, redactText, { transformThinking: config.transformThinking });
      return { content: content as typeof event.content };
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (!config.rehydrateMessages || event.message.role !== "assistant") return undefined;
    try {
      const message = await transformAgentMessage(event.message, (text) => rehydrate(text, ctx.signal), {
        transformThinking: config.transformThinking,
      });
      await safeAudit(config, "message_rehydrate", { role: event.message.role });
      return { message: message as typeof event.message };
    } catch (error) {
      const detail = errorDetail(error);
      await safeAudit(config, "message_rehydrate_error", { code: detail.code });
      notify(ctx, "pi-cloakpipe could not rehydrate the assistant message; leaving placeholders in place.", "warning");
      return undefined;
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    try {
      const updated = await transformJsonStrings(event.input, (text) => rehydrate(text, ctx.signal));
      replaceRecordInPlace(event.input, updated);
      await safeAudit(config, "tool_call_rehydrate", { tool: event.toolName });
      return undefined;
    } catch (error) {
      const detail = errorDetail(error);
      await safeAudit(config, "tool_call_rehydrate_error", { tool: event.toolName, code: detail.code, strict: config.strict });
      if (config.strict) return { block: true, reason: "pi-cloakpipe could not rehydrate tool input" };
      notify(ctx, "pi-cloakpipe could not rehydrate tool input; continuing because strict mode is off.", "warning");
      return undefined;
    }
  });

  pi.on("after_provider_response", async (event) => {
    await safeAudit(config, "provider_response", { status: event.status });
  });

  pi.registerCommand("cloakpipe-status", {
    description: "Show pi-cloakpipe and CloakPipe health status",
    handler: async (_args, ctx) => {
      const health = await probeHealth(config.cloakpipeBaseUrl, { timeoutMs: Math.min(config.requestTimeoutMs, 3_000) });
      const mode = config.strict ? "strict" : "permissive";
      ctx.ui.notify(`pi-cloakpipe: ${mode}; CloakPipe ${health.ok ? "ready" : `unavailable (${health.detail})`}`, health.ok ? "info" : "warning");
    },
  });
}