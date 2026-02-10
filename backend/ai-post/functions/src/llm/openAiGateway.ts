import {
  getGenerationTemperature,
  getOpenAiApiKey,
  getOpenAiBaseUrl,
  getOpenAiModel,
  isMockLlmEnabled
} from "../config/runtimeConfig";
import { LlmGateway, LlmGenerationInput, StreamChunkHandler } from "../types/contracts";
import { GeneratedPost } from "../types/domain";
import { ApiError } from "../types/errors";
import { buildSystemPrompt, buildUserPrompt } from "./promptBuilder";

interface OpenAiChatResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ text?: string; type?: string }>;
  }>;
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
      parsed?: unknown;
    };
  }>;
}

export class OpenAiGateway implements LlmGateway {
  public async generatePost(input: LlmGenerationInput): Promise<GeneratedPost> {
    return this.generateWithRetry(input, 0);
  }

  public async generatePostStream(input: LlmGenerationInput, onChunk: StreamChunkHandler): Promise<GeneratedPost> {
    return this.generateStreamWithRetry(input, onChunk, 0);
  }

  private createRequestBody(input: LlmGenerationInput, stream: boolean): Record<string, unknown> {
    const model = getOpenAiModel();
    const isGpt5Family = model.toLowerCase().startsWith("gpt-5");
    const isGpt5Mini = model.toLowerCase().startsWith("gpt-5-mini");
    const reasoningEffort = isGpt5Mini ? "minimal" : "low";
    const maxOutputTokens = input.length === "short" ? (isGpt5Family ? 320 : 220) : isGpt5Family ? 520 : 380;
    return {
      model,
      ...(isGpt5Family ? {} : { temperature: getGenerationTemperature() }),
      ...(isGpt5Family ? { reasoning: { effort: reasoningEffort } } : {}),
      max_output_tokens: maxOutputTokens,
      stream,
      input: [
        {
          role: "system",
          content: buildSystemPrompt(input)
        },
        {
          role: "user",
          content: buildUserPrompt(input)
        }
      ]
    };
  }

  private async postResponses(body: Record<string, unknown>): Promise<Response> {
    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      throw new ApiError(500, "missing_openai_key", "OpenAI key is missing. Set OPENAI_API_KEY or firebase functions config openai.key.");
    }

