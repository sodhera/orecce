import { LlmGateway, Repository } from "../types/contracts";
import { FeedMode, PostLength, StoredPost } from "../types/domain";
import { normalizeProfileKey } from "../utils/text";

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
    const profileKey = normalizeProfileKey(input.profile);
    const [recentTitles, preferences] = await Promise.all([
      this.repository.getRecentTitles({
        userId: input.userId,
        mode: input.mode,
        profileKey,
        limit: 3
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

    const generated = onChunk
      ? await this.llmGateway.generatePostStream(generationInput, onChunk)
      : await this.llmGateway.generatePost(generationInput);

    return this.repository.savePost({
      userId: input.userId,
      mode: input.mode,
      profile: input.profile,
      profileKey,
      length: input.length,
      payload: generated
    });
  }
}
