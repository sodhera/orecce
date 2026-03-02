## Generated Post Staging

This folder is the in-repo staging area for spec-driven carousel drafts that may later be loaded into Supabase.

- Store each batch as a dated markdown file for easy review.
- Keep the visible copy human-readable, with enough metadata to map into the app's `recces_essays.posts` shape later.
- For the current web feed shape, map spec `title` to feed `theme` during import.
- Large corpus runs now work in two stages:
  - Title/brief planning: `npm --prefix services/api/functions run corpus:titles -- --target-per-category 1000`
  - Full post rendering from approved briefs: `npm --prefix services/api/functions run corpus:posts`
- `corpus:generate` still exists and accepts `--stage briefs|posts|all`. The default stage is `briefs`.
- The corpus generator checkpoints into `services/api/docs/generated-posts/corpus/` as:
  - `manifest.json`
  - `briefs-review.md`
  - `historical_nerd.briefs.ndjson`
  - `historical_nerd.posts.ndjson`
  - `mental_model_library.briefs.ndjson`
  - `mental_model_library.posts.ndjson`
  - `recces-essays.json`
- `briefs-review.md` is the manual review document. Mark a brief with `[x]` on its approval line to include it in the posts stage.
- `recces-essays.json` is the import-oriented export. Its nested `posts` payload uses the raw database-style keys (`post_type`, `slide_number`) rather than the in-memory camelCase helpers.
- Anti-duplication is enforced in two stages:
  - topic briefs are rejected if their title/topic/angle is too similar to accepted briefs
  - rendered posts are rejected if their title/topic/slide text is too similar to accepted posts
- The generator also tries to balance templates within each category and rotates coverage buckets so the corpus does not collapse into the same few ideas.

Source spec for the first batch:

- `/Users/sirishjoshi/Downloads/orecce_generation_spec.pdf`
