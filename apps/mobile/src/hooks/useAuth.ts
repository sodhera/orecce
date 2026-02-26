import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    error: string | null;
}

interface AuthActions {
    signIn: (email: string, password: string) => Promise<boolean>;
    signUp: (email: string, password: string, options?: { fullName?: string }) => Promise<boolean>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<boolean>;
    clearError: () => void;
}

export function useAuth(): AuthState & AuthActions {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Listen to auth state changes
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            setSession(initialSession);
            setUser(initialSession?.user ?? null);
            setIsLoading(false);
        });

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, newSession) => {
                setSession(newSession);
                setUser(newSession?.user ?? null);
                setIsLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Sign in with email and password
    const signIn = async (email: string, password: string): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            if (authError) {
                setError(getErrorMessage(authError.message));
                return false;
            }
            return true;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Sign up with email and password
    const signUp = async (
        email: string,
        password: string,
        options?: { fullName?: string }
    ): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);

            const fullName = options?.fullName?.trim();
            const { error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: fullName ? { data: { full_name: fullName } } : undefined
            });
            if (authError) {
                setError(getErrorMessage(authError.message));
                return false;
            }
            return true;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Sign out
    const signOut = async (): Promise<void> => {
        try {
            setIsLoading(true);
            await supabase.auth.signOut();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    // Reset password
    const resetPassword = async (email: string): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);
            const { error: authError } = await supabase.auth.resetPasswordForEmail(email);
            if (authError) {
                setError(getErrorMessage(authError.message));
                return false;
            }
            return true;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Clear error
    const clearError = () => setError(null);

    return {
        user,
        session,
        isLoading,
        error,
        signIn,
        signUp,
        signOut,
        resetPassword,
        clearError,
    };
}

// Map Supabase error messages to user-friendly messages
function getErrorMessage(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login')) return 'Invalid email or password';
    if (lower.includes('email not confirmed')) return 'Please verify your email address';
    if (lower.includes('user already registered')) return 'An account already exists with this email';
    if (lower.includes('password')) return 'Password should be at least 6 characters';
    if (lower.includes('rate limit')) return 'Too many attempts. Please try again later';
    if (lower.includes('network')) return 'Network error. Please check your connection';
    return message || 'An error occurred. Please try again';
}

export default useAuth;
