import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiGateway } from "../src/llm/openAiGateway";
import { ApiError } from "../src/types/errors";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function baseInput() {
  return {
    mode: "BIOGRAPHY" as const,
    profile: "Bill Gates",
    length: "short" as const,
    recentTitles: [],
    preferences: {
      biographyInstructions: "",
      nicheInstructions: ""
    }
  };
}

describe("OpenAiGateway", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("maps upstream 401 errors to llm_auth_error", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.MOCK_LLM = "false";

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(new Response("invalid_api_key", { status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const gateway = new OpenAiGateway();
    await expect(gateway.generatePost(baseInput())).rejects.toMatchObject({
      status: 502,
      code: "llm_auth_error"
    } satisfies Partial<ApiError>);
  });

  it("uses normalized key for authorization header", async () => {
    process.env.OPENAI_API_KEY = "\"sk-test-normalized\"";
    process.env.MOCK_LLM = "false";
    process.env.OPENAI_MODEL = "gpt-5-mini";

    const responsePayload = {
      output_text: JSON.stringify({
        title: "A choice that changed Microsoft",
        body: "Bill Gates focused on software licensing early. That decision changed how personal computing scaled.",
        post_type: "micro_essay",
        tags: ["biography"],
        confidence: "high",
        uncertainty_note: null
      })
    };

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(responsePayload), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const gateway = new OpenAiGateway();
    await gateway.generatePost(baseInput());

    const call = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(call).toBeTruthy();

    const requestInit = call[1];
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test-normalized");
  });
});
