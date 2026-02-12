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

interface ThemeContextValue {
    themeMode: ThemeMode;
    setThemeMode: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

const STORAGE_KEY = "orecce-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): ThemeMode {
    if (typeof window === "undefined") {
        return "dark";
    }

    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
    }

    return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

    useEffect(() => {
        setThemeMode(getInitialTheme());
    }, []);

    useEffect(() => {
        document.documentElement.dataset.theme = themeMode;
        document.body.dataset.theme = themeMode;
        document.documentElement.style.colorScheme = themeMode;
        window.localStorage.setItem(STORAGE_KEY, themeMode);
    }, [themeMode]);

    const toggleTheme = useCallback(() => {
        setThemeMode((previous) => (previous === "dark" ? "light" : "dark"));
    }, []);

    const value = useMemo(
        () => ({
            themeMode,
            setThemeMode,
            toggleTheme,
        }),
        [themeMode, toggleTheme],
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
