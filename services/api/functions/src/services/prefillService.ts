import { LlmGateway, Repository } from "../types/contracts";
import { StoredPost, UserPrefillSummary } from "../types/domain";
import { ApiError } from "../types/errors";
import { logError, logInfo } from "../utils/logging";
import { normalizeProfileKey } from "../utils/text";
import { buildDefaultPrefillBlueprint } from "./prefillBlueprint";

interface GeneratePrefillsInput {
  userId: string;
  postsPerMode: number;
  forceReplace?: boolean;
}

export const COMMON_PREFILL_DATASET_USER_ID = "common_prefill_dataset";

export class PrefillService {
  private sharedDatasetLoad: Promise<UserPrefillSummary> | null = null;

  constructor(
    private readonly repository: Repository,
    private readonly llmGateway: LlmGateway
  ) {}

  async ensureCommonDataset(postsPerMode: number): Promise<UserPrefillSummary> {
    const common = await this.repository.getOrCreateUser({ userId: COMMON_PREFILL_DATASET_USER_ID });
    if (common.prefillStatus === "ready" && common.prefillPostCount > 0) {
      return {
        postCount: common.prefillPostCount,
        chunkCount: common.prefillChunkCount,
        totalBytes: common.prefillBytes,
        generatedAtMs: common.prefillUpdatedAtMs ?? common.updatedAtMs
      };
    }

    if (!this.sharedDatasetLoad) {
      this.sharedDatasetLoad = this.generateGenericPrefills({
        userId: COMMON_PREFILL_DATASET_USER_ID,
        postsPerMode
      }).finally(() => {
        this.sharedDatasetLoad = null;
      });
    }
    return this.sharedDatasetLoad;
  }

  async ensureUserPrefillsFromCommonDataset(input: GeneratePrefillsInput): Promise<UserPrefillSummary> {
    const user = await this.repository.getOrCreateUser({ userId: input.userId });
    if (!input.forceReplace && user.prefillStatus === "ready" && user.prefillPostCount > 0) {
      return {
        postCount: user.prefillPostCount,
        chunkCount: user.prefillChunkCount,
        totalBytes: user.prefillBytes,
        generatedAtMs: user.prefillUpdatedAtMs ?? user.updatedAtMs
      };
    }

    const startedAtMs = Date.now();
    const postsPerMode = Math.max(1, Math.min(60, input.postsPerMode));
    await this.repository.updateUserPrefillStatus(input.userId, "generating");

    try {
      await this.ensureCommonDataset(postsPerMode);
      const commonPosts = await this.repository.listAllPrefillPosts(COMMON_PREFILL_DATASET_USER_ID);
      if (!commonPosts.length) {
        throw new ApiError(500, "common_dataset_empty", "Common prefill dataset is empty.");
      }

      const clonedPosts = commonPosts.map((post, index) => ({
        ...post,
        userId: input.userId,
        createdAtMs: startedAtMs + index
      }));

      const summary = await this.repository.replaceUserPrefillPosts({
        userId: input.userId,
        posts: clonedPosts
      });
      await this.repository.updateUserPrefillStatus(input.userId, "ready", summary);

      logInfo("prefill.clone.success", {
        user_id: input.userId,
        source_user_id: COMMON_PREFILL_DATASET_USER_ID,
        total_posts: summary.postCount,
        total_bytes: summary.totalBytes,
        chunk_count: summary.chunkCount,
        duration_ms: Date.now() - startedAtMs
      });

      return summary;
    } catch (error) {
      logError("prefill.clone.error", {
        user_id: input.userId,
        source_user_id: COMMON_PREFILL_DATASET_USER_ID,
        duration_ms: Date.now() - startedAtMs,
        message: error instanceof Error ? error.message : String(error)
      });
      await this.repository.updateUserPrefillStatus(input.userId, "error");
      throw error;
    }
  }

  async regenerateCommonDatasetAndCopyToUser(input: GeneratePrefillsInput): Promise<UserPrefillSummary> {
    const postsPerMode = Math.max(1, Math.min(60, input.postsPerMode));
    await this.generateGenericPrefills({
      userId: COMMON_PREFILL_DATASET_USER_ID,
      postsPerMode
    });
    return this.ensureUserPrefillsFromCommonDataset({
      userId: input.userId,
      postsPerMode
    });
  }

  async generateGenericPrefills(input: GeneratePrefillsInput): Promise<UserPrefillSummary> {
    const startedAtMs = Date.now();
    const postsPerMode = Math.max(1, Math.min(60, input.postsPerMode));

    await this.repository.updateUserPrefillStatus(input.userId, "generating");
    const preferences = await this.repository.getPromptPreferences(input.userId);
    const blueprint = buildDefaultPrefillBlueprint(postsPerMode);
    const generated: StoredPost[] = [];
    const recentByKey = new Map<string, string[]>();
    let sequence = 0;

    try {
      for (const plan of blueprint) {
        const profileKey = normalizeProfileKey(plan.profile);
        const modeKey = `${plan.mode}:${profileKey}`;

        for (let i = 0; i < plan.count; i++) {
          const recentTitles = recentByKey.get(modeKey) ?? [];
          const post = await this.llmGateway.generatePost({
            mode: plan.mode,
            profile: plan.profile,
            length: plan.length,
            recentTitles,
            preferences
          });

          sequence += 1;
          generated.push({
            id: `prefill-${plan.mode.toLowerCase()}-${sequence}`,
            userId: input.userId,
            mode: plan.mode,
            profile: plan.profile,
            profileKey,
            length: plan.length,
            title: post.title,
            body: post.body,
            post_type: post.post_type,
            tags: post.tags,
            confidence: post.confidence,
            uncertainty_note: post.uncertainty_note,
            createdAtMs: startedAtMs + sequence
          });

          recentByKey.set(modeKey, [post.title, ...recentTitles].slice(0, 5));
        }
      }

      const summary = await this.repository.replaceUserPrefillPosts({
        userId: input.userId,
        posts: generated
      });
      await this.repository.updateUserPrefillStatus(input.userId, "ready", summary);

      logInfo("prefill.generate.success", {
        user_id: input.userId,
        posts_per_mode: postsPerMode,
        total_posts: summary.postCount,
        total_bytes: summary.totalBytes,
        chunk_count: summary.chunkCount,
        duration_ms: Date.now() - startedAtMs
      });

      return summary;
    } catch (error) {
      logError("prefill.generate.error", {
        user_id: input.userId,
        posts_per_mode: postsPerMode,
        duration_ms: Date.now() - startedAtMs,
        message: error instanceof Error ? error.message : String(error)
      });
      await this.repository.updateUserPrefillStatus(input.userId, "error");
      throw error;
    }
  }
}
