"use client";

import React from "react";

export default function RecceSkeleton() {
    return (
        <article className="author-card skeleton-card">
            <div className="author-card-info" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="skeleton-line skeleton-recce-name" />
                <div className="skeleton-line skeleton-recce-bio" />
            </div>
            <div className="skeleton-line skeleton-recce-btn" />
        </article>
    );
}
