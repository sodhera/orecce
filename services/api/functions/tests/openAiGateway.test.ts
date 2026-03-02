import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiGateway } from "@orecce/api-core/src/llm/openAiGateway";
import { ApiError } from "@orecce/api-core/src/types/errors";

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

  it("parses structured JSON responses", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.MOCK_LLM = "false";
    process.env.OPENAI_MODEL = "gpt-5-mini";

    const responsePayload = {
      output_text: JSON.stringify({
        briefs: [
          {
            category: "mental_model_library",
            template_used: "model_breakdown",
            working_title: "Goodhart as a product metric trap",
            primary_topic: "Goodhart's Law",
            subtopics: ["metrics", "incentives", "optimization"],
            source_kind: "research_paper",
            angle: "Why product teams break their own KPIs when one number becomes sovereign.",
            example_anchors: ["click-through rate", "retention dashboards"]
          }
        ]
      })
    };

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(responsePayload), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const gateway = new OpenAiGateway();
    const result = await gateway.generateStructuredJson({
      systemPrompt: "Return one object.",
      userPrompt: "Generate a brief batch.",
      schemaName: "brief_batch",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["briefs"],
        properties: {
          briefs: {
            type: "array",
            items: {
              type: "object"
            }
          }
        }
      },
      maxOutputTokens: 800,
      parser: (data) => data as { briefs: Array<{ primary_topic: string }> }
    });

    expect(result.briefs[0]?.primary_topic).toBe("Goodhart's Law");
  });
});
