import { describe, expect, it } from "vitest";
import { extractArticleTextVerbatim } from "../src/news/articleTextFetcher";

describe("articleTextFetcher", () => {
  it("prefers JSON-LD articleBody when present", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {"@context":"https://schema.org","@type":"NewsArticle","articleBody":"Paragraph one.\\n\\nParagraph two."}
          </script>
        </head>
        <body><article><p>Fallback body</p></article></body>
      </html>
    `;

    const text = extractArticleTextVerbatim(html);
    expect(text).toContain("Paragraph one.");
    expect(text).toContain("Paragraph two.");
  });

  it("extracts text content from article HTML when JSON-LD is missing", () => {
    const html = `
      <html>
        <body>
          <article>
            <h1>Headline</h1>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
          </article>
        </body>
      </html>
    `;

    const text = extractArticleTextVerbatim(html);
    expect(text).toContain("Headline");
    expect(text).toContain("First paragraph.");
    expect(text).toContain("Second paragraph.");
  });
});
