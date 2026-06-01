import { describe, expect, it } from "vitest";
import { DEFAULT_CLOAKPIPE_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS, loadConfig, normalizeBaseUrl } from "../src/config.ts";

describe("config", () => {
  it("loads defaults", () => {
    const config = loadConfig({});

    expect(config.cloakpipeBaseUrl).toBe(DEFAULT_CLOAKPIPE_BASE_URL);
    expect(config.requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
    expect(config.strict).toBe(true);
    expect(config.transformToolDefinitions).toBe(false);
  });

  it("parses environment overrides", () => {
    const config = loadConfig({
      CLOAKPIPE_BASE_URL: "127.0.0.1:3101/v1/",
      PI_CLOAKPIPE_STRICT: "0",
      PI_CLOAKPIPE_TRANSFORM_TOOL_DEFINITIONS: "yes",
      PI_CLOAKPIPE_REQUEST_TIMEOUT_MS: "5000",
      PI_CLOAKPIPE_AUDIT_DIR: "/tmp/pi-cloakpipe-audit",
    });

    expect(config.cloakpipeBaseUrl).toBe("http://127.0.0.1:3101/v1");
    expect(config.strict).toBe(false);
    expect(config.transformToolDefinitions).toBe(true);
    expect(config.requestTimeoutMs).toBe(5000);
    expect(config.auditDir).toBe("/tmp/pi-cloakpipe-audit");
  });

  it("normalizes base URLs", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3100/v1///")).toBe("http://127.0.0.1:3100/v1");
  });
});