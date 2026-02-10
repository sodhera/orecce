import { OpenAiGateway } from "../src/llm/openAiGateway";
import { PostGenerationService } from "../src/services/postGenerationService";
import { FeedMode, PostLength } from "../src/types/domain";
import { loadDotEnv } from "./loadDotEnv";
import { InMemoryRepository } from "./inMemoryRepository";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage:",
      "  npm --prefix functions run dev:generate -- --mode BIOGRAPHY --profile \"Steve Jobs\"",
      "",
      "Options:",
      "  --user <id>              (default: local-user)",
      "  --mode <BIOGRAPHY|TRIVIA|NICHE> (default: BIOGRAPHY)",
      "  --profile <string>       (default: Steve Jobs)",
      "  --length <short|medium>  (default: short)",
      "  --bio <string>           (optional biography instructions)",
      "  --niche <string>         (optional niche instructions)",
      "  --count <n>              (default: 1)",
      "  --json                   (print JSON only)"
    ].join("\n")
  );
}

function asMode(value: string): FeedMode {
  const v = value.toUpperCase().trim();
  if (v !== "BIOGRAPHY" && v !== "TRIVIA" && v !== "NICHE") {
    throw new Error(`Invalid --mode: ${value}`);
  }
  return v;
}

function asLength(value: string): PostLength {
  const v = value.trim().toLowerCase();
  if (v !== "short" && v !== "medium") {
    throw new Error(`Invalid --length: ${value}`);
  }
  return v;
}

async function main(): Promise<void> {
  loadDotEnv();

  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const userId = String(args.user ?? "local-user");
  const mode = asMode(String(args.mode ?? "BIOGRAPHY"));
  const profile = String(args.profile ?? "Steve Jobs");
  const length = asLength(String(args.length ?? "short"));
  const biographyInstructions = typeof args.bio === "string" ? args.bio : undefined;
  const nicheInstructions = typeof args.niche === "string" ? args.niche : undefined;
  const count = Math.max(1, Number(args.count ?? "1"));
  const jsonOnly = Boolean(args.json);

  const repository = new InMemoryRepository();
  if (biographyInstructions || nicheInstructions) {
    await repository.setPromptPreferences(userId, {
      biographyInstructions: biographyInstructions ?? "",
      nicheInstructions: nicheInstructions ?? ""
    });
  }

  const gateway = new OpenAiGateway();
  const service = new PostGenerationService(repository, gateway);

  for (let i = 0; i < count; i++) {
    const post = await service.generateNextPost({ userId, mode, profile, length });
    if (jsonOnly) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(post, null, 2));
      continue;
    }

    // eslint-disable-next-line no-console
    console.log(`\n${post.title}\n`);
    // eslint-disable-next-line no-console
    console.log(post.body);
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        `tags: ${post.tags.join(", ")}`,
        `confidence: ${post.confidence}`,
        post.uncertainty_note ? `uncertainty_note: ${post.uncertainty_note}` : "uncertainty_note: null"
      ].join("\n")
    );
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

