"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/context/AuthContext";
import Carousel from "./Carousel";
import ThemeToggle from "./ThemeToggle";
import styles from "./LandingPage.module.css";

export default function LandingPage() {
  const { isAuthenticated, login, loginWithGoogle, setShowAuthModal } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
      setEmail("");
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`${styles.shell} ${isDarkMode ? styles.dark : ""}`}>
      <div className={styles.topNavWrap}>
        <nav className={styles.topNav}>
          <div className={styles.brand}>Orecce</div>
          <ThemeToggle
            isDark={isDarkMode}
            toggleTheme={() => setIsDarkMode((prev) => !prev)}
          />
        </nav>
      </div>

      <main className={styles.main}>
        <div className={styles.grid}>
          <section className={styles.left}>
            <div className={styles.content}>
              <h1 className={styles.headline}>
                <span className={styles.strikethrough}>Social Media</span>{" "}
                Self-Media.
                <br />
                Take control of your feed.
              </h1>

              <Carousel />
            </div>
          </section>

          <section className={styles.right}>
            <div className={styles.authContainer}>
              <h2>{isAuthenticated ? "Welcome back" : "Get Started"}</h2>
              <p className={styles.authSubtitle}>
                {isAuthenticated
                  ? "Your account is ready. Open your personalized feed."
                  : "Build a healthier content diet in minutes."}
              </p>

              {isAuthenticated ? (
                <div className={styles.loggedInPanel}>
                  <Link href="/feed" className={styles.feedBtn}>
                    Continue to Feed
                  </Link>
                </div>
              ) : (
                <>
                  {error && <div className={styles.error}>{error}</div>}

                  <form onSubmit={handleLogin} style={{ width: "100%" }}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel} htmlFor="landing-email">
                        Email
                      </label>
                      <input
                        id="landing-email"
                        type="email"
                        placeholder="name@example.com"
                        className={styles.inputField}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        disabled={submitting}
                      />
                    </div>

                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel} htmlFor="landing-password">
                        Password
                      </label>
                      <input
                        id="landing-password"
                        type="password"
                        placeholder="••••••••"
                        className={styles.inputField}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        disabled={submitting}
                      />
                    </div>

                    <button type="submit" className={styles.primaryBtn} disabled={submitting}>
                      {submitting ? "Logging in..." : "Log In"}
                    </button>
                  </form>

                  <div className={styles.authFooter}>
                    <button
                      type="button"
                      className={styles.authLink}
                      onClick={() => setShowAuthModal(true)}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      className={styles.authLink}
                      onClick={() => setShowAuthModal(true)}
                    >
                      Sign up
                    </button>
                  </div>

                  <div className={styles.divider}>
                    <span>or</span>
                  </div>

                  <button
                    type="button"
                    className={styles.googleBtn}
                    disabled={submitting}
                    onClick={async () => {
                      setError(null);
                      setSubmitting(true);
                      try {
                        await loginWithGoogle();
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    <FcGoogle size={22} />
                    <span>Continue with Google</span>
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
