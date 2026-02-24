import type { Metadata } from "next";
import "./theme.css";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AuthModal from "@/components/AuthModal";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "Orecce",
  description: "Your feed, your way.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AuthGate>{children}</AuthGate>
            <AuthModal />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
