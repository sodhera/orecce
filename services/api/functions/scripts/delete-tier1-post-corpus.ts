import { createClient } from "@supabase/supabase-js";
import { loadDotEnv } from "./loadDotEnv";

const AUTHOR_NAMES = ["Orecce Historical Nerd", "Orecce Mental Model Library"] as const;
const RECCES_AUTHOR_IDS = ["orecce_historical_nerd", "orecce_mental_model_library"] as const;

async function main(): Promise<void> {
  loadDotEnv();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });

  const { data: authors, error: authorsError } = await supabase
    .from("authors")
    .select("id,name")
    .in("name", [...AUTHOR_NAMES]);
  if (authorsError) {
    throw authorsError;
  }

  const authorIds = (authors ?? []).map((author) => String(author.id));
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id")
    .in("author_id", authorIds.length ? authorIds : ["00000000-0000-0000-0000-000000000000"]);
  if (postsError) {
    throw postsError;
  }

  const postIds = (posts ?? []).map((post) => String(post.id));
  if (postIds.length) {
    const { error: deleteLinksError } = await supabase.from("post_topics").delete().in("post_id", postIds);
    if (deleteLinksError) {
      throw deleteLinksError;
    }
    const { error: deletePostsError } = await supabase.from("posts").delete().in("id", postIds);
    if (deletePostsError) {
      throw deletePostsError;
    }
  }

  const { error: deleteReccesError } = await supabase
    .from("recces_essays")
    .delete()
    .in("author_id", [...RECCES_AUTHOR_IDS]);
  if (deleteReccesError) {
    throw deleteReccesError;
  }

  console.log(
    `Deleted ${postIds.length} Orecce Tier 1 feed posts and cleared mirrored recces rows for ${RECCES_AUTHOR_IDS.length} author ids.`
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
