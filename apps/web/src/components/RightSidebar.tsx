"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
    flushCurationChatSession,
    listCurationChatSessions,
    sendCurationChat,
    type CurationChatInputMessage,
    type CurationChatSessionSummary,
} from "@/lib/api";

interface RightSidebarProps {
    mode: string;
    onModeChange: (mode: string) => void;
    profile: string;
    onProfileChange: (profile: string) => void;
}

type CurateRole = "assistant" | "user";
type CuratePanelView = "chat" | "sessions";

interface CurateMessage {
    id: string;
    role: CurateRole;
    text: string;
    createdAtMs: number;
}

interface StoredCurateSession {
    sessionId: string;
    messages: CurateMessage[];
}

const SESSION_CHAT_KEY = "orecce:curate:chat:session:v3";
const LEGACY_SESSION_CHAT_KEY_V2 = "orecce:curate:chat:session:v2";
const LEGACY_SESSION_CHAT_KEY_V1 = "orecce:curate:chat:session:v1";
const MAX_CONTEXT_MESSAGES = 12;
const STARTER_PROMPTS = [
    "More practical startup breakdowns",
    "Less repetitive AI news",
    "Add design and product thinking",
];

function createSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `curate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
        "Tell me what you want more or less of. I will pass it to Orecce owners.",
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

function toCurateMessages(messages: CurationChatInputMessage[]): CurateMessage[] {
    return messages.map((message, index) => ({
        id: `${message.role}-${Date.now()}-${index}`,
        role: message.role,
        text: message.content,
        createdAtMs: Date.now() + index,
    }));
}

function parseStoredMessages(raw: unknown): CurateMessage[] {
    if (!Array.isArray(raw)) return [];

    return raw
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
}

function parseStoredSession(raw: string | null): StoredCurateSession | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;

        if (Array.isArray(parsed)) {
            const legacyMessages = parseStoredMessages(parsed);
            if (!legacyMessages.length) return null;
            return {
                sessionId: createSessionId(),
                messages: legacyMessages,
            };
        }

        if (!parsed || typeof parsed !== "object") return null;
        const row = parsed as Record<string, unknown>;
        const sessionId = typeof row.sessionId === "string" && row.sessionId.trim()
            ? row.sessionId.trim()
            : createSessionId();
        const messages = parseStoredMessages(row.messages);
        if (!messages.length) return null;

        return { sessionId, messages };
    } catch {
        return null;
    }
}

function isReloadNavigation(): boolean {
    if (typeof window === "undefined") return false;
    const entries = window.performance.getEntriesByType("navigation");
    if (!entries.length) return false;
    const entry = entries[0] as PerformanceNavigationTiming;
    return entry.type === "reload";
}

function formatSessionTime(timestampMs: number): string {
    const date = new Date(timestampMs);
    const now = Date.now();
    const diff = now - timestampMs;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message.trim();
    }
    return "Temporary error. Please try again.";
}

export default function RightSidebar({ mode, profile }: RightSidebarProps) {
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [panelView, setPanelView] = useState<CuratePanelView>("chat");
    const [sessionId, setSessionId] = useState(() => createSessionId());
    const [messages, setMessages] = useState<CurateMessage[]>([getDefaultAssistantMessage()]);
    const [inputValue, setInputValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const [sessionNotice, setSessionNotice] = useState<string | null>(null);
    const [sessionItems, setSessionItems] = useState<CurationChatSessionSummary[]>([]);
    const [isSessionItemsLoading, setIsSessionItemsLoading] = useState(false);
    const [sessionItemsError, setSessionItemsError] = useState<string | null>(null);
    const threadRef = useRef<HTMLDivElement | null>(null);
    const shellRef = useRef<HTMLDivElement | null>(null);

    const hasUserMessages = useMemo(
        () => messages.some((message) => message.role === "user"),
        [messages],
    );

    const persistSessionIfNeeded = async (targetSessionId: string, targetMessages: CurateMessage[]) => {
        const payload = toInputMessages(targetMessages);
        if (!payload.some((message) => message.role === "user")) {
            return;
        }

        await flushCurationChatSession({
            sessionId: targetSessionId,
            messages: payload,
        });

        window.sessionStorage.removeItem(SESSION_CHAT_KEY);
    };

    const startNewChatSession = () => {
        setSessionId(createSessionId());
        setMessages([getDefaultAssistantMessage()]);
        setInputValue("");
        setPanelView("chat");
    };

    const loadSessionItems = async () => {
        setIsSessionItemsLoading(true);
        setSessionItemsError(null);
        try {
            const result = await listCurationChatSessions(30);
            setSessionItems(result.items);
        } catch (error) {
            setSessionItemsError(errorMessage(error));
        } finally {
            setIsSessionItemsLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const hydrate = async () => {
            const stored = parseStoredSession(window.sessionStorage.getItem(SESSION_CHAT_KEY))
                ?? parseStoredSession(window.sessionStorage.getItem(LEGACY_SESSION_CHAT_KEY_V2))
                ?? parseStoredSession(window.sessionStorage.getItem(LEGACY_SESSION_CHAT_KEY_V1));

            if (stored && isReloadNavigation()) {
                try {
                    await flushCurationChatSession({
                        sessionId: stored.sessionId,
                        messages: toInputMessages(stored.messages),
                    });
                    window.sessionStorage.removeItem(SESSION_CHAT_KEY);
                    window.sessionStorage.removeItem(LEGACY_SESSION_CHAT_KEY_V2);
                    window.sessionStorage.removeItem(LEGACY_SESSION_CHAT_KEY_V1);
                    if (!cancelled) {
                        setSessionNotice("Saved your previous curate chat.");
                    }
                } catch {
                    if (!cancelled) {
                        setSessionNotice("Could not sync your previous curate chat yet.");
                    }
                }
            }

            if (!cancelled) {
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

        const payload: StoredCurateSession = {
            sessionId,
            messages: messages.map((message) => ({
                id: message.id,
                role: message.role,
                text: message.text,
                createdAtMs: message.createdAtMs,
            })),
        };

        window.sessionStorage.setItem(SESSION_CHAT_KEY, JSON.stringify(payload));
    }, [isHydrated, hasUserMessages, messages, sessionId]);

    useEffect(() => {
        if (!isPanelOpen || panelView !== "chat") return;

        const node = threadRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    }, [isPanelOpen, panelView, messages, isSending]);

    useEffect(() => {
        if (!isPanelOpen) return;

        const onPointerDown = (event: MouseEvent) => {
            const shell = shellRef.current;
            if (!shell) return;
            if (event.target instanceof Node && !shell.contains(event.target)) {
                setIsPanelOpen(false);
                setPanelView("chat");
                void persistSessionIfNeeded(sessionId, messages);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsPanelOpen(false);
                setPanelView("chat");
                void persistSessionIfNeeded(sessionId, messages);
            }
        };

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [isPanelOpen, sessionId, messages]);

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
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                createMessage("assistant", `Curate request failed: ${errorMessage(error)}`),
            ]);
        } finally {
            setIsSending(false);
        }
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submitMessage(inputValue);
    };

    const handleOpenPanel = () => {
        void persistSessionIfNeeded(sessionId, messages);
        startNewChatSession();
        setSessionNotice(null);
        setIsPanelOpen(true);
    };

    const handleClosePanel = () => {
        setIsPanelOpen(false);
        setPanelView("chat");
        void persistSessionIfNeeded(sessionId, messages);
    };

    const handleBackToSessions = () => {
        setPanelView("sessions");
        void (async () => {
            await persistSessionIfNeeded(sessionId, messages);
            await loadSessionItems();
        })();
    };

    const openSessionItem = (item: CurationChatSessionSummary) => {
        setSessionId(item.sessionId);
        setMessages(item.messages.length ? toCurateMessages(item.messages) : [getDefaultAssistantMessage()]);
        setInputValue("");
        setPanelView("chat");
    };

    return (
        <aside className="right-sidebar">
            <div className={`curation-chat-shell ${isPanelOpen ? "is-open" : ""}`} ref={shellRef}>
                <section
                    id="curation-chat-panel"
                    className={`curation-chat-panel ${isPanelOpen ? "is-open" : ""}`}
                    aria-label="Curate your feed"
                    aria-hidden={!isPanelOpen}
                >
                    <header className="curation-chat-header">
                        {panelView === "chat" ? (
                            <button
                                type="button"
                                className="curation-chat-back"
                                onClick={handleBackToSessions}
                                aria-label="Show previous chats"
                            >
                                ←
                            </button>
                        ) : (
                            <span className="curation-chat-back curation-chat-back-ghost" aria-hidden="true">
                                ←
                            </span>
                        )}
                        <div className="curation-chat-heading">
                            <h2>Curate</h2>
                        </div>
                        <button
                            type="button"
                            className="curation-chat-close"
                            onClick={handleClosePanel}
                            aria-label="Close curate panel"
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    </header>

                    {panelView === "sessions" ? (
                        <div className="curation-session-list">
                            <button
                                type="button"
                                className="curation-session-new"
                                onClick={() => {
                                    startNewChatSession();
                                }}
                            >
                                + New chat
                            </button>

                            {isSessionItemsLoading ? (
                                <div className="curation-session-state">Loading previous chats...</div>
                            ) : sessionItemsError ? (
                                <div className="curation-session-state">{sessionItemsError}</div>
                            ) : sessionItems.length === 0 ? (
                                <div className="curation-session-state">No previous chats yet.</div>
                            ) : (
                                <div className="curation-session-items">
                                    {sessionItems.map((item) => (
                                        <button
                                            key={item.sessionId}
                                            type="button"
                                            className="curation-session-item"
                                            onClick={() => openSessionItem(item)}
                                        >
                                            <div className="curation-session-preview">{item.preview}</div>
                                            <div className="curation-session-meta">{formatSessionTime(item.updatedAtMs)}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
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
                                <button
                                    type="submit"
                                    disabled={isSending || !inputValue.trim()}
                                    aria-label="Send message"
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                        <path d="M3 20.25L20.5 12L3 3.75V10.5L14 12L3 13.5V20.25Z" />
                                    </svg>
                                </button>
                            </form>

                            {sessionNotice && <p className="curation-chat-notice">{sessionNotice}</p>}
                        </>
                    )}
                </section>

                {!isPanelOpen && (
                    <button
                        type="button"
                        className="curation-trigger"
                        aria-expanded={isPanelOpen}
                        aria-controls="curation-chat-panel"
                        onClick={handleOpenPanel}
                    >
                        Curate
                    </button>
                )}
            </div>
        </aside>
    );
}
