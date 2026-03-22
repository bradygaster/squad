import { describe, it, expect, vi } from "vitest";
import type { Program, Model } from "@typespec/compiler";
import { toAgentCard } from "../src/translators/a2a.js";
import { checkForPii, PII_PATTERNS } from "../src/diagnostics.js";
import type { AgentManifestData } from "../src/types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<AgentManifestData> = {}): AgentManifestData {
  return {
    $schema: "https://agentspec.dev/schemas/agent-manifest/0.1.json",
    specVersion: "0.1.0",
    id: "test-agent",
    description: "A test agent",
    sensitivity: "internal",
    behavior: {
      instructions: "You are a helpful agent.",
      capabilities: [
        { id: "cap-1", description: "First capability" },
        { id: "cap-2" },
      ],
    },
    runtime: { tools: [], knowledge: [], memory: "none" },
    communication: {
      conversationStarters: ["Hello", "Help me"],
      inputModes: ["text"],
      outputModes: ["text"],
    },
    ...overrides,
  };
}

function makeMockProgram() {
  const diagnostics: unknown[] = [];
  const mock = { reportDiagnostic: (d: unknown) => diagnostics.push(d) } as unknown as Program;
  return { mock, diagnostics };
}

const mockTarget = {} as unknown as Model;

// ─── toAgentCard ─────────────────────────────────────────────────────────────

describe("toAgentCard()", () => {
  it("returns a card with correct shape for a basic manifest", () => {
    const card = toAgentCard(makeManifest());
    expect(card).not.toBeNull();
    expect(card!.name).toBe("test-agent");
    expect(card!.description).toBe("A test agent");
    expect(card!.skills).toHaveLength(2);
    expect(card!.skills[0]!.id).toBe("cap-1");
    expect(card!.defaultInputModes).toContain("text");
    expect(card!.defaultOutputModes).toContain("text");
  });

  it("omits instructions by default (publishInstructions not set)", () => {
    const card = toAgentCard(makeManifest());
    expect(card).not.toBeNull();
    expect((card as any).instructions).toBeUndefined();
  });

  it("includes instructions when publishInstructions: true", () => {
    const card = toAgentCard(makeManifest(), { publishInstructions: true });
    expect(card).not.toBeNull();
    expect(card!.instructions).toBe("You are a helpful agent.");
  });

  it("omits instructions when publishInstructions: true but no instructions in manifest", () => {
    const manifest = makeManifest({ behavior: { capabilities: [] } });
    const card = toAgentCard(manifest, { publishInstructions: true });
    expect(card).not.toBeNull();
    expect((card as any).instructions).toBeUndefined();
  });

  it("omits instructions when publishInstructions: false", () => {
    const card = toAgentCard(makeManifest(), { publishInstructions: false });
    expect(card).not.toBeNull();
    expect((card as any).instructions).toBeUndefined();
  });

  it("returns null for sensitivity 'restricted'", () => {
    const card = toAgentCard(makeManifest({ sensitivity: "restricted" }));
    expect(card).toBeNull();
  });

  it("returns a card for sensitivity 'public'", () => {
    const card = toAgentCard(makeManifest({ sensitivity: "public" }));
    expect(card).not.toBeNull();
  });

  it("populates skill examples from conversationStarters", () => {
    const card = toAgentCard(makeManifest());
    expect(card!.skills[0]!.examples).toEqual(["Hello", "Help me"]);
  });
});

// ─── checkForPii ─────────────────────────────────────────────────────────────

describe("checkForPii()", () => {
  it("fires a diagnostic for an email address", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "Contact admin@example.com for help", mockTarget);
    expect(diagnostics).toHaveLength(1);
  });

  it("fires a diagnostic for a bearer token", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "Authorization: Bearer abc123xyz", mockTarget);
    expect(diagnostics).toHaveLength(1);
  });

  it("fires a diagnostic for a GitHub PAT prefix", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "Use ghp_mytoken123 to authenticate", mockTarget);
    expect(diagnostics).toHaveLength(1);
  });

  it("fires a diagnostic for a phone number pattern", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "Call +1 (555) 867-5309", mockTarget);
    expect(diagnostics).toHaveLength(1);
  });

  it("fires a diagnostic for an sk- token", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "sk-proj-abc123", mockTarget);
    expect(diagnostics).toHaveLength(1);
  });

  it("fires only one diagnostic per value even if multiple patterns match", () => {
    const { mock, diagnostics } = makeMockProgram();
    // email + token both match
    checkForPii(mock, "sk-abc user@test.com", mockTarget);
    expect(diagnostics).toHaveLength(1);
  });

  it("does not fire for a clean string", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "You are a helpful assistant that answers questions.", mockTarget);
    expect(diagnostics).toHaveLength(0);
  });

  it("does not fire for an empty string", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "", mockTarget);
    expect(diagnostics).toHaveLength(0);
  });

  it("does not fire for a normal role description", () => {
    const { mock, diagnostics } = makeMockProgram();
    checkForPii(mock, "Search the web for up-to-date information and summarize results.", mockTarget);
    expect(diagnostics).toHaveLength(0);
  });
});

// ─── PII_PATTERNS ─────────────────────────────────────────────────────────────

describe("PII_PATTERNS", () => {
  it("email pattern matches user@domain.tld", () => {
    const ep = PII_PATTERNS.find((p) => p.name === "email");
    expect(ep?.pattern.test("user@example.com")).toBe(true);
  });

  it("bearer-token pattern matches 'token:' prefix", () => {
    const bt = PII_PATTERNS.find((p) => p.name === "bearer-token");
    expect(bt?.pattern.test("token:mysecret")).toBe(true);
  });

  it("sas-url pattern matches Azure SAS signature fragment", () => {
    const sas = PII_PATTERNS.find((p) => p.name === "sas-url");
    expect(sas?.pattern.test("https://storage.blob.core.windows.net/x?sv=2021&sig=abc")).toBe(true);
  });
});

// ─── Path traversal guard logic ───────────────────────────────────────────────

describe("path traversal rejection patterns", () => {
  const isSafe = (id: string) =>
    !id.includes("..") && !id.includes("/") && !id.includes("\\");

  it("rejects double-dot sequences", () => {
    expect(isSafe("../etc/passwd")).toBe(false);
  });

  it("rejects forward slashes", () => {
    expect(isSafe("agents/my-agent")).toBe(false);
  });

  it("rejects backslashes", () => {
    expect(isSafe("agents\\my-agent")).toBe(false);
  });

  it("rejects combined traversal", () => {
    expect(isSafe("..\\windows\\system32")).toBe(false);
  });

  it("accepts clean hyphenated id", () => {
    expect(isSafe("my-agent-v2")).toBe(true);
  });

  it("accepts alphanumeric id with underscores", () => {
    expect(isSafe("support_bot_01")).toBe(true);
  });
});
