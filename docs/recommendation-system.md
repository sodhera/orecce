# Recommendation System (Mobile + Web)

## Overview
Both Home feeds now prioritize **novel content** and suppress repeats:

- Any post the user has interacted with is excluded from the active feed.
- Remaining posts are ranked by a novelty-first score.
- Topic-level interaction history reduces repeated exposure to the same topic.

## Interaction Signals
An interaction marks a post as "seen/interacted" and increments topic interaction weight.

### Mobile (`apps/mobile/src/screens/HomeScreen.tsx`)
Tracked interactions:
- Open post details
- Upvote / downvote
- Save / unsave
- Share

### Web (`apps/web/src/components/Feed.tsx` + `apps/web/src/components/PostCard.tsx`)
Tracked interactions:
- Like / unlike
- Save / unsave
- Carousel slide flip
- Source link click

## Ranking Logic

## 1) Filter already interacted posts
Posts with IDs in `interactedPostIds` are removed from the visible feed.

## 2) Rank unseen posts

### Mobile score
In `rankNovelRecommendations`:
- `noveltyScore = 1 / (1 + topicPenalty)`
- `engagementScore = postVotes / maxVotes`
- `diversityBoost = deterministic small boost`
- Final score:
  - `0.72 * noveltyScore`
  - `0.23 * engagementScore`
  - `+ diversityBoost`

### Web score
In `rankNovelRecommendations`:
- `noveltyScore = 1 / (1 + topicPenalty)`
- `recencyScore = normalized(createdAtMs)`
- `diversityBoost = deterministic small boost`
- Final score:
  - `0.70 * noveltyScore`
  - `0.26 * recencyScore`
  - `+ diversityBoost`

## Why novelty-first?
This prevents the feed from feeling repetitive after user interaction and biases discovery toward untouched topics/content.

## Reset Behavior
When no unseen posts remain:
- Feed shows an empty state.
- User can tap **Reset recommendations** to clear interaction history and replay the feed.

State reset clears:
- `interactedPostIds`
- `topicInteractionCounts`

## Current Scope
- All logic is client-side, session-local UI state.
- No server persistence of recommendation state yet.

## Suggested Next Step (Backend)
To make this durable across devices/sessions:
- Persist interaction events per user in backend.
- Compute novelty/ranking server-side (or hybrid with cached client hints).
- Return unseen-first pages directly from API.
