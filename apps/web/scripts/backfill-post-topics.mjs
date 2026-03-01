import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 500;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const [
    { data: posts, error: postsError },
    { data: topics, error: topicsError },
  ] = await Promise.all([
    supabase.from("posts").select("id, topics"),
    supabase.from("topics").select("id, name"),
  ]);

  if (postsError) {
    throw new Error(postsError.message);
  }
  if (topicsError) {
    throw new Error(topicsError.message);
  }

  const topicIdByName = new Map(
    (topics ?? []).map((topic) => [String(topic.name), String(topic.id)]),
  );

  const rows = [];
  const missingTopicNames = new Set();

  for (const post of posts ?? []) {
    const postId = String(post.id ?? "").trim();
    if (!postId) {
      continue;
    }

    const topicNames = Array.isArray(post.topics) ? post.topics : [];
    for (const topicName of topicNames) {
      const normalizedTopicName = String(topicName ?? "").trim();
      if (!normalizedTopicName) {
        continue;
      }

      const topicId = topicIdByName.get(normalizedTopicName);
      if (!topicId) {
        missingTopicNames.add(normalizedTopicName);
        continue;
      }

      rows.push({
        post_id: postId,
        topic_id: topicId,
      });
    }
  }

  if (missingTopicNames.size > 0) {
    throw new Error(
      `Topics missing from public.topics: ${Array.from(missingTopicNames).sort().join(", ")}`,
    );
  }

  let inserted = 0;
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await supabase
      .from("post_topics")
      .upsert(batch, { onConflict: "post_id,topic_id", ignoreDuplicates: true });

    if (error) {
      throw new Error(error.message);
    }

    inserted += batch.length;
  }

  console.log(
    JSON.stringify(
      {
        posts: posts?.length ?? 0,
        topics: topics?.length ?? 0,
        postTopicPairsProcessed: inserted,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
