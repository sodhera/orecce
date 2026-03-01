"use client";

import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import RightSidebar from "@/components/RightSidebar";
import { useTabState } from "@/hooks/useTabState";

export default function FeedPage() {
  const [mode, setMode] = useTabState("orecce:web:page:feed:mode:v1", "ALL");
  const [profile, setProfile] = useTabState("orecce:web:page:feed:profile:v1", "Steve Jobs");

  return (
    <div className="app-layout">
      <Sidebar />
      <Feed mode={mode} profile={profile} onModeChange={setMode} />
      <RightSidebar
        mode={mode}
        onModeChange={setMode}
        profile={profile}
        onProfileChange={setProfile}
      />
    </div>
  );
}
