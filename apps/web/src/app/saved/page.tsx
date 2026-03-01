"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import RightSidebar from "@/components/RightSidebar";
import PostCard from "@/components/PostCard";
import { useFeed } from "@/hooks/useFeed";
import { useCollections } from "@/hooks/useCollections";
import type { Collection } from "@/hooks/useCollections";
import {
    BsArrowLeft,
    BsFolder2,
    BsFolderPlus,
    BsPencil,
    BsTrash,
    BsCheck2,
    BsX,
} from "react-icons/bs";

/* ── Collection Detail (posts inside a collection) ──────────── */

function CollectionDetail({
    collection,
    onBack,
    onRename,
    onDelete,
}: {
    collection: Collection;
    onBack: () => void;
    onRename: (id: string, newName: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
}) {
    const {
        items,
        loading,
        loadingMore,
        error,
        hasMore,
        loadMore,
        toggleLike,
        toggleSave,
        markAsRead,
    } = useFeed(null, "saved", collection.id);

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(collection.name);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const isDefault = collection.name === "Default Collection";

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleRename = async () => {
        const trimmed = editName.trim();
        if (!trimmed || trimmed === collection.name) {
            setIsEditing(false);
            setEditName(collection.name);
            return;
        }
        const ok = await onRename(collection.id, trimmed);
        if (ok) {
            setIsEditing(false);
        } else {
            setEditName(collection.name);
            setIsEditing(false);
        }
    };

    const handleDelete = async () => {
        await onDelete(collection.id);
        onBack();
    };

    return (
        <main className="feed">
            <div className="feed-header">
                <div className="collection-detail-header">
                    <button
                        type="button"
                        className="collection-back-btn"
                        onClick={onBack}
                        aria-label="Back to collections"
                    >
                        <BsArrowLeft size={18} />
                    </button>

                    {isEditing ? (
                        <div className="collection-rename-row">
                            <input
                                ref={inputRef}
                                className="collection-rename-input"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleRename();
                                    if (e.key === "Escape") {
                                        setIsEditing(false);
                                        setEditName(collection.name);
                                    }
                                }}
                                maxLength={60}
                            />
                            <button
                                type="button"
                                className="collection-rename-action confirm"
                                onClick={() => void handleRename()}
                                aria-label="Confirm rename"
                            >
                                <BsCheck2 size={16} />
                            </button>
                            <button
                                type="button"
                                className="collection-rename-action cancel"
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditName(collection.name);
                                }}
                                aria-label="Cancel rename"
                            >
                                <BsX size={16} />
                            </button>
                        </div>
                    ) : (
                        <h1 className="collection-detail-title">{collection.name}</h1>
                    )}

                    {!isDefault && !isEditing && (
                        <div className="collection-detail-actions">
                            <button
                                type="button"
                                className="collection-action-btn"
                                onClick={() => {
                                    setEditName(collection.name);
                                    setIsEditing(true);
                                }}
                                aria-label="Rename collection"
                                title="Rename"
                            >
                                <BsPencil size={14} />
                            </button>
                            <button
                                type="button"
                                className="collection-action-btn danger"
                                onClick={() => setShowDeleteConfirm(true)}
                                aria-label="Delete collection"
                                title="Delete"
                            >
                                <BsTrash size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="feed-posts-container">
                {error && (
                    <div
                        style={{
                            padding: 20,
                            color: "var(--danger)",
                            textAlign: "center",
                        }}
                    >
                        {error}
                    </div>
                )}

                {loading ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Loading posts…
                    </div>
                ) : items.length === 0 && !error ? (
                    <div className="collection-empty-state">
                        <BsFolder2 size={40} />
                        <p>No posts saved in this collection yet.</p>
                    </div>
                ) : (
                    <div className="feed-posts-slides">
                        {items.map(
                            ({
                                post,
                                isLiked,
                                isSaved,
                                authorName,
                                authorAvatar,
                            }) => (
                                <div key={post.id} className="feed-slide-shell">
                                    <PostCard
                                        post={post}
                                        isLiked={isLiked}
                                        isSaved={isSaved}
                                        authorName={authorName}
                                        authorAvatar={authorAvatar}
                                        onLikeToggle={() => toggleLike(post.id)}
                                        onSaveToggle={() => toggleSave(post.id)}
                                        onInteraction={({ type }) => {
                                            if (
                                                type === "flip" ||
                                                type === "source"
                                            ) {
                                                markAsRead(post.id);
                                            }
                                        }}
                                        variant={
                                            post.post_type === "carousel"
                                                ? "slide"
                                                : "default"
                                        }
                                    />
                                </div>
                            ),
                        )}

                        {hasMore && items.length > 0 && !error && (
                            <button
                                type="button"
                                className="feed-recces-load-more"
                                onClick={loadMore}
                                disabled={loadingMore}
                                style={{
                                    width: "100%",
                                    background: "transparent",
                                    border: "none",
                                    cursor: loadingMore
                                        ? "not-allowed"
                                        : "pointer",
                                }}
                            >
                                {loadingMore ? "Loading more..." : "Load more"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
                <div
                    className="auth-overlay"
                    onClick={() => setShowDeleteConfirm(false)}
                >
                    <div
                        className="collection-delete-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2>Delete collection?</h2>
                        <p>
                            &ldquo;{collection.name}&rdquo; and all posts saved
                            in it will be permanently removed.
                        </p>
                        <div className="collection-delete-actions">
                            <button
                                type="button"
                                className="collection-delete-btn danger"
                                onClick={() => void handleDelete()}
                            >
                                Delete
                            </button>
                            <button
                                type="button"
                                className="collection-delete-btn cancel"
                                onClick={() => setShowDeleteConfirm(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

/* ── Collections List View ──────────────────────────────────── */

function CollectionsList({
    collections,
    loading,
    error,
    onSelect,
    onCreate,
}: {
    collections: Collection[];
    loading: boolean;
    error: string | null;
    onSelect: (c: Collection) => void;
    onCreate: (name: string) => Promise<Collection | null>;
}) {
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const createInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (showCreate && createInputRef.current) {
            createInputRef.current.focus();
        }
    }, [showCreate]);

    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        setCreating(true);
        const result = await onCreate(trimmed);
        setCreating(false);
        if (result) {
            setNewName("");
            setShowCreate(false);
        }
    };

    return (
        <main className="feed">
            <div className="feed-header">
                <div
                    className="feed-header-top"
                    style={{ paddingBottom: 12 }}
                >
                    <h1>Saved</h1>
                </div>
            </div>

            <div className="feed-posts-container">
                {error && (
                    <div
                        style={{
                            padding: 20,
                            color: "var(--danger)",
                            textAlign: "center",
                        }}
                    >
                        {error}
                    </div>
                )}

                {loading ? (
                    <div
                        style={{
                            padding: 40,
                            textAlign: "center",
                            color: "var(--text-secondary)",
                        }}
                    >
                        Loading collections…
                    </div>
                ) : (
                    <div className="collections-list">
                        {collections.map((collection) => (
                            <button
                                key={collection.id}
                                type="button"
                                className="collection-card"
                                onClick={() => onSelect(collection)}
                            >
                                <div className="collection-card-icon">
                                    <BsFolder2 size={22} />
                                </div>
                                <div className="collection-card-info">
                                    <span className="collection-card-name">
                                        {collection.name}
                                    </span>
                                    <span className="collection-card-count">
                                        {collection.postCount}{" "}
                                        {collection.postCount === 1
                                            ? "post"
                                            : "posts"}
                                    </span>
                                </div>
                            </button>
                        ))}

                        {/* New collection inline / button */}
                        {showCreate ? (
                            <div className="collection-create-row">
                                <input
                                    ref={createInputRef}
                                    className="collection-create-input"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Collection name…"
                                    maxLength={60}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                            void handleCreate();
                                        if (e.key === "Escape") {
                                            setShowCreate(false);
                                            setNewName("");
                                        }
                                    }}
                                    disabled={creating}
                                />
                                <button
                                    type="button"
                                    className="collection-create-confirm"
                                    onClick={() => void handleCreate()}
                                    disabled={creating || !newName.trim()}
                                >
                                    {creating ? "…" : <BsCheck2 size={16} />}
                                </button>
                                <button
                                    type="button"
                                    className="collection-create-cancel"
                                    onClick={() => {
                                        setShowCreate(false);
                                        setNewName("");
                                    }}
                                >
                                    <BsX size={18} />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="collection-card collection-card-new"
                                onClick={() => setShowCreate(true)}
                            >
                                <div className="collection-card-icon new">
                                    <BsFolderPlus size={22} />
                                </div>
                                <div className="collection-card-info">
                                    <span className="collection-card-name">
                                        New Collection
                                    </span>
                                </div>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}

/* ── Saved Page (top-level) ─────────────────────────────────── */

export default function SavedPage() {
    const [mode, setMode] = useState("ALL");
    const [profile, setProfile] = useState("Steve Jobs");
    const [selectedCollection, setSelectedCollection] =
        useState<Collection | null>(null);

    const {
        collections,
        loading,
        error,
        createCollection,
        renameCollection,
        deleteCollection,
        refresh,
    } = useCollections();

    const handleBack = useCallback(() => {
        setSelectedCollection(null);
        refresh();
    }, [refresh]);

    return (
        <div className="app-layout">
            <Sidebar />

            {selectedCollection ? (
                <CollectionDetail
                    key={selectedCollection.id}
                    collection={selectedCollection}
                    onBack={handleBack}
                    onRename={renameCollection}
                    onDelete={deleteCollection}
                />
            ) : (
                <CollectionsList
                    collections={collections}
                    loading={loading}
                    error={error}
                    onSelect={setSelectedCollection}
                    onCreate={createCollection}
                />
            )}

            <RightSidebar
                mode={mode}
                onModeChange={setMode}
                profile={profile}
                onProfileChange={setProfile}
            />
        </div>
    );
}
