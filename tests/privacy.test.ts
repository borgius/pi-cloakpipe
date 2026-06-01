import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivacyClient, deriveHealthUrl, transformJsonStrings } from "../src/privacy.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("privacy client", () => {
  it("calls CloakPipe transform endpoints", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "Hi PERSON_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new PrivacyClient("http://127.0.0.1:3100/v1");
    await expect(client.pseudonymizeText("Hi Alice")).resolves.toBe("Hi PERSON_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3100/v1/pseudonymize",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("preserves skipped structural keys during JSON transforms", async () => {
    const value = {
      role: "Alice",
      content: [{ type: "text", text: "Alice" }],
      input: { path: "Alice.txt" },
      data: "AliceBase64",
    };

    const transformed = await transformJsonStrings(value, (text) => text.replaceAll("Alice", "PERSON_1"));

    expect(transformed).toEqual({
      role: "Alice",
      content: [{ type: "text", text: "PERSON_1" }],
      input: { path: "PERSON_1.txt" },
      data: "AliceBase64",
    });
  });

  it("derives health URLs from versioned API URLs", () => {
    expect(deriveHealthUrl("http://127.0.0.1:3100/v1")).toBe("http://127.0.0.1:3100/health");
  });
});