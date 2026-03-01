"use client";

const CACHE_VERSION = 1;

interface CacheEnvelope<T> {
    version: number;
    savedAt: number;
    value: T;
}

export interface TabCacheResult<T> {
    value: T;
    savedAt: number;
    isFresh: boolean;
}

function getSessionStorage(): Storage | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

export function readTabCache<T>(key: string, maxAgeMs: number): TabCacheResult<T> | null {
    const storage = getSessionStorage();
    if (!storage) {
        return null;
    }

    try {
        const raw = storage.getItem(key);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
        if (
            parsed.version !== CACHE_VERSION ||
            typeof parsed.savedAt !== "number" ||
            !Number.isFinite(parsed.savedAt)
        ) {
            storage.removeItem(key);
            return null;
        }

        return {
            value: parsed.value as T,
            savedAt: parsed.savedAt,
            isFresh: Date.now() - parsed.savedAt <= maxAgeMs,
        };
    } catch {
        storage.removeItem(key);
        return null;
    }
}

export function writeTabCache<T>(key: string, value: T): void {
    const storage = getSessionStorage();
    if (!storage) {
        return;
    }

    try {
        const payload: CacheEnvelope<T> = {
            version: CACHE_VERSION,
            savedAt: Date.now(),
            value,
        };
        storage.setItem(key, JSON.stringify(payload));
    } catch {
        // Ignore storage quota and serialization failures.
    }
}

export function clearTabCache(key: string): void {
    const storage = getSessionStorage();
    if (!storage) {
        return;
    }

    try {
        storage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}
