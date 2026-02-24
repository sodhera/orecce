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
const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");

// ── Types ──────────────────────────────────────────────────────

interface User {
    id: string;
    name: string;
    email: string;
}

export type SignupResult = "signed_in" | "verification_required";

interface AuthContextValue {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
    showAuthModal: boolean;
    setShowAuthModal: (v: boolean) => void;
    login: (email: string, password: string) => Promise<void>;
    signup: (name: string, email: string, password: string) => Promise<SignupResult>;
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

function hasEmailProvider(su: SupabaseUser): boolean {
    const appMeta = su.app_metadata as
        | { provider?: string; providers?: string[] }
        | undefined;
    if (appMeta?.provider === "email") {
        return true;
    }
    return Array.isArray(appMeta?.providers) && appMeta.providers.includes("email");
}

function canTreatAsAuthenticated(su: SupabaseUser): boolean {
    if (!hasEmailProvider(su)) {
        return true;
    }
    return Boolean(su.email_confirmed_at);
}

function getAuthRedirectUrl(): string | undefined {
    if (PUBLIC_APP_URL) {
        return PUBLIC_APP_URL;
    }
    if (typeof window !== "undefined") {
        return window.location.origin;
    }
    return undefined;
}

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Listen for Supabase auth state changes
    useEffect(() => {
        const applySession = (s: Session | null) => {
            setSession(s);
            if (s?.user) {
                setUser(mapSupabaseUser(s.user));
            } else {
                setUser(null);
            }
            setLoading(false);
        };

        // Get initial session
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (s?.user && !canTreatAsAuthenticated(s.user)) {
                void supabase.auth.signOut();
                applySession(null);
                return;
            }
            applySession(s);
        });

        // Subscribe to changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, s) => {
            if (s?.user && !canTreatAsAuthenticated(s.user)) {
                void supabase.auth.signOut();
                applySession(null);
                return;
            }
            applySession(s);
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
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        if (data.user && !canTreatAsAuthenticated(data.user)) {
            await supabase.auth.signOut();
            throw new Error("Please verify your email before signing in.");
        }
        setShowAuthModal(false);
    }, []);

    const signup = useCallback(
        async (
            name: string,
            email: string,
            password: string,
        ): Promise<SignupResult> => {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name },
                    emailRedirectTo: getAuthRedirectUrl(),
                },
            });
            if (error) throw error;

            const signedInUser = data.session?.user;
            if (signedInUser && canTreatAsAuthenticated(signedInUser)) {
                setShowAuthModal(false);
                return "signed_in";
            }

            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            return "verification_required";
        },
        [],
    );

    const loginWithGoogle = useCallback(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                queryParams: { prompt: "select_account" },
                redirectTo: getAuthRedirectUrl(),
            },
        });
        if (error) throw error;
        setShowAuthModal(false);
    }, []);

    const resetPassword = useCallback(async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getAuthRedirectUrl(),
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
