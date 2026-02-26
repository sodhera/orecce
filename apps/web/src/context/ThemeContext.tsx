"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

export type ThemeMode = "dark" | "light";
export type ThemePreference = "auto" | ThemeMode;

interface ThemeContextValue {
    themeMode: ThemeMode;
    themePreference: ThemePreference;
    setThemePreference: (theme: ThemePreference) => void;
    setThemeMode: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

const STORAGE_KEY = "orecce-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveThemeFromSystem(): ThemeMode {
    if (typeof window === "undefined") {
        return "dark";
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
}

function getInitialThemePreference(): ThemePreference {
    if (typeof window === "undefined") {
        return "auto";
    }

    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "auto" || savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
    }

    return "auto";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
    const [themePreference, setThemePreferenceState] = useState<ThemePreference>("auto");

    useEffect(() => {
        setThemePreferenceState(getInitialThemePreference());
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const media = window.matchMedia("(prefers-color-scheme: light)");
        const applyThemePreference = () => {
            setThemeMode(
                themePreference === "auto"
                    ? (media.matches ? "light" : "dark")
                    : themePreference,
            );
        };

        applyThemePreference();
        window.localStorage.setItem(STORAGE_KEY, themePreference);

        if (themePreference !== "auto") {
            return;
        }

        const onSystemThemeChange = () => {
            applyThemePreference();
        };
        media.addEventListener("change", onSystemThemeChange);
        return () => {
            media.removeEventListener("change", onSystemThemeChange);
        };
    }, [themePreference]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        document.documentElement.dataset.theme = themeMode;
        document.body.dataset.theme = themeMode;
        document.documentElement.style.colorScheme = themeMode;
    }, [themeMode]);

    const setThemePreference = useCallback((theme: ThemePreference) => {
        setThemePreferenceState(theme);
    }, []);

    const setThemeModePreference = useCallback((theme: ThemeMode) => {
        setThemePreferenceState(theme);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemePreferenceState((previous) => {
            if (previous === "auto") {
                return resolveThemeFromSystem() === "dark" ? "light" : "dark";
            }
            return previous === "dark" ? "light" : "dark";
        });
    }, []);

    const value = useMemo(
        () => ({
            themeMode,
            themePreference,
            setThemePreference,
            setThemeMode: setThemeModePreference,
            toggleTheme,
        }),
        [themeMode, themePreference, setThemePreference, setThemeModePreference, toggleTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
