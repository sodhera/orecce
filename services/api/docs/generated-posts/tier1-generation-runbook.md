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

4. Generate the full Tier 1 corpus with `gpt-5-mini`.

```bash
npm --prefix services/api/functions run posts:tier1-corpus -- --model gpt-5-mini
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

5. Tighten the existing Tier 1 corpus for compact carousels.

```bash
npm --prefix services/api/functions run posts:tier1-rewrite -- --model gpt-5-mini
```

What this rewrite step does:

- reads the current Tier 1 corpus snapshot from `services/api/docs/generated-posts/tier1-corpus/*.posts.ndjson`
- fetches the matching live Orecce posts from Supabase `posts`
- rewrites each slide with `gpt-5-mini` for shorter, markdown-friendly formatting
- keeps the same canonical topic, metadata, slide count, and slide roles
- rewrites the local Tier 1 corpus files so the repo stays aligned with the live feed import source

Formatting constraints used in the rewrite:

- one idea per slide
- short hook and short closer
- body slides use short paragraphs, numbered points, or bullets
- target roughly 18 to 42 words per slide
- keep slide text under 220 characters

6. Import the generated Tier 1 corpus into Supabase.

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
