"use client";

import { useMemo, useState } from "react";
import { useAuthors } from "@/hooks/useAuthors";

const INTEREST_OPTIONS = [
    "Startups",
    "Gym",
    "AI",
    "Health",
    "Personal Finance",
    "News",
    "Science",
    "Philosophy",
    "Self Improvement",
    "Technology",
    "Business",
    "Productivity",
];

type SlideId = "welcome" | "interests" | "recces";

const SLIDES: Array<{
    id: SlideId;
    icon: string;
    title: string;
    description: string;
}> = [
        {
            id: "welcome",
            icon: "✨",
            title: "Welcome to Orecce",
            description:
                "Before we show your feed, let's tune it around what you want to learn and follow.",
        },
        {
            id: "interests",
            icon: "🎯",
            title: "Pick your interests",
            description:
                "Choose a few areas you want to see more often in your daily feed.",
        },
        {
            id: "recces",
            icon: "👥",
            title: "Follow some Recces",
            description:
                "Based on your interests, here are some Recces we recommend. Follow them to fill your feed.",
        },
    ];

export interface HomeOnboardingData {
    interests: string[];
    followedRecceIds: string[];
    notes: string;
}

interface HomeOnboardingProps {
    userName?: string;
    onComplete: (data: HomeOnboardingData) => void;
}

function toggleOption(
    selected: string[],
    option: string,
    setSelected: (next: string[]) => void,
) {
    if (selected.includes(option)) {
        setSelected(selected.filter((item) => item !== option));
        return;
    }
    setSelected([...selected, option]);
}

export default function HomeOnboarding({
    userName,
    onComplete,
}: HomeOnboardingProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [interests, setInterests] = useState<string[]>([]);
    const [selectedRecceIds, setSelectedRecceIds] = useState<string[]>([]);
    const { authors, followedIds, loading: authorsLoading, toggleFollow } = useAuthors();

    const isLastSlide = currentIndex === SLIDES.length - 1;
    const currentSlide = SLIDES[currentIndex];

    const payload = useMemo<HomeOnboardingData>(
        () => ({
            interests,
            followedRecceIds: selectedRecceIds,
            notes: "",
        }),
        [interests, selectedRecceIds],
    );

    const handleFollowRecce = (authorId: string) => {
        // Toggle in local selection state
        setSelectedRecceIds((prev) =>
            prev.includes(authorId)
                ? prev.filter((id) => id !== authorId)
                : [...prev, authorId],
        );
        // Also toggle in the actual follow system
        toggleFollow(authorId);
    };

    const goNext = () => {
        if (isLastSlide) {
            onComplete(payload);
            return;
        }
        setCurrentIndex((prev) => prev + 1);
    };

    const goBack = () => {
        if (currentIndex === 0) {
            return;
        }
        setCurrentIndex((prev) => prev - 1);
    };

    return (
        <div className="home-onboarding">
            <div className="home-onboarding-card">
                <div className="home-onboarding-topbar">
                    <span className="home-onboarding-step">
                        Step {currentIndex + 1} of {SLIDES.length}
                    </span>
                    <button
                        type="button"
                        className="home-onboarding-skip"
                        onClick={() => onComplete(payload)}
                    >
                        Skip for now
                    </button>
                </div>

                <div className="home-onboarding-dots" aria-hidden="true">
                    {SLIDES.map((slide, index) => (
                        <span
                            key={slide.id}
                            className={`home-onboarding-dot ${index === currentIndex ? "active" : ""}`}
                        />
                    ))}
                </div>

                <div className="home-onboarding-slide">
                    <div className="home-onboarding-icon">{currentSlide.icon}</div>
                    <h1 className="home-onboarding-title">
                        {currentSlide.title}
                        {currentSlide.id === "welcome" && userName
                            ? `, ${userName}`
                            : ""}
                    </h1>
                    <p className="home-onboarding-description">
                        {currentSlide.description}
                    </p>

                    {currentSlide.id === "interests" && (
                        <div className="home-onboarding-chip-grid">
                            {INTEREST_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    className={`home-onboarding-chip ${interests.includes(option) ? "active" : ""}`}
                                    onClick={() =>
                                        toggleOption(
                                            interests,
                                            option,
                                            setInterests,
                                        )
                                    }
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    )}

                    {currentSlide.id === "recces" && (
                        <div className="home-onboarding-recces">
                            {authorsLoading ? (
                                <div className="home-onboarding-recces-loading">
                                    Loading recces…
                                </div>
                            ) : authors.length === 0 ? (
                                <div className="home-onboarding-recces-empty">
                                    No recces available yet. You can discover them later!
                                </div>
                            ) : (
                                <div className="home-onboarding-recces-list">
                                    {authors.map((author) => {
                                        const isSelected =
                                            selectedRecceIds.includes(author.id) ||
                                            followedIds.has(author.id);
                                        return (
                                            <div
                                                key={author.id}
                                                className="home-onboarding-recce-item"
                                            >
                                                <div className="home-onboarding-recce-avatar">
                                                    {author.name?.charAt(0).toUpperCase() || "?"}
                                                </div>
                                                <div className="home-onboarding-recce-info">
                                                    <span className="home-onboarding-recce-name">
                                                        {author.name}
                                                    </span>
                                                    {author.bio && (
                                                        <span className="home-onboarding-recce-bio">
                                                            {author.bio}
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`home-onboarding-recce-follow-btn ${isSelected ? "following" : ""}`}
                                                    onClick={() =>
                                                        handleFollowRecce(author.id)
                                                    }
                                                >
                                                    {isSelected
                                                        ? "Following"
                                                        : "Follow"}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="home-onboarding-actions">
                    <button
                        type="button"
                        className="home-onboarding-back"
                        onClick={goBack}
                        disabled={currentIndex === 0}
                    >
                        Back
                    </button>
                    <button
                        type="button"
                        className="home-onboarding-next"
                        onClick={goNext}
                    >
                        {isLastSlide ? "Start feed" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}
