import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { isSafeAuditValue, writeAuditEvent } from "../src/audit.ts";
import { loadConfig } from "../src/config.ts";

describe("audit", () => {
  it("filters unsafe values", () => {
    expect(isSafeAuditValue("short value")).toBe(true);
    expect(isSafeAuditValue("line\nbreak")).toBe(false);
    expect(isSafeAuditValue("x".repeat(241))).toBe(false);
  });

  it("writes only safe fields", async () => {
    const auditDir = await mkdtemp(join(tmpdir(), "pi-cloakpipe-audit-"));
    const config = loadConfig({ PI_CLOAKPIPE_AUDIT_DIR: auditDir });

    await writeAuditEvent(config, "test", { ok: true, prompt: "x".repeat(300) });
    const body = await readFile(join(auditDir, "pi-cloakpipe.jsonl"), "utf8");

    expect(body).toContain("test");
    expect(body).toContain("ok");
    expect(body).not.toContain("prompt");
  });
});