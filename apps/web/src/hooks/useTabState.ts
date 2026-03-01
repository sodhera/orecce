"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { readTabCache, writeTabCache } from "@/lib/tabCache";

const TAB_STATE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export function useTabState<T>(
    key: string,
    initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
    const initialValueRef = useRef<T | (() => T)>(initialValue);

    useEffect(() => {
        initialValueRef.current = initialValue;
    }, [initialValue]);

    const resolveInitialValue = useCallback((): T => {
        if (typeof initialValueRef.current === "function") {
            return (initialValueRef.current as () => T)();
        }
        return initialValueRef.current;
    }, []);

    const [state, setState] = useState<T>(() => resolveInitialValue());

    useEffect(() => {
        const snapshot = readTabCache<T>(key, TAB_STATE_MAX_AGE_MS);
        if (snapshot) {
            setState(snapshot.value);
            return;
        }

        setState(resolveInitialValue());
    }, [key, resolveInitialValue]);

    const setPersistedState = useCallback<Dispatch<SetStateAction<T>>>((value) => {
        setState((previousState) => {
            const nextState =
                typeof value === "function"
                    ? (value as (currentValue: T) => T)(previousState)
                    : value;

            writeTabCache(key, nextState);
            return nextState;
        });
    }, [key]);

    return [state, setPersistedState];
}
