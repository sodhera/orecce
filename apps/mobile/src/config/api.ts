// API configuration (local app -> cloud backend)
const API_BASE_URL = 'https://us-central1-audit-3a7ec.cloudfunctions.net/api';

export const API_ENDPOINTS = {
    NEWS_SOURCES: `${API_BASE_URL}/v1/news/sources`,
    NEWS_ARTICLES: `${API_BASE_URL}/v1/news/articles`,
    NEWS_ARTICLE_DETAIL: (articleId: string) => `${API_BASE_URL}/v1/news/articles/${encodeURIComponent(articleId)}`,
};

export const apiConfig = {
    baseUrl: API_BASE_URL,
    timeout: 10000,
};
