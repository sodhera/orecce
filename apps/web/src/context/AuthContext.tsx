"use client";

import {
    createContext,
    useContext,
    useCallback,
    useState,
    useEffect,
    ReactNode,
} from "react";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    User as FirebaseUser,
} from "firebase/auth";
import { auth } from "@/lib/firebaseConfig";

// ── Types ──────────────────────────────────────────────────────

interface User {
    id: string;
    name: string;
    email: string;
}

interface AuthContextValue {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
    showAuthModal: boolean;
    setShowAuthModal: (v: boolean) => void;
    login: (email: string, password: string) => Promise<void>;
    signup: (name: string, email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────

function mapFirebaseUser(fb: FirebaseUser): User {
    return {
        id: fb.uid,
        name: fb.displayName ?? fb.email?.split("@")[0] ?? "User",
        email: fb.email ?? "",
    };
}

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Listen for Firebase auth state changes (handles persistence + refresh)
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (fb) => {
            if (fb) {
                setFirebaseUser(fb);
                setUser(mapFirebaseUser(fb));
            } else {
                setFirebaseUser(null);
                setUser(null);
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    // After auth, lazily create user profile + prefill posts on backend
    useEffect(() => {
        if (!firebaseUser) return;
        (async () => {
            try {
                const token = await firebaseUser.getIdToken();
                await fetch("/api/v1/users/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
            } catch {
                // Backend may not be running — non-blocking
            }
        })();
    }, [firebaseUser]);

    const login = useCallback(async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
        setShowAuthModal(false);
    }, []);

    const signup = useCallback(
        async (name: string, email: string, password: string) => {
            const cred = await createUserWithEmailAndPassword(
                auth,
                email,
                password,
            );
            await updateProfile(cred.user, { displayName: name });
            // Refresh local state with updated display name
            setUser(mapFirebaseUser(cred.user));
            setShowAuthModal(false);
        },
        [],
    );

    const logout = useCallback(async () => {
        await signOut(auth);
    }, []);

    const getIdToken = useCallback(async (): Promise<string | null> => {
        if (!firebaseUser) return null;
        return firebaseUser.getIdToken();
    }, [firebaseUser]);

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                loading,
                showAuthModal,
                setShowAuthModal,
                login,
                signup,
                logout,
                getIdToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return ctx;
}
