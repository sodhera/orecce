"use client";

import Sidebar from "@/components/Sidebar";
import Feed from "@/components/Feed";
import RightSidebar from "@/components/RightSidebar";

export default function Home() {
  return (
    <div className="app-layout">
      <Sidebar />
      <Feed />
      <RightSidebar />
    </div>
  );
}
