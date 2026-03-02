# Tier 1 Generation Runbook

This is the repeatable workflow for generating and importing the Tier 1 Orecce library posts.

## Goal

Turn the curated Tier 1 editorial libraries into:

- reviewable markdown drafts
- importable feed posts in Supabase `posts`
- followable Recce authors in Supabase `authors`
- mirrored long-form recommendation documents in Supabase `recces_essays`

## Current author and topic mapping

- `historical_nerd`
  - author: `Orecce Historical Nerd`
  - topic: `History & Biography`
  - recces_essays author_id: `orecce_historical_nerd`

- `mental_model_library`
  - author: `Orecce Mental Model Library`
  - topic: `Decision Making & Mental Models`
  - recces_essays author_id: `orecce_mental_model_library`

## End-to-end flow

1. Generate curated title libraries in one shot with `gpt-5.2-2025-12-11`.

```bash
npm --prefix services/api/functions run titles:curate -- --target-per-category 300 --model gpt-5.2-2025-12-11
```

Output:

- `services/api/docs/generated-posts/curated-title-libraries/curated-topic-library-review.md`
- `services/api/docs/generated-posts/curated-title-libraries/*.library.json`

2. Trim the libraries to Tier 1 only.

```bash
npm --prefix services/api/functions run titles:trim -- --tiers tier_1
```

Output:

- same curated library files, rewritten to Tier 1 only

3. Generate one sample post from each category for review.

```bash
npm --prefix services/api/functions run posts:tier1-samples -- --model gpt-5.2-2025-12-11
```

Output:

- `services/api/docs/generated-posts/curated-title-libraries/tier1-post-samples.md`

4. Generate the full Tier 1 corpus with the full model in parallel.

```bash
npm --prefix services/api/functions run posts:tier1-corpus -- --model gpt-5.2-2025-12-11 --concurrency 4
```

Output:

- `services/api/docs/generated-posts/tier1-corpus/tier1-post-corpus.md`
- `services/api/docs/generated-posts/tier1-corpus/historical_nerd.posts.ndjson`
- `services/api/docs/generated-posts/tier1-corpus/mental_model_library.posts.ndjson`
- `services/api/docs/generated-posts/tier1-corpus/manifest.json`

Notes:

- generation checkpoints by canonical Tier 1 topic
- reruns skip already-generated topics
- each post is generated from one canonical topic plus its approved variants
- prompts are tuned for Instagram-style square carousels, not essay slides
- slide formatting is markdown-first: short paragraphs, short bullet lists, numbered steps, and stronger hooks
- if a small set fails upstream, rerun the same command or target one category with `--category historical_nerd` or `--category mental_model_library`

5. Optional: generate a targeted resume instead of re-running the whole corpus.

```bash
npm --prefix services/api/functions run posts:tier1-corpus -- --model gpt-5.2-2025-12-11 --category mental_model_library --concurrency 1
```

Use this when one or two topics failed and the rest of the checkpointed corpus is already complete.

6. Replace the live Orecce corpus before re-importing.

```bash
npm --prefix services/api/functions run posts:tier1-delete
```

This removes only the generated Orecce Tier 1 feed posts and their mirrored `recces_essays` rows. It does not delete the Orecce author rows.

7. Optional legacy cleanup pass for an already-generated corpus.

```bash
npm --prefix services/api/functions run posts:tier1-rewrite -- --model gpt-5-mini
```

What this rewrite step does:

- reads the current Tier 1 corpus snapshot from `services/api/docs/generated-posts/tier1-corpus/*.posts.ndjson`
- fetches the matching live Orecce posts from Supabase `posts`
- rewrites each slide with `gpt-5-mini` for lighter, cleaner copy while preserving the original voice and structure
- keeps the same canonical topic, metadata, slide count, and slide roles
- rewrites the local Tier 1 corpus files so the repo stays aligned with the live feed import source

Formatting guidance used in the rewrite:

- one clear idea per slide
- preserve the original structure, meaning, and tone
- trim repetition and drag rather than forcing bullet-heavy formatting
- target roughly 24 to 60 words per slide
- prefer cleaner phrasing over aggressive compression

8. Import the generated Tier 1 corpus into Supabase.

```bash
npm --prefix services/api/functions run posts:tier1-import
```

This importer does four things:

- ensures the mapped author rows exist in `authors`
- upserts generated carousels into the deployed feed `posts` table
- refreshes `post_topics` links for the imported post ids
- mirrors the same corpus into `recces_essays`

Output:

- `services/api/docs/generated-posts/tier1-corpus/supabase-import-report.md`

## Feed-table shape used by the importer

The deployed app feed currently uses the live Supabase `posts` table with these observed columns:

- `id`
- `author_id`
- `post_type`
- `theme`
- `source_title`
- `slides`
- `tags`
- `global_popularity_score`
- `published_at`
- `created_at`
- `likes_count`
- `source_url`
- `topics`

The importer targets that live shape directly.

## Re-running safely

Reruns are intended to be idempotent:

- author ids are stable
- feed post ids are derived from `category + canonical_topic`
- `recces_essays` rows are upserted by `author_id + essay_id`
- `post_topics` links are deleted and rebuilt for the imported post ids
- corpus generation checkpoints after each successful topic, so restarts only need to fill the missing topics

If you change the canonical topic names, the stable ids will change too. That will create new feed posts unless you migrate the ids intentionally.

## Validation

Before pushing changes:

```bash
./services/api/scripts/prepush-check.sh
```

## Operational caveats

- These import scripts use the Supabase service-role key from `services/api/functions/.env`.
- The main deployed feed reads from `posts`, not `recces_essays`.
- `recces_essays` is imported as a parallel store for the separate Recces recommendation surface.
- New authors will appear in Discover as followable Recces. Users still need to follow them to see those posts in the main personalized feed.
