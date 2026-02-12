// API Configuration
// NOTE: iOS Simulator cannot access localhost directly.
// Set this to your machine IP when using Firebase emulator.
const DEV_MACHINE_IP = '10.228.254.113';
const FIREBASE_PROJECT_ID = 'ai-post-dev';
const API_BASE_URL = __DEV__
    ? `http://${DEV_MACHINE_IP}:5001/${FIREBASE_PROJECT_ID}/us-central1/api`
    : 'https://us-central1-ai-post-dev.cloudfunctions.net/api';

export const API_ENDPOINTS = {
    NEWS_SOURCES: `${API_BASE_URL}/v1/news/sources`,
    NEWS_ARTICLES: `${API_BASE_URL}/v1/news/articles`,
    NEWS_ARTICLE_DETAIL: (articleId: string) => `${API_BASE_URL}/v1/news/articles/${encodeURIComponent(articleId)}`,
};

export const apiConfig = {
    baseUrl: API_BASE_URL,
    timeout: 10000,
};
