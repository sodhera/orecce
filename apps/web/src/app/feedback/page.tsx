"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useTabState } from "@/hooks/useTabState";

type FeedbackCategory = "Bug" | "Feature Request" | "Feedback" | "Other";

const CATEGORIES: { value: FeedbackCategory; label: string; emoji: string; desc: string }[] = [
    { value: "Feedback", label: "General Suggestion", emoji: "💡", desc: "Share an idea or thought" },
    { value: "Feature Request", label: "Feature Request", emoji: "✨", desc: "Request a new feature" },
    { value: "Bug", label: "Report a Bug", emoji: "🐛", desc: "Something isn't working" },
    { value: "Other", label: "Other", emoji: "💬", desc: "Anything else on your mind" },
];

export default function FeedbackPage() {
    const { user } = useAuth();
    const [mode, setMode] = useTabState("orecce:web:page:feedback:mode:v1", "ALL");
    const [profile, setProfile] = useTabState("orecce:web:page:feedback:profile:v1", "Steve Jobs");

    const [category, setCategory] = useTabState<FeedbackCategory>(
        "orecce:web:page:feedback:category:v1",
        "Feedback",
    );
    const [message, setMessage] = useTabState("orecce:web:page:feedback:message:v1", "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);
    const [errorMsg, setErrorMsg] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            const { error } = await supabase
                .from("user_feedback")
                .insert({
                    category,
                    message: message.trim(),
                    user_id: user?.id || null,
                });

            if (error) throw error;

            setSubmitStatus("success");
            setMessage("");
            setCategory("Feedback");
            trackAnalyticsEvent({
                eventName: "feedback_submitted",
                surface: "feedback",
                properties: {
                    feedback_category: category,
                    message_length: message.trim().length,
                },
            });
        } catch (err: any) {
            setErrorMsg(err.message || "Failed to submit. Please try again.");
            setSubmitStatus("error");
            trackAnalyticsEvent({
                eventName: "feedback_submit_failed",
                surface: "feedback",
                properties: {
                    feedback_category: category,
                    error_code: err?.message ?? "unknown",
                },
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Since there's no dynamic selection, selectedCat will always be the default "Feedback" category.
    // We can directly use the default or find it once.
    const selectedCat = CATEGORIES.find(c => c.value === "Feedback")!;

    return (
        <div className="app-layout">
            <Sidebar />

            <main className="feed">
                <div className="feed-header">
                    <div className="feed-header-top" style={{ paddingBottom: 12 }}>
                        <h1>Feedback</h1>
                    </div>
                </div>

                <div className="fb-page">
                    {/* Success state */}
                    {submitStatus === "success" ? (
                        <div className="fb-success">
                            <div className="fb-success-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                            </div>
                            <h3 className="fb-success-title">Message received!</h3>
                            <p className="fb-success-body">Thanks for helping us make Orecce better. We read every piece of feedback.</p>
                            <button className="fb-success-reset" onClick={() => setSubmitStatus(null)}>
                                Send another
                            </button>
                        </div>
                    ) : (
                        <form className="fb-form" onSubmit={handleSubmit}>
                            {/* Message */}
                            <div className="fb-field">
                                <h2 className="fb-hero-title" style={{ paddingBottom: '16px', textAlign: 'left', fontSize: '24px' }}>How can we improve?</h2>
                                <textarea
                                    id="fb-message"
                                    className="fb-textarea"
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Share your thoughts — report bugs, request features, or just say hi..."
                                    rows={5}
                                    disabled={isSubmitting}
                                />
                                <span className="fb-char-count">{message.length} / 1000</span>
                            </div>

                            {/* Error */}
                            {submitStatus === "error" && (
                                <div className="fb-error">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    {errorMsg}
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                className="fb-submit"
                                disabled={isSubmitting || !message.trim()}
                            >
                                {isSubmitting ? (
                                    <span className="fb-submit-spinner" />
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                )}
                                {isSubmitting ? "Sending…" : "Send Feedback"}
                            </button>
                        </form>
                    )}
                </div>
            </main>

            <RightSidebar
                mode={mode}
                onModeChange={setMode}
                profile={profile}
                onProfileChange={setProfile}
            />
        </div>
    );
}
