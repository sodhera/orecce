"use client";

import { useState } from "react";

interface RightSidebarProps {
    mode: string;
    onModeChange: (mode: string) => void;
    profile: string;
    onProfileChange: (profile: string) => void;
}

export default function RightSidebar(_: RightSidebarProps) {
    const [isCurateExpanded, setIsCurateExpanded] = useState(false);

    return (
        <aside className="right-sidebar">
            <div
                className={`curation-buddy-card ${isCurateExpanded ? 'expanded' : ''}`}
                onClick={() => setIsCurateExpanded(!isCurateExpanded)}
                role="button"
                tabIndex={0}
            >
                <div className="curation-buddy-header">
                    <span className="curation-buddy-icon">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                            <path d="M11 4H4V20H20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </span>
                    <h2 className="curation-buddy-title">Curate</h2>
                </div>
                <div className="curation-buddy-content">
                    <div
                        className="curation-buddy-input-mockup"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside input
                    >
                        <span className="curation-buddy-placeholder">Curate your feed...</span>
                        <div className="curation-buddy-send">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor" />
                            </svg>
                        </div>
                    </div>
                    <p className="curation-buddy-text">
                        Tell Orecce what you want your timeline to look like. Eg: Posts on Medieval History, Comic panels, etc.
                    </p>
                </div>
            </div>
        </aside>
    );
}
