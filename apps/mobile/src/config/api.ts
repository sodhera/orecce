// API Configuration
// NOTE: iOS Simulator cannot access 'localhost' - must use computer's IP address
// To find your IP: Run `ipconfig getifaddr en0` in terminal
const API_BASE_URL = __DEV__
    ? 'http://10.228.254.113:4000'  // Your computer's IP address
    : 'https://your-production-api.com'; // TODO: Replace with production URL

export const API_ENDPOINTS = {
    RSS_FEEDS: `${API_BASE_URL}/agent/rss/feeds`,
    RSS_AGGREGATE: `${API_BASE_URL}/agent/rss/aggregate`,
    RSS_FEED: `${API_BASE_URL}/agent/rss/feed`,
};

export const apiConfig = {
    baseUrl: API_BASE_URL,
    timeout: 10000,
};
