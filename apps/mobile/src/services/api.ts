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

// =============================================================================
// EXPOSED API CLIENT
// =============================================================================

export const api = {
    getUser,
    updateUserProfile,
    syncCurrentUser,
};

export default api;
