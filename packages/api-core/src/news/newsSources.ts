import { NewsSourceConfig } from "./types";

// RSS-first source list to reduce scraping fragility and preserve attribution.
export const DEFAULT_NEWS_SOURCES: NewsSourceConfig[] = [
  {
    id: "guardian-world",
    name: "The Guardian",
    homepageUrl: "https://www.theguardian.com",
    feedUrl: "https://www.theguardian.com/world/rss",
    language: "en",
    countryCode: "UK"
  },
  {
    id: "euronews-news",
    name: "Euronews",
    homepageUrl: "https://www.euronews.com",
    feedUrl: "https://www.euronews.com/rss?level=program&name=news",
    language: "en",
    countryCode: "FR"
  },
  {
    id: "sky-news-home",
    name: "Sky News",
    homepageUrl: "https://news.sky.com",
    feedUrl: "https://feeds.skynews.com/feeds/rss/home.xml",
    language: "en",
    countryCode: "UK"
  },
  {
    id: "abc-news-top-stories",
    name: "ABC News",
    homepageUrl: "https://abcnews.go.com",
    feedUrl: "https://abcnews.go.com/abcnews/topstories",
    language: "en",
    countryCode: "US"
  },
  {
    id: "cbs-news-latest",
    name: "CBS News",
    homepageUrl: "https://www.cbsnews.com",
    feedUrl: "https://www.cbsnews.com/latest/rss/main",
    language: "en",
    countryCode: "US"
  },
  {
    id: "fox-news-latest",
    name: "Fox News",
    homepageUrl: "https://www.foxnews.com",
    feedUrl: "https://moxie.foxnews.com/google-publisher/latest.xml",
    language: "en",
    countryCode: "US"
  },
  {
    id: "bbc-news-world",
    name: "BBC News",
    homepageUrl: "https://www.bbc.com/news",
    feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml",
    language: "en",
    countryCode: "UK"
  },
  {
    id: "cnn-top-stories",
    name: "CNN",
    homepageUrl: "https://www.cnn.com",
    feedUrl: "http://rss.cnn.com/rss/cnn_topstories.rss",
    language: "en",
    countryCode: "US"
  },
  {
    id: "times-of-india-top-stories",
    name: "The Times of India",
    homepageUrl: "https://timesofindia.indiatimes.com",
    feedUrl: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    language: "en",
    countryCode: "IN"
  },
  {
    id: "vnexpress-latest",
    name: "VnExpress",
    homepageUrl: "https://vnexpress.net",
    feedUrl: "https://vnexpress.net/rss/tin-moi-nhat.rss",
    language: "vi",
    countryCode: "VN"
  },
  {
    id: "al-jazeera-all",
    name: "Al Jazeera",
    homepageUrl: "https://www.aljazeera.com",
    feedUrl: "https://www.aljazeera.com/xml/rss/all.xml",
    language: "en",
    countryCode: "QA"
  },
  {
    id: "france24-en",
    name: "France 24",
    homepageUrl: "https://www.france24.com/en",
    feedUrl: "https://www.france24.com/en/rss",
    language: "en",
    countryCode: "FR"
  }
];
