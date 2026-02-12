import { LlmGateway, Repository } from "../types/contracts";
import { FeedMode, GeneratedPost, PostLength, StoredPost } from "../types/domain";
import { logError, logInfo } from "../utils/logging";
import { countWords, normalizeProfileKey } from "../utils/text";

interface GenerateNextPostInput {
  userId: string;
  mode: FeedMode;
  profile: string;
  length: PostLength;
}

export class PostGenerationService {
  constructor(
    private readonly repository: Repository,
    private readonly llmGateway: LlmGateway
  ) {}

  async generateNextPost(input: GenerateNextPostInput): Promise<StoredPost> {
    return this.generateCore(input);
  }

  async generateNextPostStream(
    input: GenerateNextPostInput,
    onChunk: (chunk: string) => void
  ): Promise<StoredPost> {
    return this.generateCore(input, onChunk);
  }

  private async generateCore(input: GenerateNextPostInput, onChunk?: (chunk: string) => void): Promise<StoredPost> {
    const startedAtMs = Date.now();
    logInfo("post.generate.start", {
      user_id: input.userId,
      mode: input.mode,
      profile: input.profile,
      length: input.length,
      stream: Boolean(onChunk)
    });

    const profileKey = normalizeProfileKey(input.profile);
    const [recentTitles, preferences] = await Promise.all([
      this.repository.getRecentTitles({
        userId: input.userId,
        mode: input.mode,
        profileKey,
        limit: 5
      }),
      this.repository.getPromptPreferences(input.userId)
    ]);

    const generationInput = {
      mode: input.mode,
      profile: input.profile,
      length: input.length,
      recentTitles,
      preferences
    };

    const llmStartedAtMs = Date.now();
    try {
      const generatedRaw = onChunk
        ? await this.llmGateway.generatePostStream(generationInput, onChunk)
        : await this.llmGateway.generatePost(generationInput);
      const generated = this.sanitizeGeneratedPost(generatedRaw, input.mode);

      const stored = await this.repository.savePost({
        userId: input.userId,
        mode: input.mode,
        profile: input.profile,
        profileKey,
        length: input.length,
        payload: generated
      });

      logInfo("post.generate.success", {
        user_id: input.userId,
        post_id: stored.id,
        mode: stored.mode,
        profile: stored.profile,
        length: stored.length,
        recent_titles_used: recentTitles.length,
        llm_duration_ms: Date.now() - llmStartedAtMs,
        total_duration_ms: Date.now() - startedAtMs
      });

      return stored;
    } catch (error) {
      logError("post.generate.failure", {
        user_id: input.userId,
        mode: input.mode,
        profile: input.profile,
        length: input.length,
        stream: Boolean(onChunk),
        llm_duration_ms: Date.now() - llmStartedAtMs,
        total_duration_ms: Date.now() - startedAtMs,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private sanitizeGeneratedPost(post: GeneratedPost, mode: FeedMode): GeneratedPost {
    if (mode !== "TRIVIA") {
      return post;
    }

    return {
      ...post,
      body: this.compactTriviaBody(post.body)
    };
  }

  private compactTriviaBody(rawBody: string): string {
    const sentences = this.splitSentences(rawBody);
    const selectedSentences = sentences.slice(0, 2);
    let compact = selectedSentences.join(" ").replace(/\s+/g, " ").trim();

    if (!compact) {
      compact = String(rawBody ?? "").replace(/\s+/g, " ").trim();
    }

    const maxWords = 42;
    if (countWords(compact) > maxWords) {
      compact = compact.split(/\s+/).slice(0, maxWords).join(" ").trim();
    }

    if (compact && !/[.!?]$/.test(compact)) {
      compact = `${compact}.`;
    }

    return compact;
  }

  private splitSentences(rawText: string): string[] {
    const normalized = String(rawText ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }

    const matches = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return (matches ?? []).map((sentence) => sentence.trim()).filter(Boolean);
  }
}
