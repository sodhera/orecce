/**
 * useUser hook - Unified user data management
 * 
 * This hook combines Firebase Auth user data with the backend User model,
 * providing a single source of truth for user profile information.
 */

import { useState, useEffect, useCallback } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { api, User, UserProfile } from '../services/api';

interface UseUserState {
    /** Firebase Auth user (for auth status, email verification, etc.) */
    firebaseUser: FirebaseUser | null;
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
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track auth state and fetch backend user
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            setFirebaseUser(fbUser);

            if (fbUser) {
                try {
                    // Sync with backend (creates user if doesn't exist)
                    const backendUser = await api.syncCurrentUser();
                    setUser(backendUser);
                    setError(null);
                } catch (err: any) {
                    console.error('[useUser] Failed to sync user:', err);
                    setError(err.error || err.message || 'Failed to load user');
                    // Don't block the UI - user can still use the app with Firebase Auth data
                }
            } else {
                setUser(null);
            }

            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Refresh user data from backend
    const refresh = useCallback(async () => {
        if (!firebaseUser) return;

        try {
            setIsLoading(true);
            const backendUser = await api.getUser(firebaseUser.uid);
            setUser(backendUser);
            setError(null);
        } catch (err: any) {
            console.error('[useUser] Failed to refresh user:', err);
            setError(err.error || err.message || 'Failed to refresh user');
        } finally {
            setIsLoading(false);
        }
    }, [firebaseUser]);

    // Update user profile
    const updateProfile = useCallback(async (profile: Partial<UserProfile>) => {
        if (!firebaseUser) {
            setError('User not authenticated');
            return null;
        }

        try {
            const updatedUser = await api.updateUserProfile(firebaseUser.uid, profile);
            setUser(updatedUser);
            setError(null);
            return updatedUser;
        } catch (err: any) {
            console.error('[useUser] Failed to update profile:', err);
            setError(err.error || err.message || 'Failed to update profile');
            return null;
        }
    }, [firebaseUser]);

    // Clear error
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        firebaseUser,
        user,
        isLoading,
        error,
        isAuthenticated: !!firebaseUser,
        refresh,
        updateProfile,
        clearError,
    };
}

/**
 * Helper to get display name from either backend user or Firebase user.
 * Prioritizes backend user data.
 */
export function getDisplayName(user: User | null, firebaseUser: FirebaseUser | null): string {
    // First try backend user profile
    if (user?.profile?.displayName) {
        return user.profile.displayName;
    }
    // Fall back to Firebase Auth displayName
    if (firebaseUser?.displayName) {
        return firebaseUser.displayName;
    }
    // Fall back to email prefix
    if (user?.email) {
        return user.email.split('@')[0];
    }
    if (firebaseUser?.email) {
        return firebaseUser.email.split('@')[0];
    }
    return 'User';
}

/**
 * Helper to get user initials for avatar.
 */
export function getUserInitials(user: User | null, firebaseUser: FirebaseUser | null): string {
    const name = getDisplayName(user, firebaseUser);

    // If it's a full name, get initials
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }

    // Otherwise use first two characters
    return name.slice(0, 2).toUpperCase();
}

export default useUser;
