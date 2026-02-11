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
import { logError, logInfo, redactSecret } from "../utils/logging";
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

interface UpstreamContext {
  input: LlmGenerationInput;
  stream: boolean;
  retriesLeft: number;
}

export class OpenAiGateway implements LlmGateway {
  public async generatePost(input: LlmGenerationInput): Promise<GeneratedPost> {
    return this.generateWithRetry(input, 2);
  }

  public async generatePostStream(input: LlmGenerationInput, onChunk: StreamChunkHandler): Promise<GeneratedPost> {
    return this.generateStreamWithRetry(input, onChunk, 2);
  }

  private createRequestBody(input: LlmGenerationInput, stream: boolean): Record<string, unknown> {
    const model = getOpenAiModel();
    const isGpt5Family = model.toLowerCase().startsWith("gpt-5");
    const isGpt5Nano = model.toLowerCase().startsWith("gpt-5-nano");
    const isGpt5Lightweight =
      model.toLowerCase().startsWith("gpt-5-mini") || isGpt5Nano;
    const reasoningEffort = isGpt5Lightweight ? "minimal" : "low";
    const maxOutputTokens =
      input.length === "short" ? (isGpt5Nano ? 640 : isGpt5Family ? 320 : 220) : isGpt5Nano ? 920 : isGpt5Family ? 520 : 380;
    const postSchema = {
      type: "object",
      additionalProperties: false,
      required: ["title", "body", "post_type", "tags", "confidence", "uncertainty_note"],
      properties: {
        title: { type: "string" },
        body: { type: "string" },
        post_type: { type: "string" },
        tags: {
          type: "array",
          items: { type: "string" }
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"]
        },
        uncertainty_note: {
          anyOf: [{ type: "string" }, { type: "null" }]
        }
      }
    };
    return {
      model,
      ...(isGpt5Family ? {} : { temperature: getGenerationTemperature() }),
      ...(isGpt5Family ? { reasoning: { effort: reasoningEffort } } : {}),
      max_output_tokens: maxOutputTokens,
      stream,
      text: {
        format: {
          type: "json_schema",
          name: "generated_post",
          schema: postSchema,
          strict: true
        }
      },
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

  private createUpstreamError(responseStatus: number, upstreamBody: string, apiKey: string): ApiError {
    const details = {
      upstream_status: responseStatus,
      upstream_body: upstreamBody.slice(0, 1200),
      api_key_hint: redactSecret(apiKey)
    };
    if (responseStatus === 401 || responseStatus === 403) {
      return new ApiError(
        502,
        "llm_auth_error",
        "OpenAI authentication failed. Check OPENAI_API_KEY in services/api/functions/.env and restart emulators.",
        details
      );
    }
    if (responseStatus === 429) {
      return new ApiError(502, "llm_rate_limited", "OpenAI rate limited the request. Retry shortly.", details);
    }
    return new ApiError(502, "llm_upstream_error", `OpenAI request failed (${responseStatus}).`, details);
  }

  private async postResponses(body: Record<string, unknown>, context: UpstreamContext): Promise<Response> {
    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      throw new ApiError(500, "missing_openai_key", "OpenAI key is missing. Set OPENAI_API_KEY or firebase functions config openai.key.");
    }

    const upstreamStartedAtMs = Date.now();
    logInfo("llm.upstream.start", {
      mode: context.input.mode,
      profile: context.input.profile,
      length: context.input.length,
      stream: context.stream,
      retries_left: context.retriesLeft,
      model: getOpenAiModel(),
      base_url: getOpenAiBaseUrl(),
      recent_titles_count: context.input.recentTitles.length
    });

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
      logError("llm.upstream.error", {
        status: response.status,
        duration_ms: Date.now() - upstreamStartedAtMs,
        mode: context.input.mode,
        profile: context.input.profile,
        length: context.input.length,
        stream: context.stream,
        retries_left: context.retriesLeft,
        upstream_body: text.slice(0, 800)
      });
      throw this.createUpstreamError(response.status, text, apiKey);
    }

    logInfo("llm.upstream.success", {
      status: response.status,
      duration_ms: Date.now() - upstreamStartedAtMs,
      mode: context.input.mode,
      profile: context.input.profile,
      length: context.input.length,
      stream: context.stream,
      retries_left: context.retriesLeft
    });

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
      logInfo("llm.mock.generate", {
        mode: input.mode,
        profile: input.profile,
        length: input.length,
        stream: false
      });
      return this.generateMock(input);
    }

