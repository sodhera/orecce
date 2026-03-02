"use client";

import React from "react";

export default function PostCardSkeleton() {
    return (
        <article className="ig-post skeleton-card">
            {/* ── Author header (above the square) ── */}
            <div className="ig-post-header">
                <div className="ig-post-author">
                    <div className="ig-post-author-info" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div className="skeleton-line skeleton-author-name" />
                        <span className="ig-post-author-dot">·</span>
                        <div className="skeleton-line skeleton-topic" />
                    </div>
                </div>
            </div>

            {/* ── Square content card ── */}
            <div className="ig-post-square skeleton-square" style={{ backgroundColor: 'var(--bg-border)' }} />

            {/* ── Actions row (below the square) ── */}
            <div className="ig-post-actions">
                <div className="ig-post-actions-left">
                    <div className="skeleton-icon" />
                </div>
                <div className="ig-post-actions-right" style={{ display: 'flex', gap: '16px' }}>
                    <div className="skeleton-icon" />
                    <div className="skeleton-icon" />
                </div>
            </div>

            {/* ── Caption (theme) below actions ── */}
            <div className="ig-post-caption" style={{ paddingTop: '4px' }}>
                <div className="skeleton-line skeleton-caption" />
            </div>
        </article>
    );
}
