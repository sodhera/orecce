export const SPORT_IDS = [
  "football",
  "basketball",
  "cricket",
  "american-football",
  "baseball",
  "tennis",
  "motorsport",
  "rugby",
  "ice-hockey",
  "boxing-mma"
] as const;

export type SportId = (typeof SPORT_IDS)[number];

export interface SportFeedSource {
  id: string;
  name: string;
  homepageUrl: string;
  feedUrl: string;
}

const SPORT_ID_SET = new Set<string>(SPORT_IDS);

const SPORT_ALIASES: Record<string, SportId> = {
  soccer: "football",
  nba: "basketball",
  nfl: "american-football",
  americanfootball: "american-football",
  mlb: "baseball",
  f1: "motorsport",
  formula1: "motorsport",
  "formula-1": "motorsport",
  motorsports: "motorsport",
  rugbyunion: "rugby",
  "rugby-union": "rugby",
  hockey: "ice-hockey",
  nhl: "ice-hockey",
  icehockey: "ice-hockey",
  boxing: "boxing-mma",
  mma: "boxing-mma",
  combat: "boxing-mma",
  "combat-sports": "boxing-mma",
  boxingmma: "boxing-mma"
};

const SPORT_DISPLAY_NAMES: Record<SportId, string> = {
  football: "Football",
  basketball: "Basketball",
  cricket: "Cricket",
  "american-football": "American Football",
  baseball: "Baseball",
  tennis: "Tennis",
  motorsport: "Formula 1 / Motorsport",
  rugby: "Rugby",
  "ice-hockey": "Ice Hockey",
  "boxing-mma": "Boxing / MMA"
};

function normalizeSportSlug(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

export function parseSportId(value: string): SportId | null {
  const normalized = normalizeSportSlug(value);
  if (!normalized) {
    return null;
  }

  const aliased = SPORT_ALIASES[normalized];
  if (aliased) {
    return aliased;
  }

  return SPORT_ID_SET.has(normalized) ? (normalized as SportId) : null;
}

export function getSportDisplayName(sport: SportId): string {
  return SPORT_DISPLAY_NAMES[sport];
}

export function supportedSportsText(): string {
  return SPORT_IDS.join(", ");
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
    },
    {
      id: "yahoo-soccer",
      name: "Yahoo Soccer",
      homepageUrl: "https://sports.yahoo.com/soccer/",
      feedUrl: "https://sports.yahoo.com/soccer/rss.xml"
    }
  ],
  basketball: [
    {
      id: "espn-nba",
      name: "ESPN NBA",
      homepageUrl: "https://www.espn.com/nba/",
      feedUrl: "https://www.espn.com/espn/rss/nba/news"
    },
    {
      id: "yahoo-nba",
      name: "Yahoo NBA",
      homepageUrl: "https://sports.yahoo.com/nba/",
      feedUrl: "https://sports.yahoo.com/nba/rss.xml"
    }
  ],
  cricket: [
    {
      id: "espn-cricket",
      name: "ESPN Cricket",
      homepageUrl: "https://www.espn.com/cricket/",
      feedUrl: "https://www.espn.com/espn/rss/cricket/news"
    },
    {
      id: "bbc-cricket",
      name: "BBC Cricket",
      homepageUrl: "https://www.bbc.com/sport/cricket",
      feedUrl: "https://feeds.bbci.co.uk/sport/cricket/rss.xml"
    }
  ],
  "american-football": [
    {
      id: "espn-nfl",
      name: "ESPN NFL",
      homepageUrl: "https://www.espn.com/nfl/",
      feedUrl: "https://www.espn.com/espn/rss/nfl/news"
    },
    {
      id: "yahoo-nfl",
      name: "Yahoo NFL",
      homepageUrl: "https://sports.yahoo.com/nfl/",
      feedUrl: "https://sports.yahoo.com/nfl/rss.xml"
    }
  ],
  baseball: [
    {
      id: "espn-mlb",
      name: "ESPN MLB",
      homepageUrl: "https://www.espn.com/mlb/",
      feedUrl: "https://www.espn.com/espn/rss/mlb/news"
    },
    {
      id: "yahoo-mlb",
      name: "Yahoo MLB",
      homepageUrl: "https://sports.yahoo.com/mlb/",
      feedUrl: "https://sports.yahoo.com/mlb/rss.xml"
    }
  ],
  tennis: [
    {
      id: "espn-tennis",
      name: "ESPN Tennis",
      homepageUrl: "https://www.espn.com/tennis/",
      feedUrl: "https://www.espn.com/espn/rss/tennis/news"
    }
  ],
  motorsport: [
    {
      id: "espn-f1",
      name: "ESPN F1",
      homepageUrl: "https://www.espn.com/f1/",
      feedUrl: "https://www.espn.com/espn/rss/f1/news"
    },
    {
      id: "bbc-formula1",
      name: "BBC Formula 1",
      homepageUrl: "https://www.bbc.com/sport/formula1",
      feedUrl: "https://feeds.bbci.co.uk/sport/formula1/rss.xml"
    }
  ],
  rugby: [
    {
      id: "bbc-rugby-union",
      name: "BBC Rugby Union",
      homepageUrl: "https://www.bbc.com/sport/rugby-union",
      feedUrl: "https://feeds.bbci.co.uk/sport/rugby-union/rss.xml"
    },
    {
      id: "espn-rugby",
      name: "ESPN Rugby",
      homepageUrl: "https://www.espn.com/rugby/",
      feedUrl: "https://www.espn.com/espn/rss/rugby/news"
    }
  ],
  "ice-hockey": [
    {
      id: "espn-nhl",
      name: "ESPN NHL",
      homepageUrl: "https://www.espn.com/nhl/",
      feedUrl: "https://www.espn.com/espn/rss/nhl/news"
    },
    {
      id: "yahoo-nhl",
      name: "Yahoo NHL",
      homepageUrl: "https://sports.yahoo.com/nhl/",
      feedUrl: "https://sports.yahoo.com/nhl/rss.xml"
    }
  ],
  "boxing-mma": [
    {
      id: "espn-boxing",
      name: "ESPN Boxing",
      homepageUrl: "https://www.espn.com/boxing/",
      feedUrl: "https://www.espn.com/espn/rss/boxing/news"
    },
    {
      id: "espn-mma",
      name: "ESPN MMA",
      homepageUrl: "https://www.espn.com/mma/",
      feedUrl: "https://www.espn.com/espn/rss/mma/news"
    }
  ]
};
