import { describe, expect, it } from "vitest";
import { transformAgentMessage, transformAgentMessages, transformToolResultContent } from "../src/piMessages.ts";
import { redactProviderPayload, transformProviderPayload } from "../src/providerPayload.ts";

const pseudonymize = (text: string) => text.replaceAll("Alice", "PERSON_1");
const rehydrate = (text: string) => text.replaceAll("PERSON_1", "Alice");

describe("pi message transforms", () => {
  it("pseudonymizes user, assistant, custom, and tool result text", async () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "Hi Alice" }], timestamp: 1 },
      { role: "custom", content: "Alice context", display: false, timestamp: 2 },
      { role: "toolResult", content: [{ type: "text", text: "Alice output" }], isError: false, timestamp: 3 },
    ];

    const transformed = await transformAgentMessages(messages, pseudonymize);

    expect(JSON.stringify(transformed)).toContain("PERSON_1");
    expect(JSON.stringify(transformed)).not.toContain("Alice output");
  });

  it("rehydrates assistant text and tool call arguments while preserving thinking by default", async () => {
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "Hello PERSON_1" },
        { type: "toolCall", id: "call_1", name: "read", arguments: { path: "PERSON_1.txt" } },
        { type: "thinking", thinking: "PERSON_1", thinkingSignature: "PERSON_1-signature" },
      ],
      timestamp: 1,
    };

    const transformed = await transformAgentMessage(message, rehydrate);

    expect(transformed).toMatchObject({
      content: [
        { text: "Hello Alice" },
        { arguments: { path: "Alice.txt" } },
        { thinking: "PERSON_1", thinkingSignature: "PERSON_1-signature" },
      ],
    });
  });

  it("pseudonymizes textual tool result content", async () => {
    const content = [{ type: "text", text: "Alice secret" }];

    await expect(transformToolResultContent(content, pseudonymize)).resolves.toEqual([{ type: "text", text: "PERSON_1 secret" }]);
  });
});

describe("provider payload transforms", () => {
  it("masks provider payload text but skips tools by default", async () => {
    const payload = {
      system: "Alice system",
      messages: [{ role: "user", content: "Alice prompt" }],
      tools: [{ name: "read", description: "Read Alice files" }],
    };

    const transformed = await transformProviderPayload(payload, pseudonymize);

    expect(transformed).toEqual({
      system: "PERSON_1 system",
      messages: [{ role: "user", content: "PERSON_1 prompt" }],
      tools: [{ name: "read", description: "Read Alice files" }],
    });
  });

  it("redacts payload text without calling CloakPipe", async () => {
    const transformed = await redactProviderPayload({ messages: [{ role: "user", content: "Alice" }] });

    expect(JSON.stringify(transformed)).toContain("pi-cloakpipe redacted text");
    expect(JSON.stringify(transformed)).not.toContain("Alice");
  });
});