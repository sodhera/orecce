export type SportId = "football";

export interface SportFeedSource {
  id: string;
  name: string;
  homepageUrl: string;
  feedUrl: string;
}

export const SPORT_NEWS_SOURCES: Record<SportId, SportFeedSource[]> = {
  football: [
    {
      id: "bbc-football",
      name: "BBC Football",
      homepageUrl: "https://www.bbc.com/sport/football",
      feedUrl: "https://feeds.bbci.co.uk/sport/football/rss.xml"
    },
    {
      id: "espn-soccer",
      name: "ESPN Soccer",
      homepageUrl: "https://www.espn.com/soccer/",
      feedUrl: "https://www.espn.com/espn/rss/soccer/news"
    }
  ]
};
