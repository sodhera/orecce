"use client";

import { useMemo, useState } from "react";

const INTEREST_OPTIONS = [
    "AI & ML",
    "Frontend",
    "Design",
    "Startups",
    "Marketing",
    "Developer Tools",
    "Product Strategy",
    "Mobile",
];

const CONTENT_PREFERENCE_OPTIONS = [
    "Deep dives",
    "Quick updates",
    "Case studies",
    "How-to guides",
    "News roundups",
    "Personal stories",
];

type SlideId = "welcome" | "interests" | "preferences";

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
            "Before we show your feed, let’s tune it around what you want to learn and follow.",
    },
    {
        id: "interests",
        icon: "🎯",
        title: "Pick your interests",
        description:
            "Choose a few areas you want to see more often in your daily feed.",
    },
    {
        id: "preferences",
        icon: "🧠",
        title: "Tell us your preferences",
        description:
            "Help us shape your feed with the formats and topics you care about most.",
    },
];

export interface HomeOnboardingData {
    interests: string[];
    contentPreferences: string[];
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
    const [contentPreferences, setContentPreferences] = useState<string[]>([]);
    const [notes, setNotes] = useState("");

    const isLastSlide = currentIndex === SLIDES.length - 1;
    const currentSlide = SLIDES[currentIndex];

    const payload = useMemo<HomeOnboardingData>(
        () => ({
            interests,
            contentPreferences,
            notes: notes.trim(),
        }),
        [interests, contentPreferences, notes],
    );

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

                    {currentSlide.id === "preferences" && (
                        <div className="home-onboarding-form">
                            <div className="home-onboarding-chip-grid">
                                {CONTENT_PREFERENCE_OPTIONS.map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        className={`home-onboarding-chip ${contentPreferences.includes(option) ? "active" : ""}`}
                                        onClick={() =>
                                            toggleOption(
                                                contentPreferences,
                                                option,
                                                setContentPreferences,
                                            )
                                        }
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>

                            <label
                                className="home-onboarding-label"
                                htmlFor="onboarding-notes"
                            >
                                Anything else you want in your feed?
                            </label>
                            <textarea
                                id="onboarding-notes"
                                className="home-onboarding-textarea"
                                placeholder="Example: I want more startup case studies and less breaking news."
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                            />
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
