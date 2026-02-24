import { ReccesEssayDocument, ReccesRepository } from "../src/recces/types";
import { buildReccesPostId, parseReccesPostId } from "../src/recces/postId";

const STATIC_DATASET: Record<string, ReccesEssayDocument[]> = {
  paul_graham: [
    {
      essayId: "startup",
      sourceTitle: "How to Start a Startup",
      posts: [
        {
          theme: "Understand Users",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Great founders talk directly to users and learn from support conversations."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "User pain points reveal what to build next and what to delete."
            }
          ]
        },
        {
          theme: "Launch Early",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Launching early starts the real feedback loop."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "Ship, learn, iterate beats plan, polish, pray."
            }
          ]
        },
        {
          theme: "Customer Support",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Support is product discovery in disguise."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "Founders who handle support understand users much faster."
            }
          ]
        }
      ]
    },
    {
      essayId: "fundraising",
      sourceTitle: "Fundraising and Growth",
      posts: [
        {
          theme: "Fundraising Strategy",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Raise when you have momentum and clear story."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "Investor updates create trust and improve odds in the next round."
            }
          ]
        },
        {
          theme: "Investor Communication",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Consistent investor communication compounds over time."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "Clear metrics, honest risks, and concrete asks build credibility."
            }
          ]
        }
      ]
    },
    {
      essayId: "programming",
      sourceTitle: "Programming Essays",
      posts: [
        {
          theme: "Lisp and Programming Languages",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Lisp ideas shape how programmers think about abstractions."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "Powerful language tools make ambitious software easier to build."
            }
          ]
        },
        {
          theme: "Compiler Design",
          postType: "carousel",
          slides: [
            {
              slideNumber: 1,
              type: "hook",
              text: "Compiler work rewards precise thinking about semantics."
            },
            {
              slideNumber: 2,
              type: "body",
              text: "Language design choices shape developer productivity."
            }
          ]
        }
      ]
    }
  ]
};

export class StaticReccesRepository implements ReccesRepository {
  async listEssayDocuments(authorId: string): Promise<ReccesEssayDocument[]> {
    const key = String(authorId ?? "").trim();
    return STATIC_DATASET[key] ?? [];
  }

  async getPostById(postId: string) {
    const parsed = parseReccesPostId(postId);
    if (!parsed) {
      return null;
    }

    const docs = STATIC_DATASET[parsed.authorId] ?? [];
    const essay = docs.find((item) => item.essayId === parsed.essayId);
    if (!essay) {
      return null;
    }
    const post = essay.posts[parsed.postIndex];
    if (!post) {
      return null;
    }

    const slideText = post.slides
      .map((slide) => slide.text.trim())
      .filter(Boolean)
      .join(" ");

    return {
      id: buildReccesPostId(parsed.authorId, parsed.essayId, parsed.postIndex),
      authorId: parsed.authorId,
      essayId: parsed.essayId,
      postIndex: parsed.postIndex,
      theme: post.theme,
      postType: post.postType,
      slides: post.slides,
      fullText: `${post.theme}. ${slideText}`.trim()
    };
  }
}
