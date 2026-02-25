import { useState, useEffect } from "react";
import { FcGoogle } from "react-icons/fc";
import { ThemeToggle } from "./components/home/ThemeToggle";
import { Carousel } from "./components/home/Carousel";
function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <div className="app-shell">
      {/* Top Navigation */}
      <div className="top-nav-wrap">
        <nav className="top-nav" style={{ justifyContent: 'space-between' }}>
          <div className="brand">Orecce</div>
          <ThemeToggle isDark={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />
        </nav>
      </div>

      {/* Main Split Interface */}
      <main className="app-main">
        <div className="landing-grid">

          {/* 75% Left Side */}
          <div className="landing-left">
            <div className="content-wrapper">
              <h1 className="hero-headline">
                <span className="strikethrough">Social Media</span> Self-Media.<br />
                Take control of your feed.
              </h1>

              <Carousel />
            </div>
          </div>

          {/* 25% Right Side */}
          <div className="landing-right">
            <div className="auth-container">
              <h2>Get Started</h2>

              <div className="input-group">
                <label className="input-label">Email</label>
                <input type="email" placeholder="name@example.com" className="input-field" />
              </div>

              <div className="input-group">
                <label className="input-label">Password</label>
                <input type="password" placeholder="••••••••" className="input-field" />
              </div>

              <button className="btn-primary">
                Log In
              </button>

              <div className="auth-footer">
                <a href="#" className="auth-link">Forgot password?</a>
                <a href="#" className="auth-link">Sign up</a>
              </div>

              <div className="divider">
                <span>or</span>
              </div>

              <button className="google-btn">
                <FcGoogle size={22} />
                <span>Continue with google</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
