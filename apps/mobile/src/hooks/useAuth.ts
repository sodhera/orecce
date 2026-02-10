import { useState, useEffect } from 'react';
import {
    User,
    Auth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../config/firebase';

interface AuthState {
    user: User | null;
    isLoading: boolean;
    error: string | null;
}

interface AuthActions {
    signIn: (email: string, password: string) => Promise<boolean>;
    signUp: (email: string, password: string) => Promise<boolean>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<boolean>;
    clearError: () => void;
}

export function useAuth(): AuthState & AuthActions {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Listen to auth state changes
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Sign in with email and password
    const signIn = async (email: string, password: string): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);
            await signInWithEmailAndPassword(auth, email, password);
            return true;
        } catch (err: unknown) {
            const errorCode = (err as { code?: string }).code || '';
            setError(getErrorMessage(errorCode));
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Sign up with email and password
    const signUp = async (email: string, password: string): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);
            await createUserWithEmailAndPassword(auth, email, password);
            return true;
        } catch (err: unknown) {
            const errorCode = (err as { code?: string }).code || '';
            setError(getErrorMessage(errorCode));
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Sign out
    const signOut = async (): Promise<void> => {
        try {
            setIsLoading(true);
            await firebaseSignOut(auth);
        } catch (err: unknown) {
            const errorCode = (err as { code?: string }).code || '';
            setError(getErrorMessage(errorCode));
        } finally {
            setIsLoading(false);
        }
    };

    // Reset password
    const resetPassword = async (email: string): Promise<boolean> => {
        try {
            setIsLoading(true);
            setError(null);
            await sendPasswordResetEmail(auth, email);
            return true;
        } catch (err: unknown) {
            const errorCode = (err as { code?: string }).code || '';
            setError(getErrorMessage(errorCode));
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Clear error
    const clearError = () => setError(null);

    return {
        user,
        isLoading,
        error,
        signIn,
        signUp,
        signOut,
        resetPassword,
        clearError,
    };
}

// Map Firebase error codes to user-friendly messages
function getErrorMessage(code: string): string {
    switch (code) {
        case 'auth/invalid-email':
            return 'Invalid email address';
        case 'auth/user-disabled':
            return 'This account has been disabled';
        case 'auth/user-not-found':
            return 'No account found with this email';
        case 'auth/wrong-password':
            return 'Incorrect password';
        case 'auth/email-already-in-use':
            return 'An account already exists with this email';
        case 'auth/weak-password':
            return 'Password should be at least 6 characters';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection';
        case 'auth/invalid-credential':
            return 'Invalid email or password';
        default:
            return 'An error occurred. Please try again';
    }
}

export default useAuth;
