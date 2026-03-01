"use client";

import Sidebar from "@/components/Sidebar";
import FeedList from "@/components/FeedList";
import RightSidebar from "@/components/RightSidebar";
import { useTabState } from "@/hooks/useTabState";

export default function LikedPage() {
    const [mode, setMode] = useTabState("orecce:web:page:liked:mode:v1", "ALL");
    const [profile, setProfile] = useTabState("orecce:web:page:liked:profile:v1", "Steve Jobs");

    return (
        <div className="app-layout">
            <Sidebar />
            <FeedList title="Liked" feedMode="liked" />
            <RightSidebar
                mode={mode}
                onModeChange={setMode}
                profile={profile}
                onProfileChange={setProfile}
            />
        </div>
    );
}
