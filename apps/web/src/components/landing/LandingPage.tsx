"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "@/context/AuthContext";
import Carousel from "./Carousel";
import ThemeToggle from "./ThemeToggle";
import styles from "./LandingPage.module.css";

type AuthMode = "login" | "signup" | "forgot";

export default function LandingPage() {
  const { isAuthenticated, login, signup, loginWithGoogle, resetPassword } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email) {
      setError("Please fill in all fields");
      return;
    }
    if (authMode !== "forgot" && !password) {
      setError("Please fill in all fields");
      return;
    }
    if (authMode === "signup" && !name) {
      setError("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      if (authMode === "login") {
        await login(email, password);
      } else if (authMode === "signup") {
        const result = await signup(name, email, password);
        if (result === "verification_required") {
          setAuthMode("login");
          setPassword("");
          setNotice("Check your email and verify your account before logging in.");
          return;
        }
      } else {
        await resetPassword(email);
        setNotice("Password reset email sent. Check your inbox.");
      }
      setName("");
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
              <h2>
                {isAuthenticated
                  ? "Welcome back"
                  : authMode === "signup"
                    ? "Create Account"
                    : authMode === "forgot"
                      ? "Reset Password"
                      : "Get Started"}
              </h2>

              {isAuthenticated ? (
                <div className={styles.loggedInPanel}>
                  <Link href="/feed" className={styles.feedBtn}>
                    Continue to Feed
                  </Link>
                </div>
              ) : (
                <>
                  {error && <div className={styles.error}>{error}</div>}
                  {notice && <div className={styles.success}>{notice}</div>}

                  <form onSubmit={handleAuthSubmit} style={{ width: "100%" }}>
                    {authMode === "signup" && (
                      <div className={styles.inputGroup}>
                        <label className={styles.inputLabel} htmlFor="landing-name">
                          Full name
                        </label>
                        <input
                          id="landing-name"
                          type="text"
                          placeholder="Your name"
                          className={styles.inputField}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          autoComplete="name"
                          disabled={submitting}
                        />
                      </div>
                    )}

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

                    {authMode !== "forgot" && (
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
                          autoComplete={
                            authMode === "signup" ? "new-password" : "current-password"
                          }
                          disabled={submitting}
                        />
                      </div>
                    )}

                    <button type="submit" className={styles.primaryBtn} disabled={submitting}>
                      {submitting
                        ? "Please wait..."
                        : authMode === "login"
                          ? "Log In"
                          : authMode === "signup"
                            ? "Create Account"
                            : "Send Reset Link"}
                    </button>
                  </form>

                  <div className={styles.authFooter}>
                    <button
                      type="button"
                      className={styles.authLink}
                      onClick={() => {
                        setAuthMode((prev) =>
                          prev === "forgot" ? "login" : "forgot",
                        );
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      {authMode === "forgot" ? "Back to login" : "Forgot password?"}
                    </button>
                    <button
                      type="button"
                      className={styles.authLink}
                      onClick={() => {
                        setAuthMode(authMode === "signup" ? "login" : "signup");
                        setError(null);
                        setNotice(null);
                      }}
                    >
                      {authMode === "signup" ? "Log in" : "Sign up"}
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
