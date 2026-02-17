"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import RightSidebar from "@/components/RightSidebar";
import HomeOnboarding, {
  type HomeOnboardingData,
} from "@/components/HomeOnboarding";
import { useAuth } from "@/context/AuthContext";

function onboardingCompleteKey(userId: string): string {
  return `orecce:onboarding:complete:${userId}`;
}

function onboardingPayloadKey(userId: string): string {
  return `orecce:onboarding:payload:${userId}`;
}

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState("ALL");
  const [profile, setProfile] = useState("Steve Jobs");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !user) {
      setShowOnboarding(false);
      setOnboardingReady(true);
      return;
    }

    const completed =
      window.localStorage.getItem(onboardingCompleteKey(user.id)) === "true";
    setShowOnboarding(!completed);
    setOnboardingReady(true);
  }, [loading, isAuthenticated, user]);

  const completeOnboarding = (data: HomeOnboardingData) => {
    if (!user) return;

    window.localStorage.setItem(onboardingCompleteKey(user.id), "true");
    window.localStorage.setItem(
      onboardingPayloadKey(user.id),
      JSON.stringify({
        ...data,
        completedAtMs: Date.now(),
      }),
    );
    setShowOnboarding(false);
  };

  const isOnboardingVisible =
    isAuthenticated && onboardingReady && showOnboarding;

  if (loading || (isAuthenticated && !onboardingReady)) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="feed">
          <div className="onboarding-loading">Preparing your home feed...</div>
        </main>
        <aside className="right-sidebar" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      {isOnboardingVisible ? (
        <>
          <main className="feed">
            <HomeOnboarding
              userName={user?.name}
              onComplete={completeOnboarding}
            />
          </main>
          <aside className="right-sidebar" aria-hidden="true" />
        </>
      ) : (
        <>
          <Feed mode={mode} profile={profile} onModeChange={setMode} />
          <RightSidebar
            mode={mode}
            onModeChange={setMode}
            profile={profile}
            onProfileChange={setProfile}
          />
        </>
      )}
    </div>
  );
}
