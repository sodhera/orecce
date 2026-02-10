/**
 * API Service for communicating with the Orecce backend.
 * 
 * This module provides a centralized client for all backend API calls.
 * It handles authentication, error handling, and request/response typing.
 */

import { auth } from '../config/firebase';

// =============================================================================
// CONFIGURATION
// =============================================================================

// API Base URLs
const API_BASE_URL_PROD = 'https://us-central1-audit-3a7ec.cloudfunctions.net/agent';

// For local development with iOS simulator, localhost doesn't work.
// Options:
// 1. Use your Mac's actual IP address (e.g., 'http://192.168.1.x:4000/agent')
// 2. Use production API (recommended for mobile development)
// 3. Run Android emulator which supports 10.0.2.2 for localhost
//
// We default to production API for mobile dev since it's simpler and more reliable.
const API_BASE_URL = API_BASE_URL_PROD;

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
 * Get the current user's Firebase ID token for API authentication.
 */
async function getAuthToken(): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error('User not authenticated');
    }
    return currentUser.getIdToken();
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
 * Sync the current Firebase Auth user with the backend.
 * This should be called after login/signup to ensure the user document exists.
 */
export async function syncCurrentUser(): Promise<User | null> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        return null;
    }

    try {
        // Get user from backend (creates if doesn't exist)
        const user = await getUser(currentUser.uid);
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
