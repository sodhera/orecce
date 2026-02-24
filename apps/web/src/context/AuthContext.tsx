"use client";

import {
    createContext,
    useContext,
    useCallback,
    useState,
    useEffect,
    ReactNode,
} from "react";
import { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const API_BASE = "/api/v1";

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
    loginWithGoogle: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────

function mapSupabaseUser(su: SupabaseUser): User {
    const meta = su.user_metadata ?? {};
    return {
        id: su.id,
        name:
            meta.full_name ??
            meta.name ??
            su.email?.split("@")[0] ??
            "User",
        email: su.email ?? "",
    };
}

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Listen for Supabase auth state changes
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            if (s?.user) {
                setUser(mapSupabaseUser(s.user));
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        // Subscribe to changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            if (s?.user) {
                setUser(mapSupabaseUser(s.user));
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // After auth, lazily create user profile + prefill posts on backend
    useEffect(() => {
        if (!session?.access_token) return;
        (async () => {
            try {
                await fetch(`${API_BASE}/users/me`, {
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                });
            } catch {
                // Backend may not be running — non-blocking
            }
        })();
    }, [session]);

    const login = useCallback(async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        setShowAuthModal(false);
    }, []);

    const signup = useCallback(
        async (name: string, email: string, password: string) => {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name },
                },
            });
            if (error) throw error;
            if (data.user) {
                setUser(mapSupabaseUser(data.user));
            }
            setShowAuthModal(false);
        },
        [],
    );

    const loginWithGoogle = useCallback(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                queryParams: { prompt: "select_account" },
                redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
            },
        });
        if (error) throw error;
        setShowAuthModal(false);
    }, []);

    const resetPassword = useCallback(async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo:
                typeof window !== "undefined" ? window.location.origin : undefined,
        });
        if (error) throw error;
    }, []);

    const logout = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const getIdToken = useCallback(async (): Promise<string | null> => {
        if (!session) return null;
        return session.access_token;
    }, [session]);

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
                loginWithGoogle,
                resetPassword,
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
