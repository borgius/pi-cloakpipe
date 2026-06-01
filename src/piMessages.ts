import { transformJsonStrings, type TextTransform, isRecord, structuredCloneSafe } from "./privacy.ts";

export interface MessageTransformOptions {
  transformThinking?: boolean;
  transformDetails?: boolean;
}

export async function transformTextContent(
  content: unknown,
  transform: TextTransform,
  options: MessageTransformOptions = {},
): Promise<unknown> {
  if (typeof content === "string") return transform(content);
  if (Array.isArray(content)) return Promise.all(content.map((block) => transformContentBlock(block, transform, options)));
  return structuredCloneSafe(content);
}

export async function transformContentBlock(
  block: unknown,
  transform: TextTransform,
  options: MessageTransformOptions = {},
): Promise<unknown> {
  if (typeof block === "string") return transform(block);
  if (!isRecord(block)) return structuredCloneSafe(block);

  const blockType = typeof block.type === "string" ? block.type : "";
  if (blockType === "image") return structuredCloneSafe(block);

  const next = structuredCloneSafe(block);
  if (blockType === "text") {
    if (typeof next.text === "string") next.text = await transform(next.text);
    return next;
  }

  if (blockType === "thinking") {
    if (options.transformThinking && typeof next.thinking === "string") {
      next.thinking = await transform(next.thinking);
    }
    return next;
  }

  if (blockType === "toolCall") {
    if (isRecord(next.arguments) || Array.isArray(next.arguments) || typeof next.arguments === "string") {
      next.arguments = await transformJsonStrings(next.arguments, transform);
    }
    return next;
  }

  if (blockType === "tool_result" || blockType === "toolResult") {
    if (typeof next.content === "string" || Array.isArray(next.content)) {
      next.content = await transformTextContent(next.content, transform, options);
    }
    return next;
  }

  return transformJsonStrings(block, transform);
}

export async function transformAgentMessage(
  message: unknown,
  transform: TextTransform,
  options: MessageTransformOptions = {},
): Promise<unknown> {
  if (!isRecord(message)) return structuredCloneSafe(message);
  const next = structuredCloneSafe(message);
  const role = typeof next.role === "string" ? next.role : "";

  if (role === "user" || role === "assistant" || role === "toolResult" || role === "custom") {
    next.content = await transformTextContent(next.content, transform, options);
    if (options.transformDetails && "details" in next) {
      next.details = await transformJsonStrings(next.details, transform);
    }
    return next;
  }

  if (role === "bashExecution") {
    if (typeof next.command === "string") next.command = await transform(next.command);
    if (typeof next.output === "string") next.output = await transform(next.output);
    return next;
  }

  if (role === "branchSummary" || role === "compactionSummary") {
    if (typeof next.summary === "string") next.summary = await transform(next.summary);
    return next;
  }

  return transformJsonStrings(message, transform);
}

export async function transformAgentMessages(
  messages: unknown[],
  transform: TextTransform,
  options: MessageTransformOptions = {},
): Promise<unknown[]> {
  return Promise.all(messages.map((message) => transformAgentMessage(message, transform, options)));
}

export async function transformToolResultContent(
  content: unknown,
  transform: TextTransform,
  options: MessageTransformOptions = {},
): Promise<unknown> {
  return transformTextContent(content, transform, options);
}