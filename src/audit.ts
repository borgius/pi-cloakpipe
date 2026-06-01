import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PiCloakPipeConfig } from "./config.ts";

export type AuditFields = Record<string, unknown>;

export function defaultAuditDir(): string {
  return join(homedir(), ".pi", "agent", "pi-cloakpipe", "audit");
}

export async function writeAuditEvent(config: PiCloakPipeConfig, event: string, fields: AuditFields = {}): Promise<void> {
  if (!config.audit) return;
  const auditDir = config.auditDir ?? defaultAuditDir();
  await mkdir(auditDir, { recursive: true });
  const payload = {
    ts: Date.now() / 1000,
    event,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => isSafeAuditValue(value))),
  };
  await appendFile(join(auditDir, "pi-cloakpipe.jsonl"), `${JSON.stringify(payload)}\n`, "utf8");
}

export function isSafeAuditValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 240 && !value.includes("\n") && !value.includes("\r");
  if (Array.isArray(value)) return value.every(isSafeAuditValue);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).every(([key, item]) => typeof key === "string" && isSafeAuditValue(item));
  }
  return false;
}