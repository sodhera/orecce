/**
 * useUser hook - Unified user data management
 * 
 * This hook combines Supabase Auth user data with the backend User model,
 * providing a single source of truth for user profile information.
 */

import { useState, useEffect, useCallback } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { api, User, UserProfile } from '../services/api';

interface UseUserState {
    /** Supabase Auth user (for auth status, email verification, etc.) */
    authUser: SupabaseUser | null;
    /** Backend user profile (for displayName, photoURL, preferences) */
    user: User | null;
    /** Whether the initial data is still loading */
    isLoading: boolean;
    /** Error from the last operation */
    error: string | null;
    /** Whether the user is authenticated */
    isAuthenticated: boolean;
}

interface UseUserActions {
    /** Refresh user data from the backend */
    refresh: () => Promise<void>;
    /** Update user profile */
    updateProfile: (profile: Partial<UserProfile>) => Promise<User | null>;
    /** Clear any error */
    clearError: () => void;
}

export function useUser(): UseUserState & UseUserActions {
    const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track auth state and fetch backend user
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            const currentUser = session?.user ?? null;
            setAuthUser(currentUser);

            if (currentUser) {
                api.syncCurrentUser()
                    .then((backendUser) => {
                        setUser(backendUser);
                        setError(null);
                    })
                    .catch((err: any) => {
                        console.error('[useUser] Failed to sync user:', err);
                        setError(err.error || err.message || 'Failed to load user');
                    })
                    .finally(() => setIsLoading(false));
            } else {
                setUser(null);
                setIsLoading(false);
            }
        });

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                const currentUser = session?.user ?? null;
                setAuthUser(currentUser);

                if (currentUser) {
                    try {
                        const backendUser = await api.syncCurrentUser();
                        setUser(backendUser);
                        setError(null);
                    } catch (err: any) {
                        console.error('[useUser] Failed to sync user:', err);
                        setError(err.error || err.message || 'Failed to load user');
                    }
                } else {
                    setUser(null);
                }

                setIsLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Refresh user data from backend
    const refresh = useCallback(async () => {
        if (!authUser) return;

        try {
            setIsLoading(true);
            const backendUser = await api.getUser(authUser.id);
            setUser(backendUser);
            setError(null);
        } catch (err: any) {
            console.error('[useUser] Failed to refresh user:', err);
            setError(err.error || err.message || 'Failed to refresh user');
        } finally {
            setIsLoading(false);
        }
    }, [authUser]);

    // Update user profile
    const updateProfile = useCallback(async (profile: Partial<UserProfile>) => {
        if (!authUser) {
            setError('User not authenticated');
            return null;
        }

        try {
            const updatedUser = await api.updateUserProfile(authUser.id, profile);
            setUser(updatedUser);
            setError(null);
            return updatedUser;
        } catch (err: any) {
            console.error('[useUser] Failed to update profile:', err);
            setError(err.error || err.message || 'Failed to update profile');
            return null;
        }
    }, [authUser]);

    // Clear error
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        authUser,
        user,
        isLoading,
        error,
        isAuthenticated: !!authUser,
        refresh,
        updateProfile,
        clearError,
    };
}

/**
 * Helper to get display name from either backend user or Supabase user.
 * Prioritizes backend user data.
 */
export function getDisplayName(user: User | null, authUser: SupabaseUser | null): string {
    // First try backend user profile
    if (user?.profile?.displayName) {
        return user.profile.displayName;
    }
    // Fall back to Supabase Auth user_metadata
    const meta = authUser?.user_metadata;
    if (meta?.full_name) return meta.full_name;
    if (meta?.name) return meta.name;
    // Fall back to email prefix
    if (user?.email) {
        return user.email.split('@')[0];
    }
    if (authUser?.email) {
        return authUser.email.split('@')[0];
    }
    return 'User';
}

/**
 * Helper to get user initials for avatar.
 */
export function getUserInitials(user: User | null, authUser: SupabaseUser | null): string {
    const name = getDisplayName(user, authUser);

    // If it's a full name, get initials
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }

    // Otherwise use first two characters
    return name.slice(0, 2).toUpperCase();
}

export default useUser;
