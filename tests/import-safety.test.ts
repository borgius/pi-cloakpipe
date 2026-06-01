import { describe, expect, it, vi } from "vitest";

describe("import safety", () => {
  it("imports modules without network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("network call during import");
    });
    vi.stubGlobal("fetch", fetchMock);

    await import("../src/config.ts");
    await import("../src/privacy.ts");
    await import("../src/piMessages.ts");
    await import("../src/providerPayload.ts");
    await import("../src/audit.ts");
    await import("../src/index.ts");

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});