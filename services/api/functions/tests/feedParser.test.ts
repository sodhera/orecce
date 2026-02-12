import { describe, expect, it } from "vitest";
import { parseFeedXml } from "../src/news/feedParser";

describe("feedParser", () => {
  it("parses RSS 2.0 items and normalizes link tracking params", () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <title>Sample Feed</title>
          <item>
            <guid>article-1</guid>
            <title>  Breaking Update  </title>
            <link>https://example.com/story-1?utm_source=rss&utm_medium=feed</link>
            <pubDate>Thu, 12 Feb 2026 10:00:00 GMT</pubDate>
            <description><![CDATA[<p>This is <b>important</b>.</p>]]></description>
            <category>World</category>
            <category>Politics</category>
          </item>
        </channel>
      </rss>
    `;

    const parsed = parseFeedXml(xml);
    expect(parsed.length).toBe(1);
    expect(parsed[0].externalId).toBe("article-1");
    expect(parsed[0].title).toBe("Breaking Update");
    expect(parsed[0].canonicalUrl).toBe("https://example.com/story-1");
    expect(parsed[0].summary).toBe("This is important.");
    expect(parsed[0].categories).toEqual(["World", "Politics"]);
    expect(parsed[0].publishedAtMs).toBe(Date.parse("Thu, 12 Feb 2026 10:00:00 GMT"));
  });

  it("parses Atom entries with link href and category term", () => {
    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom Feed</title>
        <entry>
          <id>tag:example.com,2026:2</id>
          <title>Atom Title</title>
          <link rel="alternate" href="https://example.com/atom-2"/>
          <updated>2026-02-12T11:30:00Z</updated>
          <summary>New atom summary.</summary>
          <category term="Technology"/>
        </entry>
      </feed>
    `;

    const parsed = parseFeedXml(xml);
    expect(parsed.length).toBe(1);
    expect(parsed[0].externalId).toBe("tag:example.com,2026:2");
    expect(parsed[0].canonicalUrl).toBe("https://example.com/atom-2");
    expect(parsed[0].title).toBe("Atom Title");
    expect(parsed[0].summary).toBe("New atom summary.");
    expect(parsed[0].categories).toEqual(["Technology"]);
    expect(parsed[0].publishedAtMs).toBe(Date.parse("2026-02-12T11:30:00Z"));
  });
});