    const response = await fetch(`${getOpenAiBaseUrl()}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(502, "llm_upstream_error", `OpenAI request failed (${response.status}).`, text.slice(0, 1200));
    }

    return response;
  }

  private normalizeGeneratedPost(parsed: unknown, input: LlmGenerationInput): GeneratedPost {
    const value = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    const title = String(value.title ?? `${input.profile} update`).trim() || `${input.profile} update`;
    const body = String(value.body ?? "New post generated.").trim() || "New post generated.";
    const postType = String(value.post_type ?? "micro_essay").trim() || "micro_essay";
    const tagsRaw = Array.isArray(value.tags) ? value.tags : [];
    const tags = tagsRaw
      .map((tag) => String(tag ?? "").trim())
      .filter(Boolean)
      .slice(0, 6);
    const confidenceRaw = String(value.confidence ?? "medium").toLowerCase();
    const confidence =
      confidenceRaw === "high" || confidenceRaw === "low" || confidenceRaw === "medium" ? confidenceRaw : "medium";
    const uncertaintyValue = value.uncertainty_note;
    const uncertaintyNote =
      uncertaintyValue === null ? null : String(uncertaintyValue ?? "").trim() ? String(uncertaintyValue).trim() : null;

    return {
      title,
      body,
      post_type: postType,
      tags: tags.length ? tags : [input.mode.toLowerCase()],
      confidence,
      uncertainty_note: uncertaintyNote
    };
  }

  private extractMessageContent(json: OpenAiChatResponse): string {
    if (typeof json.output_text === "string" && json.output_text.trim()) {
      return json.output_text.trim();
    }

    if (Array.isArray(json.output)) {
      const outputText = json.output
        .filter((item) => item.type === "message" || item.type === undefined)
        .flatMap((item) => item.content ?? [])
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
      if (outputText) {
        return outputText;
      }
    }

    const parsed = json.choices?.[0]?.message?.parsed;
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed);
    }

    const content = json.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }
    return "";
  }

  private parsePostJson(content: string): unknown {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("empty-content");
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start !== -1 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      }
      throw new Error("unable-to-parse-json");
    }
  }

  private async generateWithRetry(input: LlmGenerationInput, retriesLeft: number): Promise<GeneratedPost> {
    if (isMockLlmEnabled()) {
      return this.generateMock(input);
    }

    const response = await this.postResponses(this.createRequestBody(input, false));

    const rawText = await response.text();
    if (!rawText.trim()) {
      throw new ApiError(502, "invalid_llm_payload", "LLM returned an empty upstream body.", "empty-body");
    }

    let json: OpenAiChatResponse;
    try {
      json = JSON.parse(rawText) as OpenAiChatResponse;
    } catch (error) {
      throw new ApiError(
        502,
        "invalid_llm_json",
        "LLM returned non-JSON upstream payload.",
        rawText.slice(0, 500) || (error instanceof Error ? error.message : String(error))
      );
    }
    const content = this.extractMessageContent(json);

    if (!content) {
      if (retriesLeft > 0) {
        return this.generateWithRetry(
          {
            ...input,
            correctiveInstruction: "You must return one valid JSON object only, with all required keys and no extras."
          },
          retriesLeft - 1
        );
      }
      throw new ApiError(
        502,
        "invalid_llm_payload",
        "LLM returned an empty response payload.",
        rawText.slice(0, 500)
      );
    }

    try {
      return this.normalizeGeneratedPost(this.parsePostJson(content), input);
    } catch (error) {
      if (retriesLeft > 0) {
        return this.generateWithRetry(
          {
            ...input,
            correctiveInstruction: "Previous output was invalid JSON/schema. Return strict JSON only with required keys."
          },
          retriesLeft - 1
        );
      }
      throw new ApiError(502, "invalid_llm_json", "LLM returned invalid JSON or schema.", error instanceof Error ? error.message : String(error));
    }
  }

  private async generateStreamWithRetry(
    input: LlmGenerationInput,
    onChunk: StreamChunkHandler,
    retriesLeft: number
  ): Promise<GeneratedPost> {
    if (isMockLlmEnabled()) {
      const mock = this.generateMock(input);
      onChunk(mock.body);
      return mock;
    }

    const response = await this.postResponses(this.createRequestBody(input, true));
    const content = await this.readStreamContent(response, onChunk);

    if (!content) {
      if (retriesLeft > 0) {
        return this.generateStreamWithRetry(
          {
            ...input,
            correctiveInstruction: "You must return one valid JSON object only, with all required keys and no extras."
          },
          onChunk,
          retriesLeft - 1
        );
      }
      throw new ApiError(502, "invalid_llm_payload", "LLM returned an empty streamed payload.");
    }

    try {
      return this.normalizeGeneratedPost(this.parsePostJson(content), input);
    } catch (error) {
      if (retriesLeft > 0) {
        return this.generateStreamWithRetry(
          {
            ...input,
            correctiveInstruction: "Previous output was invalid JSON/schema. Return strict JSON only with required keys."
          },
          onChunk,
          retriesLeft - 1
        );
      }
      throw new ApiError(
        502,
        "invalid_llm_json",
        "LLM returned invalid streamed JSON or schema.",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async readStreamContent(response: Response, onChunk: StreamChunkHandler): Promise<string> {
    if (!response.body) {
      const json = (await response.json()) as OpenAiChatResponse;
      return this.extractMessageContent(json);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let rawStream = "";

    let completedResponse: OpenAiChatResponse | null = null;

    const consumeEvent = (raw: string): boolean => {
      const lines = raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const payload = line.slice(5).trim();
        if (!payload) {
          continue;
        }
        if (payload === "[DONE]") {
          return true;
        }
        try {
          const event = JSON.parse(payload) as {
            type?: string;
            delta?: string;
            response?: OpenAiChatResponse;
          };

          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            fullContent += event.delta;
            onChunk(event.delta);
          }
          if (event.type === "response.completed" && event.response) {
            completedResponse = event.response;
          }
        } catch {
          continue;
        }
      }
      return false;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const decoded = decoder.decode(value, { stream: true });
      rawStream += decoded;
      buffer += decoded;
      while (true) {
        const separatorIndex = buffer.indexOf("\n\n");
        if (separatorIndex === -1) {
          break;
        }
        const rawEvent = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);
        if (!rawEvent) {
          continue;
        }
        const shouldStop = consumeEvent(rawEvent);
        if (shouldStop) {
          return fullContent.trim();
        }
      }
    }

    if (buffer.trim()) {
      consumeEvent(buffer.trim());
    }

    if (!fullContent.trim() && completedResponse) {
      return this.extractMessageContent(completedResponse);
    }

    if (!fullContent.trim() && rawStream.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(rawStream) as OpenAiChatResponse;
        return this.extractMessageContent(parsed);
      } catch {
        // ignore fallback parse error and return collected content
      }
    }

    return fullContent.trim();
  }

  private generateMock(input: LlmGenerationInput): GeneratedPost {
    const profileLabel = input.profile.trim().slice(0, 40);
    const title = input.mode === "BIOGRAPHY" ? `2008: ${profileLabel} faces a cash cliff` : `${input.mode} post on ${profileLabel}`;
    const confidence = input.mode === "BIOGRAPHY" ? "medium" : "high";

    const body =
      input.mode === "BIOGRAPHY"
        ? input.length === "short"
          ? [
              "In 2008, the company had weeks of cash left before payroll hit.",
              "Because funding tightened, leaders cut spending and chased emergency money fast.",
              "Then they accepted a painful deal under brutal deadlines.",
              "That meant they bought runway and avoided shutdown.",
              "Under pressure, survival comes from fewer bets and faster decisions."
            ].join("\n")
          : [
              "In 2008, the company had weeks of cash left before payroll hit.",
              "Because the credit markets froze, investors hesitated and suppliers wanted money up front.",
              "Then leadership cut spend, pushed deliveries, and hunted emergency funding on a ticking clock.",
              "They also simplified the plan, because complexity was burning cash faster than progress.",
              "One financing round came with ugly tradeoffs: dilution, control terms, and zero room for missed quarters.",
              "That meant they bought runway, kept the lights on, and stayed alive long enough to keep iterating.",
              "The next months still hurt: delays, angry customers, and public doubt.",
              "But once the runway existed, every small fix finally had a chance to matter.",
              "Under pressure, buying time is the first win, because time is real leverage."
            ].join("\n")
        : input.length === "short"
          ? [
              "In 1971, the U.S. banned TV and radio ads for cigarettes.",
              "Because ads were everywhere, the change hit fast.",
              "Then tobacco companies poured money into sports sponsorships and branded giveaways instead.",
              "It mattered because the ads disappeared from screens, but marketing didn’t.",
              "The battle moved to logos, events, and culture."
            ].join("\n")
          : [
              "In 1971, the U.S. banned TV and radio ads for cigarettes.",
              "Because ads were everywhere, the change hit fast and in public.",
              "Then tobacco companies shifted budgets into sports sponsorships, magazine placements, and branded giveaways.",
              "They bought naming rights, sponsored teams, and put logos on cars, billboards, and jackets.",
              "The message didn’t disappear. It just changed shape.",
              "It mattered because a screen ban pushed marketing into culture, where people stopped noticing it was marketing.",
              "Even if you never saw a commercial, you saw the brand at the track, in a magazine, or on a poster.",
              "That shift helped normalize the product without a 30-second ad slot.",
              "The consequence was long-lasting: you could stop the commercials and still lose the attention war."
            ].join("\n");

    return {
      title,
      body,
      post_type: input.mode === "TRIVIA" ? "fact" : "micro_essay",
      tags: [input.mode.toLowerCase(), "mock"],
      confidence,
      uncertainty_note: confidence === "medium" ? "Local mock mode; verify facts with real model." : null
    };
  }
}
