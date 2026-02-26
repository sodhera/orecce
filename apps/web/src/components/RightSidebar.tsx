"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
    flushCurationChatSession,
    sendCurationChat,
    type CurationChatInputMessage,
} from "@/lib/api";

interface RightSidebarProps {
    mode: string;
    onModeChange: (mode: string) => void;
    profile: string;
    onProfileChange: (profile: string) => void;
}

type CurateRole = "assistant" | "user";

interface CurateMessage {
    id: string;
    role: CurateRole;
    text: string;
    createdAtMs: number;
}

const SESSION_CHAT_KEY = "orecce:curate:chat:session:v1";
const MAX_CONTEXT_MESSAGES = 12;
const STARTER_PROMPTS = [
    "More practical startup breakdowns",
    "Less repetitive AI news",
    "Add design and product thinking",
];

function createMessage(role: CurateRole, text: string): CurateMessage {
    return {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role,
        text,
        createdAtMs: Date.now(),
    };
}

function getDefaultAssistantMessage(): CurateMessage {
    return createMessage(
        "assistant",
        "Tell me what you want more and less of in your feed. I will tune topics, formats, and tone.",
    );
}

function toInputMessages(messages: CurateMessage[]): CurationChatInputMessage[] {
    return messages
        .filter((message) => message.text.trim())
        .slice(-MAX_CONTEXT_MESSAGES)
        .map((message) => ({
            role: message.role,
            content: message.text,
        }));
}

function parseStoredMessages(raw: string | null): CurateMessage[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => {
                if (!item || typeof item !== "object") return null;
                const row = item as Record<string, unknown>;
                const role = row.role === "assistant" || row.role === "user" ? row.role : null;
                const text = typeof row.text === "string" ? row.text.trim() : "";
                if (!role || !text) return null;
                const createdAtMs =
                    typeof row.createdAtMs === "number" && Number.isFinite(row.createdAtMs)
                        ? row.createdAtMs
                        : Date.now();

                return {
                    id: typeof row.id === "string" && row.id ? row.id : `${role}-${createdAtMs}`,
                    role,
                    text,
                    createdAtMs,
                } as CurateMessage;
            })
            .filter((message): message is CurateMessage => Boolean(message));
    } catch {
        return [];
    }
}

function isReloadNavigation(): boolean {
    if (typeof window === "undefined") return false;
    const entries = window.performance.getEntriesByType("navigation");
    if (!entries.length) return false;
    const entry = entries[0] as PerformanceNavigationTiming;
    return entry.type === "reload";
}

export default function RightSidebar({ mode, profile }: RightSidebarProps) {
    const [messages, setMessages] = useState<CurateMessage[]>([getDefaultAssistantMessage()]);
    const [inputValue, setInputValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const [sessionNotice, setSessionNotice] = useState<string | null>(null);
    const threadRef = useRef<HTMLDivElement | null>(null);

    const hasUserMessages = useMemo(
        () => messages.some((message) => message.role === "user"),
        [messages],
    );

    useEffect(() => {
        let cancelled = false;

        const hydrate = async () => {
            const stored = parseStoredMessages(window.sessionStorage.getItem(SESSION_CHAT_KEY));
            if (!stored.length) {
                if (!cancelled) {
                    setIsHydrated(true);
                }
                return;
            }

            if (isReloadNavigation()) {
                try {
                    await flushCurationChatSession(toInputMessages(stored));
                    window.sessionStorage.removeItem(SESSION_CHAT_KEY);
                    if (!cancelled) {
                        setMessages([getDefaultAssistantMessage()]);
                        setSessionNotice("Saved previous curate chat and started a fresh session.");
                    }
                } catch {
                    if (!cancelled) {
                        setMessages(stored);
                        setSessionNotice("Could not sync your previous curate chat yet.");
                    }
                } finally {
                    if (!cancelled) {
                        setIsHydrated(true);
                    }
                }
                return;
            }

            if (!cancelled) {
                setMessages(stored);
                setIsHydrated(true);
            }
        };

        void hydrate();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isHydrated) return;
        if (!hasUserMessages) {
            window.sessionStorage.removeItem(SESSION_CHAT_KEY);
            return;
        }

        const persistable = messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            createdAtMs: message.createdAtMs,
        }));
        window.sessionStorage.setItem(SESSION_CHAT_KEY, JSON.stringify(persistable));
    }, [isHydrated, hasUserMessages, messages]);

    useEffect(() => {
        const node = threadRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    }, [messages, isSending]);

    const submitMessage = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isSending) return;

        const userMessage = createMessage("user", trimmed);
        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        setInputValue("");
        setIsSending(true);

        try {
            const response = await sendCurationChat({
                messages: toInputMessages(nextMessages),
                mode,
                profile,
            });
            setMessages((prev) => [...prev, createMessage("assistant", response.reply)]);
        } catch {
            setMessages((prev) => [
                ...prev,
                createMessage(
                    "assistant",
                    "I hit a temporary issue. Tell me again what you want to see and I will keep refining.",
                ),
            ]);
        } finally {
            setIsSending(false);
        }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submitMessage(inputValue);
    };

    return (
        <aside className="right-sidebar">
            <section className="curation-chat-panel" aria-label="Curate your feed">
                <header className="curation-chat-header">
                    <h2>Curate</h2>
                    <p>Describe what you want to see in your feed.</p>
                </header>

                <div className="curation-chat-thread" ref={threadRef}>
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`curation-chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
                        >
                            {message.text}
                        </div>
                    ))}
                    {isSending && (
                        <div className="curation-chat-thinking" aria-live="polite">
                            Thinking...
                        </div>
                    )}
                </div>

                {!hasUserMessages && (
                    <div className="curation-chat-starters">
                        {STARTER_PROMPTS.map((prompt) => (
                            <button
                                key={prompt}
                                type="button"
                                className="curation-chat-starter"
                                onClick={() => {
                                    void submitMessage(prompt);
                                }}
                                disabled={isSending}
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                )}

                <form className="curation-chat-form" onSubmit={handleSubmit}>
                    <label htmlFor="curation-chat-input" className="sr-only">
                        Describe your preferred feed
                    </label>
                    <textarea
                        id="curation-chat-input"
                        value={inputValue}
                        onChange={(event) => setInputValue(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void submitMessage(inputValue);
                            }
                        }}
                        placeholder="Try: less hype, more deep technical explainers"
                        rows={2}
                        disabled={isSending}
                    />
                    <button type="submit" disabled={isSending || !inputValue.trim()}>
                        Send
                    </button>
                </form>

                {sessionNotice && <p className="curation-chat-notice">{sessionNotice}</p>}
            </section>
        </aside>
    );
}
