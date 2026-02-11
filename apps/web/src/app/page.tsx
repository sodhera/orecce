"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import RightSidebar from "@/components/RightSidebar";

export default function Home() {
  const [mode, setMode] = useState("ALL");
  const [profile, setProfile] = useState("Steve Jobs");

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

