import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import piCloakPipe from "../src/index.ts";

type Handler = (event: any, ctx: any) => Promise<any> | any;

function createPiHarness() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, any>();
  const pi = {
    on: vi.fn((event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    registerCommand: vi.fn((name: string, command: any) => {
      commands.set(name, command);
    }),
  };
  return { pi, handlers, commands };
}

function createContext() {
  return {
    hasUI: true,
    signal: undefined,
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
  };
}

function stubCloakPipeFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "GET" || url.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
    const text = body.text ?? "";
    if (url.endsWith("/pseudonymize")) {
      return new Response(JSON.stringify({ text: text.replaceAll("Alice", "PERSON_1") }), { status: 200 });
    }
    if (url.endsWith("/rehydrate")) {
      return new Response(JSON.stringify({ text: text.replaceAll("PERSON_1", "Alice") }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("pi extension", () => {
  beforeEach(() => {
    vi.stubEnv("PI_CLOAKPIPE_AUDIT", "0");
    stubCloakPipeFetch();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("registers core handlers and command", () => {
    const { pi, handlers, commands } = createPiHarness();

    piCloakPipe(pi as any);

    expect(handlers.has("input")).toBe(true);
    expect(handlers.has("before_provider_request")).toBe(true);
    expect(handlers.has("tool_call")).toBe(true);
    expect(commands.has("cloakpipe-status")).toBe(true);
  });

  it("masks input prompts", async () => {
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);

    const result = await handlers.get("input")![0]!({ text: "Hi Alice", source: "interactive" }, createContext());

    expect(result).toEqual({ action: "transform", text: "Hi PERSON_1", images: undefined });
  });

  it("masks provider payloads", async () => {
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);

    const result = await handlers.get("before_provider_request")![0]!(
      { payload: { messages: [{ role: "user", content: "Alice prompt" }] } },
      createContext(),
    );

    expect(result).toEqual({ messages: [{ role: "user", content: "PERSON_1 prompt" }] });
  });

  it("rehydrates assistant message text and tool calls", async () => {
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "Hi PERSON_1" },
        { type: "toolCall", id: "call_1", name: "read", arguments: { path: "PERSON_1.txt" } },
      ],
    };

    const result = await handlers.get("message_end")![0]!({ message }, createContext());

    expect(result.message.content[0].text).toBe("Hi Alice");
    expect(result.message.content[1].arguments.path).toBe("Alice.txt");
  });

  it("rehydrates mutable tool input before execution", async () => {
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);
    const input = { path: "PERSON_1.txt" };

    await handlers.get("tool_call")![0]!({ toolName: "read", toolCallId: "call_1", input }, createContext());

    expect(input).toEqual({ path: "Alice.txt" });
  });

  it("pseudonymizes tool result content", async () => {
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);

    const result = await handlers.get("tool_result")![0]!(
      { toolName: "bash", toolCallId: "call_1", input: {}, content: [{ type: "text", text: "Alice output" }], isError: false },
      createContext(),
    );

    expect(result.content).toEqual([{ type: "text", text: "PERSON_1 output" }]);
  });

  it("blocks input in strict mode when CloakPipe fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);

    const ctx = createContext();
    const result = await handlers.get("input")![0]!({ text: "Hi Alice", source: "interactive" }, ctx);

    expect(result).toEqual({ action: "handled" });
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("blocked"), "error");
  });

  it("redacts provider payload in strict mode when CloakPipe fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const { pi, handlers } = createPiHarness();
    piCloakPipe(pi as any);

    const result = await handlers.get("before_provider_request")![0]!(
      { payload: { messages: [{ role: "user", content: "Alice prompt" }] } },
      createContext(),
    );

    expect(JSON.stringify(result)).toContain("pi-cloakpipe redacted text");
    expect(JSON.stringify(result)).not.toContain("Alice prompt");
  });
});