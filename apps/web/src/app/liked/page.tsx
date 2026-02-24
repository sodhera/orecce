"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import FeedList from "@/components/FeedList";
import RightSidebar from "@/components/RightSidebar";

export default function LikedPage() {
    const [mode, setMode] = useState("ALL");
    const [profile, setProfile] = useState("Steve Jobs");

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
