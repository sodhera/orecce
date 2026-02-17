import { SportId } from "./sportsNewsSources";
import { FetchSportsStoriesInput, SportsNewsService, SportsStory } from "./sportsNewsService";
import { UserSportsNewsRepository } from "./userSportsNewsRepository";

interface UserSportsNewsServiceDeps {
  sportsNewsService: SportsNewsService;
  repository: UserSportsNewsRepository;
}

interface RefreshUserSportsStoriesInput {
  userId: string;
  sport: string;
  limit: number;
  userAgent: string;
  feedTimeoutMs: number;
  articleTimeoutMs: number;
}

export class UserSportsNewsService {
  private readonly sportsNewsService: SportsNewsService;
  private readonly repository: UserSportsNewsRepository;

  constructor(deps: UserSportsNewsServiceDeps) {
    this.sportsNewsService = deps.sportsNewsService;
    this.repository = deps.repository;
  }

  async refreshUserStories(input: RefreshUserSportsStoriesInput): Promise<{ sport: SportId; stories: SportsStory[] }> {
    const fetched = await this.sportsNewsService.fetchLatestStories({
      sport: input.sport,
      limit: input.limit,
      userAgent: input.userAgent,
      feedTimeoutMs: input.feedTimeoutMs,
      articleTimeoutMs: input.articleTimeoutMs
    } satisfies FetchSportsStoriesInput);

    await this.repository.replaceStoriesForUser(input.userId, fetched.sport, fetched.stories);
    return fetched;
  }

  async listUserStories(userId: string, sport: string, limit: number): Promise<{ sport: SportId; stories: SportsStory[] }> {
    const normalized = String(sport ?? "").trim().toLowerCase();
    if (normalized !== "football") {
      throw new Error("Unsupported sport. Supported sports: football.");
    }
    const stories = await this.repository.listStoriesForUser(userId, "football", limit);
    return {
      sport: "football",
      stories
    };
  }
}
