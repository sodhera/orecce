/**
 * API Service for communicating with the Orecce backend.
 * 
 * This module provides a centralized client for all backend API calls.
 * It handles authentication, error handling, and request/response typing.
 */

import { supabase } from '../config/supabase';

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    'https://us-central1-audit-3a7ec.cloudfunctions.net/api';

// =============================================================================
// TYPES
// =============================================================================

export interface UserProfile {
    displayName?: string;
    photoURL?: string;
}

export interface User {
    id: string;
    email: string;
    profile?: UserProfile;
    createdAt: number;
    updatedAt: number;
}

export interface ApiError {
    error: string;
    status: number;
}

interface ApiEnvelope<T> {
    ok: boolean;
    data: T;
}

export type PostFeedbackType = 'upvote' | 'downvote' | 'skip' | 'save' | 'unsave';

export interface StoredPostFeedback {
    id: string;
    userId: string;
    postId: string;
    type: PostFeedbackType;
    createdAtMs: number;
}

export interface ListPostFeedbackResult {
    items: StoredPostFeedback[];
    nextCursor: string | null;
}

export interface ListPostFeedbackInput {
    postId?: string;
    pageSize?: number;
    cursor?: string;
}

// =============================================================================
// API CLIENT
// =============================================================================

/**
 * Get the current user's Supabase access token for API authentication.
 */
async function getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('User not authenticated');
    }
    return session.access_token;
}

/**
 * Make an authenticated API request.
 */
async function apiRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
): Promise<T> {
    const token = await getAuthToken();

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const options: RequestInit = {
        method,
        headers,
    };

    if (body && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, options);

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
        const apiError: ApiError = {
            error: errorBody.error || 'Request failed',
            status: response.status,
        };
        throw apiError;
    }

    return response.json();
}

// =============================================================================
// USER API
// =============================================================================

/**
 * Get the current user's profile from the backend.
 * Creates the user document if it doesn't exist (lazy creation).
 */
export async function getUser(userId: string): Promise<User> {
    return apiRequest<User>('GET', `/users/${userId}`);
}

/**
 * Update the current user's profile.
 */
export async function updateUserProfile(
    userId: string,
    profile: Partial<UserProfile>
): Promise<User> {
    return apiRequest<User>('PATCH', `/users/${userId}`, { profile });
}

/**
 * Sync the current Supabase Auth user with the backend.
 * This should be called after login/signup to ensure the user document exists.
 */
export async function syncCurrentUser(): Promise<User | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
        return null;
    }

    try {
        const user = await getUser(session.user.id);
        return user;
    } catch (error) {
        console.error('[api] Failed to sync user:', error);
        throw error;
    }
}

/**
 * Record post feedback for recommendation personalization.
 */
export async function sendPostFeedback(
    postId: string,
    feedbackType: PostFeedbackType
): Promise<StoredPostFeedback> {
    const response = await apiRequest<ApiEnvelope<StoredPostFeedback>>('POST', '/v1/posts/feedback', {
        post_id: postId,
        feedback_type: feedbackType,
    });
    return response.data;
}

/**
 * List post feedback entries for the current user.
 */
export async function listPostFeedback(
    input: ListPostFeedbackInput = {}
): Promise<ListPostFeedbackResult> {
    const response = await apiRequest<ApiEnvelope<ListPostFeedbackResult>>('POST', '/v1/posts/feedback/list', {
        post_id: input.postId,
        page_size: input.pageSize ?? 50,
        cursor: input.cursor,
    });
    return response.data;
}

/**
 * Fetch a bounded history of post feedback entries for state hydration.
 */
export async function listAllPostFeedback(
    input: Omit<ListPostFeedbackInput, 'cursor'> & { maxPages?: number } = {}
): Promise<StoredPostFeedback[]> {
    const maxPages = Math.max(1, Math.min(10, input.maxPages ?? 6));
    const items: StoredPostFeedback[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
        const result = await listPostFeedback({
            postId: input.postId,
            pageSize: input.pageSize ?? 50,
            cursor,
        });
        items.push(...result.items);
        if (!result.nextCursor) {
            break;
        }
        cursor = result.nextCursor;
    }

    return items;
}

// =============================================================================
// EXPOSED API CLIENT
// =============================================================================

export const api = {
    getUser,
    updateUserProfile,
    syncCurrentUser,
    sendPostFeedback,
    listPostFeedback,
    listAllPostFeedback,
};

export default api;
