"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import SavedFeed from "@/components/SavedFeed";
import RightSidebar from "@/components/RightSidebar";

export default function SavedPage() {
    const [mode, setMode] = useState("BIOGRAPHY");
    const [profile, setProfile] = useState("Steve Jobs");

    return (
        <div className="app-layout">
            <Sidebar />
            <SavedFeed />
            <RightSidebar
                mode={mode}
                onModeChange={setMode}
                profile={profile}
                onProfileChange={setProfile}
            />
        </div>
    );
}