    const response = await this.postResponses(this.createRequestBody(input, false), {
      input,
      stream: false,
      retriesLeft
    });

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
      logInfo("llm.mock.generate", {
        mode: input.mode,
        profile: input.profile,
        length: input.length,
        stream: true
      });
      const mock = this.generateMock(input);
      onChunk(mock.body);
      return mock;
    }

    const response = await this.postResponses(this.createRequestBody(input, true), {
      input,
      stream: true,
      retriesLeft
    });
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
    const variantSeed = input.recentTitles.length;
    const pick = <T>(variants: T[]): T => variants[variantSeed % variants.length];

    if (input.mode === "BIOGRAPHY") {
      const shortVariants = [
        {
          title: `${profileLabel}'s hardest week became the turning point`,
          body: [
            `${profileLabel} hit a period where a single bad decision could break the company.`,
            "Cash was tight, pressure was public, and every delay made the next week harder.",
            "Instead of chasing ten fixes, leadership narrowed to one urgent path and moved fast.",
            "That move did not look heroic in the moment. It looked risky and uncomfortable.",
            "The lesson was simple: focus beats motion when the clock is against you."
          ]
        },
        {
          title: `The unpopular call ${profileLabel} made before things improved`,
          body: [
            `${profileLabel} made a decision that annoyed customers, partners, or staff in the short term.`,
            "People judged it as too harsh because the downside was immediate and visible.",
            "But the decision protected resources for the one thing that had to work long term.",
            "Months later, that choice looked different because it preserved room to execute.",
            "The insight: short-term pain is sometimes the price of strategic survival."
          ]
        },
        {
          title: `${profileLabel} won by cutting, not adding`,
          body: [
            "When results stalled, the instinct around the team was to add more projects.",
            `${profileLabel} went the other way and removed priorities until one core bet stayed.`,
            "That created clarity, faster decisions, and fewer internal collisions.",
            "Progress came not from working harder everywhere, but from stopping work in most places.",
            "The key lesson: subtraction is often the fastest path to momentum."
          ]
        },
        {
          title: `Why ${profileLabel} treated timing as a product decision`,
          body: [
            `${profileLabel} understood that a good idea can still fail if launched at the wrong moment.`,
            "So the team held back, reworked details, and waited for a tighter window.",
            "Observers saw delay; internally it was a deliberate tradeoff between speed and readiness.",
            "When the moment came, execution looked cleaner and trust was easier to earn.",
            "The takeaway: timing is not luck; it is part of the strategy."
          ]
        }
      ];

      const mediumVariants = [
        {
          title: `The constraint that forced ${profileLabel} into better strategy`,
          body: [
            `${profileLabel} faced a period where money, time, and credibility were all constrained at once.`,
            "Because options were limited, leadership had to decide what truly mattered and what could wait.",
            "This forced a painful prioritization cycle: cut side bets, defend the core, and communicate hard truths.",
            "The short-term optics were rough. Outsiders saw instability while insiders were rebuilding discipline.",
            "Then a few focused wins changed the narrative. The same plan that looked too narrow started looking smart.",
            "The deeper reason was not luck. Constraints removed noise and exposed the highest-leverage decisions.",
            "From there, execution improved because teams finally pulled in one direction.",
            "A useful lesson from that phase: pressure does not always shrink you; sometimes it sharpens you.",
            "When resources are thin, clarity becomes a competitive advantage."
          ]
        },
        {
          title: `${profileLabel} changed outcomes by changing sequence`,
          body: [
            "At one point, the plan had too many moving parts and no clear order of operations.",
            `${profileLabel} shifted the sequence: solve the bottleneck first, postpone visible but lower-impact work.`,
            "That frustrated people who expected headline progress right away.",
            "But sequence mattered more than optics. Removing the bottleneck increased the speed of every later step.",
            "As execution improved, confidence inside and outside the company started to recover.",
            "The visible success looked sudden, but it came from earlier, less glamorous decisions.",
            "This is a repeat pattern in leadership stories: doing the right thing in the wrong order still fails.",
            "The insight is practical: choose sequence with discipline, and momentum compounds."
          ]
        },
        {
          title: `The credibility move ${profileLabel} made when trust was low`,
          body: [
            `${profileLabel} hit a moment where promises were no longer enough to convince people.`,
            "So instead of more messaging, the team changed behavior in measurable ways.",
            "They simplified goals, reported progress more clearly, and removed work that did not create user value.",
            "That did not create instant applause, but it reduced confusion and rebuilt trust step by step.",
            "As credibility returned, better partners and better opportunities became available.",
            "The shift was subtle: trust was treated as an outcome of execution, not marketing.",
            "In biography terms, this is often the hidden turning point people miss.",
            "The lesson is durable: when trust is weak, fewer claims and better follow-through beat louder storytelling."
          ]
        }
      ];

      const picked = input.length === "short" ? pick(shortVariants) : pick(mediumVariants);
      return {
        title: picked.title,
        body: picked.body.join("\n"),
        post_type: "micro_essay",
        tags: [input.mode.toLowerCase(), "mock", "story"],
        confidence: "medium",
        uncertainty_note: "Local mock mode; switch to real OpenAI for fresh factual variation."
      };
    }

    if (input.mode === "TRIVIA") {
      const shortVariants = [
        {
          title: `Most people miss this hidden part of ${profileLabel}`,
          body: [
            "A surprising fact often has a hidden second layer that changes how you read it.",
            "The first layer is the headline number or event everyone repeats.",
            "The second layer is the system behind it: incentives, constraints, and timing.",
            `For ${profileLabel}, that second layer is usually where the real story sits.`,
            "That is why simple facts can still change how you think."
          ]
        },
        {
          title: `This common belief about ${profileLabel} is incomplete`,
          body: [
            "People remember neat summaries, but reality is usually messier and more useful.",
            `In ${profileLabel}, one detail that looks minor often explains the big result.`,
            "When you add that detail, the outcome looks less random and more understandable.",
            "That shift is valuable because better models create better decisions.",
            "Good trivia is not just surprising. It upgrades your mental map."
          ]
        }
      ];
      const picked = pick(shortVariants);
      return {
        title: picked.title,
        body: picked.body.join("\n"),
        post_type: "fact",
        tags: [input.mode.toLowerCase(), "mock", "did-you-know"],
        confidence: "high",
        uncertainty_note: null
      };
    }

    const nicheShortVariants = [
      {
        title: `Why ${profileLabel} still hits people in the gut`,
        body: [
          `${profileLabel} works because it combines memory, identity, and mood in one frame.`,
          "You are not just recalling content. You are recalling who you were in that moment.",
          "That emotional shortcut is why small references can feel unexpectedly powerful.",
          "Strong niche content names that feeling before people can explain it themselves.",
          "When the feeling is accurate, sharing happens naturally."
        ]
      },
      {
        title: `${profileLabel} is more than nostalgia. It is social glue.`,
        body: [
          "Certain niche themes spread fast because they create instant shared context.",
          `With ${profileLabel}, one detail can trigger a whole era in someone's mind.`,
          "That creates belonging, not just entertainment.",
          "People share it to say, 'You lived this too,' without writing a long explanation.",
          "That is why the best niche posts feel personal and collective at the same time."
        ]
      }
    ];

    const nicheMediumVariants = [
      {
        title: `The pattern behind why ${profileLabel} keeps resurfacing`,
        body: [
          "Niche waves return when culture gets too broad and people crave identity-level specificity.",
          `${profileLabel} offers that specificity in a compressed form: references, mood, and social memory.`,
          "Each post works like a recognition test. If someone gets it instantly, they feel included.",
          "That inclusion effect is emotionally sticky, which is why engagement can spike without hard facts.",
          "But it only works when details are precise. Generic nostalgia feels flat and forgettable.",
          "The strongest niche writing picks one vivid scene, builds tension around it, then lands a shared truth.",
          "Readers stay because they feel understood, not because they were lectured.",
          "In practice, niche content wins when it turns private memory into public language."
        ]
      }
    ];

    const nichePicked = input.length === "short" ? pick(nicheShortVariants) : pick(nicheMediumVariants);
    return {
      title: nichePicked.title,
      body: nichePicked.body.join("\n"),
      post_type: "micro_essay",
      tags: [input.mode.toLowerCase(), "mock", "vibe"],
      confidence: "high",
      uncertainty_note: null
    };
  }
}
